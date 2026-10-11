"""Per-series, per-period timestamp alignment of the EIA-930 extract (P04-DATA-004).

EIA-930 stamps are hour-ending (ingestion already subtracts 1 h: ts_base). Evidence in the file shows the CISO series do not share one convention over time:
generation (net generation and every fuel, solar anchored on astronomical solar noon) and demand change their timing at two dates, while interchange and the
day-ahead forecast do not. The correction is derived, not assumed:

1. Generation: daily solar centroid minus astronomical solar noon (analytics/solar.py); binary changepoint detection on that daily series (45-day windows,
   >= 0.5 h step, >= 60 days apart); per segment c_gen = -round(median offset) hours.
2. Demand D and interchange TI: per segment, the absolute shifts (c_D, c_TI) in [-3, 3] that minimise mean |NG_corrected - D - TI| (the EIA identity).
3. Day-ahead forecast DF: per segment, the shift c_DF in [-3, 3] that minimises MAPE of DF against corrected D.
4. Rows are moved by c hours. Rows within one local day of a boundary, for every series whose c changes there, are excluded and counted (the boundary hour is only
   known to a day); hours that collide after shifting are excluded too. Nothing is guessed: a BA with no step is left untouched.
Raw stamps are kept in the output (stamp_utc) and the manifest (data/manifests/timing_corrections.json).
"""
from __future__ import annotations

from datetime import timedelta

import numpy as np
import polars as pl

from analytics.solar import solar_noon_clock
from pipelines.common import BA_TZ, BAS, END, FUELS, INTERIM, MANIFESTS, START, write_json

PAD = 3
GROUPS = ("gen", "D", "TI", "DF")


def _group(kind: str) -> str:
    return {"D": "D", "DF": "DF", "TI": "TI"}.get(kind, "gen")  # NG total and every GEN fuel are the generation family


def daily_solar_offsets(ba: str, ts: np.ndarray, sun: np.ndarray):
    loc = pl.Series("t", ts.astype("datetime64[us]")).dt.replace_time_zone("UTC").dt.convert_time_zone(BA_TZ[ba])
    d = pl.DataFrame({"date": loc.dt.date(), "h": loc.dt.hour(), "s": np.clip(np.nan_to_num(sun), 0, None), "ok": ~np.isnan(sun)})
    g = d.group_by("date").agg(((pl.col("h") + 0.5) * pl.col("s")).sum().alias("a"), pl.col("s").sum().alias("b"), pl.col("ok").sum().alias("n"), pl.len().alias("rows")).sort("date")
    g = g.filter((pl.col("n") == 24) & (pl.col("rows") == 24) & (pl.col("b") > 0))
    dates = g["date"].to_list()
    off = np.array([a / b - solar_noon_clock(ba, dd) for a, b, dd in zip(g["a"], g["b"], dates)])
    return dates, off


def changepoints(off: np.ndarray, win: int = 45, thr: float = 0.5, sep: int = 60) -> list[int]:
    n = len(off)
    score = np.zeros(n)
    for i in range(win, n - win):
        score[i] = abs(off[i:i + win].mean() - off[i - win:i].mean())
    cps = []
    while n:
        i = int(score.argmax())
        if score[i] < thr:
            break
        cps.append(i)
        score[max(0, i - sep):i + sep] = 0
    return sorted(cps)


def _roll(x: np.ndarray, k: int) -> np.ndarray:
    y = np.full_like(x, np.nan)
    if k > 0:
        y[k:] = x[:-k]
    elif k < 0:
        y[:k] = x[-k:]
    else:
        y = x.copy()
    return y


def _mean_abs(a):
    a = a[np.isfinite(a)]
    return float(np.abs(a).mean()) if len(a) else float("inf")


def align_ba(ba: str, eia: pl.DataFrame) -> tuple[pl.DataFrame, dict]:
    t0 = np.datetime64(START, "h") - np.timedelta64(PAD, "h")
    t1 = np.datetime64(END, "h") + np.timedelta64(PAD, "h")
    ts = np.arange(t0, t1 + np.timedelta64(1, "h"))
    n = len(ts)
    d = eia.filter(pl.col("ba") == ba)

    def arr(kind, fuel=""):
        x = np.full(n, np.nan)
        s = d.filter((pl.col("kind") == kind) & (pl.col("fuel") == fuel))
        pos = ((s["ts_utc"].to_numpy().astype("datetime64[h]") - t0) // np.timedelta64(1, "h")).astype(int)
        x[pos] = s["value"].fill_null(np.nan).to_numpy().astype(float)
        return x

    sun, NG, D, DF, TI = arr("GEN", "SUN"), arr("NG"), arr("D"), arr("DF"), arr("TI")
    dates, off = daily_solar_offsets(ba, ts, sun)
    cps = changepoints(off)
    bounds = [dates[i] for i in cps]  # first local date of each new segment
    seg_edges = [None] + bounds + [None]
    loc_date = np.array(pl.Series("t", ts.astype("datetime64[us]")).dt.replace_time_zone("UTC").dt.convert_time_zone(BA_TZ[ba]).dt.date().to_list())
    seg = np.zeros(n, int)
    for b in bounds:
        seg += (loc_date >= b).astype(int)
    nseg = len(bounds) + 1
    di = np.array([np.searchsorted(np.array(dates), b) for b in bounds], int)
    seg_of_day = np.zeros(len(dates), int)
    for i in di:
        seg_of_day[i:] += 1
    # 1. generation shift per segment
    c = {g: [0] * nseg for g in GROUPS}
    seg_stats = []
    for s in range(nseg):
        med = float(np.median(off[seg_of_day == s]))
        c["gen"][s] = -int(round(med))
        seg_stats.append({"solar_offset_median_h": med, "days": int((seg_of_day == s).sum())})
    def move(x, cs):  # apply per-segment shift to a full-grid array
        y = np.full_like(x, np.nan)
        for s in range(nseg):
            m = np.where(seg == s)[0]
            tgt = m + cs[s]
            ok = (tgt >= 0) & (tgt < n)
            y[tgt[ok]] = x[m[ok]]
        return y
    NGc = move(NG, c["gen"])
    # 2. D and TI shifts per segment from the EIA identity
    for s in range(nseg):
        m = seg == s
        best = min(((_mean_abs((NGc - _roll(D, a) - _roll(TI, b))[m]), abs(a) + abs(b), a, b) for a in range(-PAD, PAD + 1) for b in range(-PAD, PAD + 1)))
        c["D"][s], c["TI"][s] = best[2], best[3]
        seg_stats[s]["identity_resid_mw_before"] = _mean_abs((NG - D - TI)[m])
        seg_stats[s]["identity_resid_mw_after"] = best[0]
    Dc = move(D, c["D"])
    # 3. DF shift per segment against corrected D
    for s in range(nseg):
        m = seg == s
        best = min(((_mean_abs(((_roll(DF, k) - Dc) / Dc)[m]), abs(k), k) for k in range(-PAD, PAD + 1)))
        c["DF"][s] = best[2]
        seg_stats[s]["df_mape_pct_before"] = 100 * _mean_abs(((DF - D) / D)[m])
        seg_stats[s]["df_mape_pct_after"] = 100 * best[0]
    # corrected solar offsets for the manifest
    sunc = move(sun, c["gen"])
    d2, off2 = daily_solar_offsets(ba, ts, sunc)
    seg2 = np.zeros(len(d2), int)
    for b in bounds:
        seg2 += np.array([dd >= b for dd in d2]).astype(int)
    for s in range(nseg):
        seg_stats[s]["solar_offset_median_h_after"] = float(np.median(off2[seg2 == s])) if (seg2 == s).any() else None
    # apply to rows
    rows = d.with_columns(pl.col("ts_utc").dt.replace_time_zone("UTC").dt.convert_time_zone(BA_TZ[ba]).dt.date().alias("_ld"))
    grp = pl.Series([_group(k) for k in rows["kind"]])
    sg = np.zeros(rows.height, int)
    ld = rows["_ld"].to_numpy()
    for b in bounds:
        sg += (ld >= np.datetime64(b)).astype(int)
    shift = np.array([c[g][s] for g, s in zip(grp, sg)], int)
    new_ts = rows["ts_utc"].to_numpy().astype("datetime64[us]") + shift.astype("timedelta64[h]").astype("timedelta64[us]")
    excl = np.zeros(rows.height, bool)
    reason = np.array([""] * rows.height, dtype=object)
    for bi, b in enumerate(bounds):
        for g in GROUPS:
            if c[g][bi] != c[g][bi + 1]:
                m = (grp.to_numpy() == g) & (ld >= np.datetime64(b - timedelta(days=1))) & (ld <= np.datetime64(b + timedelta(days=1)))
                excl |= m
                reason[m] = "transition"
    out = rows.with_columns(pl.Series("ts_utc", new_ts), pl.Series("c_hours", shift), pl.Series("timing_excluded", excl), pl.Series("timing_reason", reason.astype(str))).drop("_ld")
    # collisions after shifting (same series, same new hour): keep one row, exclude it
    key = pl.struct(["kind", "fuel", "ts_utc"])
    n_dup = int(out.select(key.is_duplicated().sum()).item())
    if n_dup:
        out = out.with_columns(pl.when(key.is_duplicated()).then(True).otherwise(pl.col("timing_excluded")).alias("timing_excluded"),
                               pl.when(key.is_duplicated()).then(pl.lit("collision")).otherwise(pl.col("timing_reason")).alias("timing_reason"))
        out = out.unique(["kind", "fuel", "ts_utc"], keep="first", maintain_order=True)
    info = {"boundaries": [str(b) for b in bounds], "segments": [], "collision_rows_dropped": n_dup, "daily_solar_offset_days": len(dates)}
    for s in range(nseg):
        a = "start" if s == 0 else str(bounds[s - 1])
        z = "end" if s == nseg - 1 else str(bounds[s] - timedelta(days=1))
        info["segments"].append({"from": a, "to": z, **{f"c_{g}_h": c[g][s] for g in GROUPS}, **seg_stats[s]})
    info["rows_by_group"] = {g: int(((grp.to_numpy() == g) & (shift != 0)).sum()) for g in GROUPS}
    info["excluded_rows"] = int(excl.sum())
    return out, info


def main() -> None:
    eia = pl.read_parquet(INTERIM / "eia_long.parquet")
    frames, man = [], {}
    for ba in BAS:
        f, info = align_ba(ba, eia)
        frames.append(f)
        man[ba] = info
        print(ba, info["boundaries"], [(s["from"], {g: s[f"c_{g}_h"] for g in GROUPS}) for s in info["segments"]])
    pl.concat(frames).sort(["ba", "kind", "fuel", "ts_utc"]).write_parquet(INTERIM / "eia_aligned.parquet")
    write_json(MANIFESTS / "timing_corrections.json", man, compact=False)


if __name__ == "__main__":
    main()
