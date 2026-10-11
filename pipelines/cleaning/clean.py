"""Raw interim (EIA long + NOAA hourly) -> data/interim/hourly.parquet + data/manifests/cleaning_ledger.json. See docs/DATA_CONTRACTS.md."""
from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import numpy as np
import polars as pl

from pipelines.common import BA_TZ, BAS, END, FUELS, INTERIM, MANIFESTS, START, write_json
from pipelines.ingestion.noaa import STATIONS

SPIKE_REL, SPIKE_NB, RANGE_LO, RANGE_HI, MAX_FILL = 0.35, 0.20, 0.2, 3.0, 3
WEEK = 168
CORE = {"D": "demand", "DF": "demand_forecast", "NG": "net_gen"}


def hours_grid() -> np.ndarray:
    return np.arange(np.datetime64(START, "h"), np.datetime64(END, "h") + np.timedelta64(1, "h"))


def _shift(x: np.ndarray, k: int) -> np.ndarray:
    out = np.full_like(x, np.nan)
    if k > 0:
        out[k:] = x[:-k]
    else:
        out[:k] = x[-k:]
    return out


def flag_series(x: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Return (range_flag, spike_flag, reference, ratio) for a series with NaN = no value."""
    med = np.nanmedian(x)
    rng = ~np.isnan(x) & ((x <= 0) | (x < RANGE_LO * med) | (x > RANGE_HI * med))
    st = np.stack([_shift(x, k * WEEK) for k in (-3, -2, -1, 1, 2, 3)])
    with np.errstate(all="ignore"):
        ref = np.where((~np.isnan(st)).sum(0) >= 3, np.nanmedian(st, axis=0), np.nan)
        prev, nxt = _shift(x, 1), _shift(x, -1)
        dev = x / ref - 1
        dp, dn = x / prev - 1, x / nxt - 1
        spike = (~np.isnan(x)) & (np.abs(dev) > SPIKE_REL) & (np.abs(dp) > SPIKE_NB) & (np.abs(dn) > SPIKE_NB) & (np.sign(dp) == np.sign(dev)) & (np.sign(dn) == np.sign(dev)) & ~rng
        return rng, spike, ref, x / ref


def fill_short(x: np.ndarray, maxgap: int = MAX_FILL) -> tuple[np.ndarray, np.ndarray]:
    """Linear interpolation of NaN runs of length <= maxgap bounded by valid values on both sides. Returns (filled, imputed_mask)."""
    y, imp = x.copy(), np.zeros(len(x), bool)
    nan = np.isnan(x)
    i, n = 0, len(x)
    while i < n:
        if nan[i]:
            j = i
            while j < n and nan[j]:
                j += 1
            if 0 < i and j < n and j - i <= maxgap:
                y[i:j] = np.linspace(x[i - 1], x[j], j - i + 2)[1:-1]
                imp[i:j] = True
            i = j
        else:
            i += 1
    return y, imp


def runs(mask: np.ndarray, ts: np.ndarray) -> list[tuple[str, int]]:
    out, i, n = [], 0, len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]:
                j += 1
            out.append((str(ts[i]), j - i))
            i = j
        else:
            i += 1
    return out


def dst_info(tz: str) -> dict:
    z = ZoneInfo(tz)
    d0, d1 = datetime.fromisoformat(START).date(), datetime.fromisoformat(END).date()
    n23 = n25 = days = 0
    trans = []
    d = d0
    while d <= d1:
        a = datetime(d.year, d.month, d.day, tzinfo=z).astimezone(ZoneInfo("UTC"))
        nd = d + timedelta(days=1)
        b = datetime(nd.year, nd.month, nd.day, tzinfo=z).astimezone(ZoneInfo("UTC"))
        h = int((b - a).total_seconds() // 3600)
        days += 1
        if h != 24:
            (n23, n25) = (n23 + (h == 23), n25 + (h == 25))
            trans.append({"date": d.isoformat(), "type": "spring_forward" if h == 23 else "fall_back", "hours": h})
        d = nd
    return {"tz": tz, "local_days": days, "days_23h": n23, "days_25h": n25, "transitions": trans}


def clean_ba(ba: str, eia: pl.DataFrame, wx: pl.DataFrame, ts: np.ndarray) -> tuple[pl.DataFrame, dict]:
    n = len(ts)
    tsl = ts.astype("datetime64[h]")
    idx = {t: i for i, t in enumerate(tsl)}
    ledger, qual_gaps, spikes = [], [], []
    cols: dict[str, np.ndarray] = {}
    flagcount = {"range": 0, "spike": 0}
    sers = [("D", ""), ("DF", ""), ("NG", ""), ("TI", "")] + [("GEN", f) for f in FUELS[ba]]
    raw_vals = {}
    for kind, fuel in sers:
        d = eia.filter((pl.col("ba") == ba) & (pl.col("kind") == kind) & (pl.col("fuel") == fuel))
        assert d["ts_utc"].n_unique() == d.height, "duplicate timestamps after alignment"
        keep = np.array([t in idx for t in d["ts_utc"].to_numpy().astype("datetime64[h]")], bool)
        d = d.filter(pl.Series(keep))
        x = np.full(n, np.nan)
        present = np.zeros(n, bool)
        texcl = np.zeros(n, bool)
        pos = np.array([idx[t] for t in d["ts_utc"].to_numpy().astype("datetime64[h]")], int)
        v = d["value"].fill_null(np.nan).to_numpy().astype(float)
        x[pos], present[pos] = v, True
        texcl[pos] = d["timing_excluded"].to_numpy()
        raw_vals[(kind, fuel)] = (x, present, texcl)
    for (kind, fuel), (x, present, texcl) in raw_vals.items():
        null = present & np.isnan(x) & ~texcl
        x = np.where(texcl, np.nan, x)
        rng = np.zeros(n, bool)
        spk = np.zeros(n, bool)
        if kind in CORE:
            rng, spk, ref, ratio = flag_series(x)
            for i in np.argsort(-np.nan_to_num(np.abs(ratio - 1)) * spk)[:6]:
                if spk[i]:
                    spikes.append({"series": f"{kind}", "ts_utc": str(tsl[i]), "value": float(x[i]), "reference": float(ref[i]), "ratio": float(ratio[i]), "rule": "spike"})
        elif kind == "GEN":
            lim = 1.5 * max(abs(np.nanpercentile(x, 0.1)), abs(np.nanpercentile(x, 99.9)))
            rng = ~np.isnan(x) & (np.abs(x) > lim)
        flagged = rng | spk
        flagcount["range"] += int(rng.sum())
        flagcount["spike"] += int(spk.sum())
        y = np.where(flagged, np.nan, x)
        imp = np.zeros(n, bool)
        if kind in CORE:
            y, imp = fill_short(y)
        ledger.append({"ba": ba, "kind": kind, "fuel": fuel, "grid_slots": n, "raw_rows": int(present.sum()), "missing_slots": int((~present).sum()),
                       "null_value": int(null.sum()), "flagged_outlier": int(flagged.sum()), "timing_excluded": int(texcl.sum()),
                       "kept": int((present & ~null & ~flagged & ~texcl).sum()), "imputed_short_gap": int(imp.sum()),
                       "_range": int(rng.sum()), "_spike": int(spk.sum())})
        name = CORE.get(kind) or ("interchange" if kind == "TI" else f"gen_{fuel.lower()}")
        cols[name] = y
        if kind in CORE:
            cols[name + "_status"] = np.where(imp, "imputed", np.where(flagged, "flagged", np.where(texcl, "timing", np.where(~present, "missing", np.where(null, "null", "ok")))))
        gap = np.isnan(x)
        r = runs(gap, tsl)
        qual_gaps.append({"series": f"{kind}{'.' + fuel if fuel else ''}", "n_gaps": len(r), "missing_hours": int(gap.sum()), "longest_gap_h": max([h for _, h in r], default=0),
                          "top_runs": [{"start_utc": s, "hours": h} for s, h in sorted(r, key=lambda t: -t[1])[:5]]})
    # fuel-sum vs total, balance
    gen = np.stack([cols[f"gen_{f.lower()}"] for f in FUELS[ba]])
    ok = (~np.isnan(gen).any(0)) & ~np.isnan(cols["net_gen"]) & (cols["net_gen_status"] == "ok")
    res = (gen.sum(0) - cols["net_gen"])[ok] / cols["net_gen"][ok] * 100
    gvt = {"n_hours": int(ok.sum()), "mean_signed_resid_pct": float(res.mean()), "mean_abs_resid_pct": float(np.abs(res).mean()), "p99_abs_resid_pct": float(np.percentile(np.abs(res), 99)),
           "hours_gt_2pct": int((np.abs(res) > 2).sum()), "definition": "100 * (sum of fuel net generation - total net generation) / total net generation, hours where all fuels and a clean total exist"}
    okb = (cols["net_gen_status"] == "ok") & (cols["demand_status"] == "ok") & ~np.isnan(cols["interchange"])
    rb = (cols["net_gen"] - cols["demand"] - cols["interchange"])[okb]
    bal = {"n_hours": int(okb.sum()), "mean_resid_mw": float(rb.mean()), "mean_abs_resid_mw": float(np.abs(rb).mean()), "p99_abs_resid_mw": float(np.percentile(np.abs(rb), 99)),
           "definition": "net generation - demand - total interchange (EIA identity: net generation = demand + interchange), hours where all three are clean"}
    # weather
    wcols, wled = [], []
    W = np.full((len(STATIONS_BA(ba)), n), np.nan)
    D = np.full_like(W, np.nan)
    wts = np.array([w for *_, w in STATIONS_BA(ba)])
    for k, (b, sid, nm, w) in enumerate(STATIONS_BA(ba)):
        d = wx.filter(pl.col("station") == sid)
        pos = np.array([idx[t] for t in d["ts_utc"].to_numpy().astype("datetime64[h]") if t in idx])
        keep = np.array([t in idx for t in d["ts_utc"].to_numpy().astype("datetime64[h]")])
        W[k, pos] = d["tmp_c"].to_numpy()[keep]
        D[k, pos] = d["dew_c"].fill_null(np.nan).to_numpy()[keep]
        obs = int((~np.isnan(W[k])).sum())
        W[k], imp = fill_short(W[k])
        D[k], _ = fill_short(D[k])
        wled.append({"ba": ba, "station_id": sid, "name": nm, "weight": w, "hours_expected": n, "hours_observed": obs, "hours_interpolated": int(imp.sum()), "hours_missing": int(np.isnan(W[k]).sum())})
    def wmean(M):
        m = ~np.isnan(M)
        s = (np.nan_to_num(M) * wts[:, None] * m).sum(0)
        z = (wts[:, None] * m).sum(0)
        with np.errstate(all="ignore"):
            return np.where(z > 0, s / z, np.nan)
    cols["temp_c"], cols["dew_c"] = wmean(W), wmean(D)
    # local time
    loc = pl.Series("ts_utc", tsl.astype("datetime64[us]")).dt.replace_time_zone("UTC").dt.convert_time_zone(BA_TZ[ba])
    df = pl.DataFrame({"ba": [ba] * n, "ts_utc": tsl.astype("datetime64[us]"), **{k: v for k, v in cols.items()}})
    df = df.with_columns(loc.dt.date().alias("local_date"), loc.dt.hour().cast(pl.Int8).alias("local_hour"), (loc.dt.weekday() - 1).cast(pl.Int8).alias("local_dow"),
                         loc.dt.month().cast(pl.Int8).alias("local_month"), loc.dt.year().alias("local_year"))
    qual = {"gaps": qual_gaps, "dst": dst_info(BA_TZ[ba]), "spikes": sorted(spikes, key=lambda s: -abs(s["ratio"] - 1))[:12], "flag_counts": flagcount}
    return df, {"ledger": ledger, "quality": qual, "generation_vs_total": gvt, "balance": bal, "weather": wled}


def STATIONS_BA(ba):
    return [s for s in STATIONS if s[0] == ba]


def main(force: bool = False) -> None:
    eia = pl.read_parquet(INTERIM / "eia_aligned.parquet")
    wx = pl.read_parquet(INTERIM / "weather_hourly.parquet")
    ts = hours_grid()
    frames, out = [], {}
    for ba in BAS:
        df, info = clean_ba(ba, eia, wx, ts)
        frames.append(df)
        out[ba] = info
    pl.concat(frames, how="diagonal").fill_nan(None).write_parquet(INTERIM / "hourly.parquet")
    write_json(MANIFESTS / "cleaning_ledger.json", out, compact=False)
    for ba in BAS:
        print(ba, out[ba]["quality"]["flag_counts"], out[ba]["generation_vs_total"], out[ba]["balance"])


if __name__ == "__main__":
    main()
