"""Descriptive artifacts: demand profile, fuel mix, demand-temperature relationship."""
from __future__ import annotations

import numpy as np
import polars as pl

from analytics.forecast import SEED, holidays
from pipelines.common import FUELS

NaN = float("nan")


def _clean(x):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else float(x)


def demand_profile(df: pl.DataFrame, ba: str) -> dict:
    ok = df.filter(pl.col("demand_status") == "ok")
    daily = (df.with_columns(pl.when(pl.col("demand_status") == "ok").then(pl.col("demand")).otherwise(None).alias("d"))
             .group_by("local_date").agg(pl.col("d").mean().alias("m"), pl.col("d").max().alias("x"), pl.col("d").min().alias("n"), pl.col("temp_c").mean().alias("t"), pl.col("d").count().alias("v")).sort("local_date"))
    daily = daily.with_columns(*[pl.when(pl.col("v") >= 20).then(pl.col(c)).otherwise(None).alias(c) for c in ("m", "x", "n")])
    mh = ok.group_by(["local_month", "local_hour"]).agg(pl.col("demand").mean().alias("v")).sort("local_month", "local_hour")
    how = ok.group_by(["local_dow", "local_hour"]).agg(pl.col("demand").mean().alias("v")).sort("local_dow", "local_hour")
    ann = ok.group_by("local_year").agg(pl.col("demand").mean().alias("m"), pl.col("demand").max().alias("x"), pl.len().alias("n")).sort("local_year")
    r = lambda s, k=0: [_clean(round(x, k)) if x is not None else None for x in s]  # noqa: E731
    return {"daily": {"date": [str(d) for d in daily["local_date"]], "mean_mw": r(daily["m"]), "peak_mw": r(daily["x"]), "min_mw": r(daily["n"]), "temp_mean_c": r(daily["t"], 1), "valid_hours": daily["v"].to_list()},
            "month_hour_mean_mw": r(mh["v"]), "how_mean_mw": r(how["v"]), "annual": [{"year": int(y), "mean_mw": float(round(m, 0)), "peak_mw": float(x), "valid_hours": int(n)} for y, m, x, n in ann.iter_rows() if n >= 2000],
            "tz": "local hour; month_hour index = (month-1)*24 + hour; how index = dow*24 + hour (0 = Monday)", "index_note": "Means use clean (status ok) hours only; imputed and flagged hours excluded. annual lists local calendar years with at least 2,000 clean hours (2025 is partial: to 2025-08-26)."}


def fuel_mix(df: pl.DataFrame, ba: str) -> dict:
    fuels = list(FUELS[ba])
    g = {f: f"gen_{f.lower()}" for f in fuels}
    pos = lambda c: pl.col(c).clip(lower_bound=0)  # noqa: E731
    tot = df.select([pos(c).sum().alias(f) for f, c in g.items()])
    shares = {f: float(tot[f][0]) for f in fuels}
    s = sum(shares.values())
    share = {f: round(100 * v / s, 2) for f, v in shares.items()}
    by_year = []
    for y in sorted(df["local_year"].unique().to_list()):
        sub = df.filter(pl.col("local_year") == y).select([pos(c).sum().alias(f) for f, c in g.items()])
        ss = sum(sub[f][0] for f in fuels)
        by_year.append({"year": int(y), "share_pct": {f: round(100 * sub[f][0] / ss, 2) for f in fuels}})
    mh = {}
    for f, c in g.items():
        a = df.group_by(["local_month", "local_hour"]).agg(pl.col(c).mean().alias("v")).sort("local_month", "local_hour")["v"].to_list()
        mh[f] = [_clean(round(x, 0)) for x in a]
    yr_prof = {}
    for y in sorted(df["local_year"].unique().to_list()):
        if y < 2021:
            continue
        sub = df.filter(pl.col("local_year") == y)
        okd = sub.filter(pl.col("demand_status") == "ok")
        grid = lambda frame, col: frame.group_by(["local_month", "local_hour"]).agg(pl.col(col).mean().alias("v"))  # noqa: E731
        def arr288(frame, col):
            m = {(a, b): v for a, b, v in grid(frame, col).iter_rows()}
            return [_clean(round(m[(mo, h)], 0)) if (mo, h) in m and m[(mo, h)] is not None else None for mo in range(1, 13) for h in range(24)]
        yr_prof[str(y)] = {"demand": arr288(okd, "demand"), "SUN": arr288(sub, "gen_sun"), "WND": arr288(sub, "gen_wnd"), "months_present": int(sub["local_month"].n_unique())}
    cap = {f: float(df[g[f]].max()) for f in fuels}
    # evening ramp: change in net load (demand - solar - wind) between 16:00 and 20:00 local, divided by 4 h, per day
    d = df.filter(pl.col("local_hour").is_in([16, 20])).with_columns((pl.col("demand") - pl.col("gen_sun") - pl.col("gen_wnd")).alias("nl"))
    p = d.pivot(on="local_hour", index="local_date", values="nl").drop_nulls()
    ramp = ((p["20"] - p["16"]) / 4).to_numpy()
    return {"fuels": fuels, "annual_share_pct": share, "annual_share_by_year": by_year, "month_hour_mean_mw": mh, "month_hour_mean_mw_by_year": yr_prof, "capacity_proxy_mw": cap,
            "capacity_proxy_rule": "Maximum hourly net generation observed in the window for the fuel (DERIVED). A proxy for installed capacity, not nameplate: it understates fleets that never ran flat out and includes storage in OTH.",
            "evening_ramp": {"definition": "(net load at 20:00 local - net load at 16:00 local) / 4 h, net load = demand - solar - wind, per day", "mean_mw_per_h": float(np.mean(ramp)), "p95_mw_per_h": float(np.percentile(ramp, 95))}}


def weather_relation(df: pl.DataFrame, ba: str) -> dict:
    """Weekday demand by local hour = intercept(h, year) + b_cool(h) * max(T - Tc, 0) + b_heat(h) * max(Th - T, 0); Tc/Th by grid search on total SSE."""
    hol = holidays(df["local_date"])
    d = df.with_columns(pl.Series("hol", hol)).filter((pl.col("demand_status") == "ok") & pl.col("temp_c").is_not_null() & (pl.col("local_dow") < 5) & (pl.col("hol") == 0))
    T, y, h, yr = d["temp_c"].to_numpy(), d["demand"].to_numpy(), d["local_hour"].to_numpy(), d["ts_utc"].dt.year().to_numpy()
    years = sorted(set(yr))

    def design(Tc, Th, sel):
        cols = [(yr[sel] == k).astype(float) for k in years] + [np.maximum(T[sel] - Tc, 0), np.maximum(Th - T[sel], 0)]
        return np.stack(cols, 1)

    def fit(Tc, Th):
        sse, coefs = 0.0, {}
        for hh in range(24):
            sel = h == hh
            A = design(Tc, Th, sel)
            b, *_ = np.linalg.lstsq(A, y[sel], rcond=None)
            sse += float(((A @ b - y[sel]) ** 2).sum())
            coefs[hh] = b
        return sse, coefs

    best = None
    for Tc in range(14, 25):
        for Th in range(6, min(Tc, 19) + 1):
            sse, co = fit(Tc, Th)
            if best is None or sse < best[0]:
                best = (sse, Tc, Th, co)
    sse, Tc, Th, co = best
    sst = float(((y - y.mean()) ** 2).sum())
    ny = len(years)
    bc = [float(co[k][ny]) for k in range(24)]
    bh = [float(co[k][ny + 1]) for k in range(24)]
    ic = [float(np.mean(co[k][:ny])) for k in range(24)]
    # percent change of demand per degC above Tc: mean over hours 12-20 of b_cool(h) / mean demand of those hours; CI by bootstrap over days
    dates = d["local_date"].to_numpy()
    ud = np.unique(dates)
    rng = np.random.default_rng(SEED)
    sel_h = np.isin(h, list(range(12, 21)))

    def pct(sample_days):
        w = np.isin(dates, sample_days)
        res = []
        for hh in range(12, 21):
            sel = (h == hh) & w
            A = design(Tc, Th, sel)
            if np.linalg.matrix_rank(A) < A.shape[1]:
                return np.nan
            b, *_ = np.linalg.lstsq(A, y[sel], rcond=None)
            res.append(b[ny] / y[sel].mean() * 100)
        return float(np.mean(res))

    point = pct(ud)
    boots = [pct(rng.choice(ud, size=len(ud), replace=True)) for _ in range(60)]
    ci = [float(np.nanpercentile(boots, 2.5)), float(np.nanpercentile(boots, 97.5))]
    # daily bins
    dd = (df.filter((pl.col("demand_status") == "ok")).group_by("local_date").agg(pl.col("demand").mean().alias("m"), pl.col("temp_c").mean().alias("t"), pl.len().alias("n")).filter(pl.col("n") >= 23).drop_nulls())
    t, m = dd["t"].to_numpy(), dd["m"].to_numpy()
    edges = np.arange(np.floor(t.min()), np.ceil(t.max()) + 2, 2.0)
    bins = {"temp_c": [], "mean_mw": [], "p10_mw": [], "p90_mw": [], "n": []}
    for a, b in zip(edges[:-1], edges[1:]):
        k = (t >= a) & (t < b)
        if k.sum() >= 5:
            bins["temp_c"].append(float(a + 1)); bins["mean_mw"].append(float(m[k].mean())); bins["p10_mw"].append(float(np.percentile(m[k], 10))); bins["p90_mw"].append(float(np.percentile(m[k], 90))); bins["n"].append(int(k.sum()))
    return {"model": "weekday non-holiday hourly demand ~ year-by-hour intercept + b_cool(h)*max(T-Tc,0) + b_heat(h)*max(Th-T,0), OLS per local hour", "cool_base_c": float(Tc), "heat_base_c": float(Th),
            "r2": float(1 - sse / sst), "n": int(len(y)), "b_cool_mw_per_c_by_hour": bc, "b_heat_mw_per_c_by_hour": bh, "intercept_mw_by_hour": ic, "binned": bins,
            "pct_demand_per_c_above_base": point, "pct_ci": ci,
            "note": "Association, not causation; one BA-level population-weighted temperature series; R2 is pooled across hours with hour-specific intercepts, so it mostly reflects the daily shape. Percent per degC uses hours 12-20 local; CI is a 60-draw day bootstrap."}


def net_load_facts(df: pl.DataFrame, ba: str) -> dict:
    """Midday (10:00-15:59 local) net load = demand - solar - wind on clean hours; interchange share of demand."""
    ok = df.filter((pl.col("demand_status") == "ok") & pl.col("gen_sun").is_not_null() & pl.col("gen_wnd").is_not_null())
    ok = ok.with_columns((pl.col("demand") - pl.col("gen_sun") - pl.col("gen_wnd")).alias("nl"))
    mid = ok.filter(pl.col("local_hour").is_between(10, 15))
    full_years = [int(y) for y in ok.group_by("local_year").len().filter(pl.col("len") >= 8000)["local_year"].sort().to_list()]
    first, latest = full_years[0], full_years[-1]
    byy = {y: float(mid.filter(pl.col("local_year") == y)["nl"].min()) for y in full_years}
    lm = mid.filter(pl.col("local_year") == latest).group_by("local_month").agg(pl.col("nl").mean().alias("m")).sort("m")
    inter = df.filter((pl.col("demand_status") == "ok") & pl.col("interchange").is_not_null())
    return {"interchange_abs_mean_pct_of_demand": round(float(inter["interchange"].abs().mean() / inter["demand"].mean() * 100), 2),
            "interchange_net_mean_pct_of_demand": round(float(inter["interchange"].mean() / inter["demand"].mean() * 100), 2),
            "deepest_bite_month": int(lm["local_month"][0]), "deepest_bite_month_mean_midday_net_load_mw": round(float(lm["m"][0]), 0), "bite_year": latest,
            "midday_net_load_min_mw_first_year": byy[first], "midday_net_load_min_mw_latest_year": byy[latest], "net_load_first_year": first, "net_load_latest_year": latest}
