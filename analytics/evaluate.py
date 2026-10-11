"""Forecast evaluation on the held-out test period: errors, intervals, paired comparison vs EIA, importance, sample weeks."""
from __future__ import annotations

import numpy as np
import polars as pl

from analytics import forecast as F
from pipelines.common import BA_TZ, TRAIN_END, VAL_END

MODELS = {
    "seasonal_naive": ("Seasonal naive (same hour last week)", "PREDICTED", True),
    "eia_day_ahead": ("EIA-930 day-ahead forecast as reported by the BA", "OBSERVED", True),
    "eia_debiased": ("EIA day-ahead x trailing 28-day actual/forecast ratio", "DERIVED", True),
    "gbm": ("Gradient boosting, calendar + lags + weather observed before the forecast origin", "PREDICTED", True),
    "gbm_stacked": ("Gradient boosting that corrects the EIA day-ahead forecast (uses it as input and normaliser)", "PREDICTED", True),
    "gbm_perfect_weather": ("Gradient boosting given observed target-day weather (stand-in for a perfect weather forecast; upper bound, not deployable)", "PREDICTED", False),
}


def _ape(y, p):
    return np.abs(p - y) / y * 100


def block_bootstrap_ci(d: np.ndarray, block: int = 7, n: int = 2000, seed: int = F.SEED) -> tuple[float, float]:
    """95% CI of mean(d) with a circular moving-block bootstrap over consecutive days (handles serial correlation)."""
    rng = np.random.default_rng(seed)
    m = len(d)
    nb = int(np.ceil(m / block))
    starts = rng.integers(0, m, size=(n, nb))
    idx = (starts[:, :, None] + np.arange(block)[None, None, :]) % m
    means = d[idx.reshape(n, -1)[:, :m]].mean(1)
    return float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def evaluate(ba: str, r: dict) -> dict:
    df, m, c = r["df"], r["masks"], r["common"]
    y = df["demand"].to_numpy().astype(float)
    t = m["test"] & c & ~np.isnan(r["preds"]["eia_debiased"][0.5])
    hour = df["local_hour"].to_numpy()
    month = df["local_month"].to_numpy()
    date = df["local_date"].to_numpy()
    top = t & (y >= np.percentile(y[t], 95))
    models = {}
    for k, (label, tag, avail) in MODELS.items():
        p = r["preds"][k][0.5]
        e = p[t] - y[t]
        models[k] = {"label": label, "tag": tag, "available_at_forecast_time": avail, "mae_mw": float(np.abs(e).mean()), "mape_pct": float(_ape(y[t], p[t]).mean()),
                     "rmse_mw": float(np.sqrt((e ** 2).mean())), "bias_mw": float(e.mean()), "mape_peak5_pct": float(_ape(y[top], p[top]).mean()),
                     "mape_by_hour": [float(_ape(y[t & (hour == h)], p[t & (hour == h)]).mean()) for h in range(24)],
                     "mape_by_month": [float(_ape(y[t & (month == mo)], p[t & (month == mo)]).mean()) for mo in range(1, 13)]}
    # intervals: CQR offset from validation residuals of the model trained before the validation period; applied to the deployed (train+val) model
    intervals = {}
    v = m["val"] & c
    for k in ("gbm", "gbm_stacked", "gbm_perfect_weather"):
        lo_v, hi_v = r["preds_train_only"][k][0.1], r["preds_train_only"][k][0.9]
        off = F.cqr_offset(y[v], lo_v[v], hi_v[v], 0.2)
        lo, hi = r["preds"][k][0.1], r["preds"][k][0.9]
        intervals[k] = {"nominal_pct": 80.0, "raw_coverage_pct": float(((y[t] >= lo[t]) & (y[t] <= hi[t])).mean() * 100),
                        "cqr_coverage_pct": float(((y[t] >= lo[t] - off) & (y[t] <= hi[t] + off)).mean() * 100),
                        "mean_width_mw": float((hi[t] - lo[t]).mean()), "cqr_mean_width_mw": float((hi[t] - lo[t]).mean() + 2 * off), "cqr_offset_mw": off}
    # paired comparisons on daily mean APE differences (model minus baseline); negative = model better
    days = np.unique(date[t])
    comps = []
    for a, b in (("gbm", "eia_day_ahead"), ("gbm", "eia_debiased"), ("gbm", "seasonal_naive"), ("gbm_stacked", "eia_day_ahead"), ("gbm_perfect_weather", "gbm")):
        da = np.array([_ape(y[t & (date == d)], r["preds"][a][0.5][t & (date == d)]).mean() - _ape(y[t & (date == d)], r["preds"][b][0.5][t & (date == d)]).mean() for d in days])
        lo_, hi_ = block_bootstrap_ci(da)
        diff = float(da.mean())
        sig = bool(hi_ < 0 or lo_ > 0)
        verdict = ("better than" if diff < 0 else "worse than") if sig else "statistically indistinguishable from"
        comps.append({"model": a, "baseline": b, "mape_diff_pp": diff, "ci95": [lo_, hi_], "significant": sig,
                      "statement": f"{a} test MAPE is {abs(diff):.2f} percentage points {'lower' if diff < 0 else 'higher'} than {b} (95% CI {lo_:.2f} to {hi_:.2f}): {verdict} {b}."})
    head = comps[0]
    # permutation importance of the train-only gbm median model on validation (never on test)
    mdl = r["models_train_only"]["gbm"][0.5]
    Xv = r["X"]["gbm"][v]
    ref = df["ref_week_mean"].to_numpy().astype(float)[v]
    base = F.mape(y[v], mdl.predict(Xv) * ref)
    rng = np.random.default_rng(F.SEED)
    imp = []
    for j, f in enumerate(F.FEATURES["gbm"]):
        incs = []
        for _ in range(3):
            Xp = Xv.copy()
            Xp[:, j] = rng.permutation(Xp[:, j])
            incs.append(F.mape(y[v], mdl.predict(Xp) * ref) - base)
        imp.append({"feature": f, "mape_increase_pp": float(np.mean(incs))})
    imp = sorted(imp, key=lambda d: -d["mape_increase_pp"])[:12]
    ev = {"split": {"train": [df["ts_utc"].min().isoformat(), TRAIN_END], "val": [TRAIN_END, VAL_END], "test": [VAL_END, df["ts_utc"].max().isoformat()]},
          "n_train": int((m["train"] & (df["demand_status"] == "ok").to_numpy()).sum()), "n_val": int(v.sum()), "n_test": int((m["test"] & c).sum()), "common_test_hours": int(t.sum()),
          "origin_rule": "Forecast origin = local midnight starting the target's local day. Features: calendar; demand lags 24/48/168 h and prior-local-day aggregates; weather observed before the origin. "
                         "gbm_stacked also uses the EIA day-ahead forecast; gbm_perfect_weather also uses observed target-day weather (not deployable). Deployed models are refit on train+val; test is untouched.",
          "features": {k: F.FEATURES[k] for k in ("gbm", "gbm_stacked", "gbm_perfect_weather")}, "hyperparameters": {**r["params"], "selection": "lowest validation MAPE of gbm P50 among 4 settings (train-only fit)",
                                                                                                                  "validation_mape_pct_train_only_gbm": r["val_mape_gbm"], "seed": F.SEED, "library": "scikit-learn HistGradientBoostingRegressor, loss=quantile"},
          "models": models, "intervals": intervals, "comparisons": comps,
          "comparison_vs_eia": {"best_model": min((k for k, v_ in models.items() if v_["available_at_forecast_time"]), key=lambda k: models[k]["mape_pct"]), "beats_eia": bool(head["significant"] and head["mape_diff_pp"] < 0),
                                "mape_diff_pp": head["mape_diff_pp"], "mape_diff_ci95": head["ci95"], "ci_method": "circular moving-block bootstrap over test days, block 7 days, 2000 resamples", "statement": head["statement"]},
          "importance": imp}
    return ev


def samples(ba: str, r: dict, ev: dict) -> dict:
    df, m, c = r["df"], r["masks"], r["common"]
    tz = BA_TZ[ba]
    loc = df["ts_utc"].dt.replace_time_zone("UTC").dt.convert_time_zone(tz).dt.strftime("%Y-%m-%dT%H:00")
    y = df["demand"].to_numpy().astype(float)
    date = df["local_date"].to_numpy()
    dow = df["local_dow"].to_numpy()
    t = m["test"] & c
    wk = date - dow.astype("timedelta64[D]")
    temp = df["temp_c"].to_numpy().astype(float)
    cand = []
    for w in np.unique(wk[t]):
        idx = np.where(wk == w)[0]
        if len(idx) == 168 and t[idx].sum() >= 160:
            cand.append((w, idx))
    ape_eia = _ape(y, r["preds"]["eia_day_ahead"][0.5])
    picks = {"Hottest week": max(cand, key=lambda x: np.nanmean(temp[x[1]])), "Coldest week": min(cand, key=lambda x: np.nanmean(temp[x[1]])),
             "Largest EIA miss": max(cand, key=lambda x: np.nanmean(ape_eia[x[1]][t[x[1]]]))}
    reasons = {"Hottest week": "highest mean population-weighted temperature among complete test weeks", "Coldest week": "lowest mean temperature among complete test weeks",
               "Largest EIA miss": "highest mean absolute percentage error of the EIA day-ahead forecast among complete test weeks"}
    f = lambda a: [None if np.isnan(x) else float(round(x, 1)) for x in a]  # noqa: E731
    best = ev["comparison_vs_eia"]["best_model"]
    off = ev["intervals"]["gbm"]["cqr_offset_mw"]
    weeks = []
    for label, (w, idx) in picks.items():
        weeks.append({"label": label, "reason": reasons[label], "start_utc": df["ts_utc"][int(idx[0])].isoformat(), "hours": int(len(idx)), "ts_local": loc.gather(idx).to_list(),
                      "actual_mw": f(np.where(df["demand_status"].to_numpy()[idx] == "ok", y[idx], np.nan)), "eia_mw": f(r["preds"]["eia_day_ahead"][0.5][idx]), "naive_mw": f(r["preds"]["seasonal_naive"][0.5][idx]),
                      "gbm_mw": f(r["preds"]["gbm"][0.5][idx]), "gbm_p10_mw": f(r["preds"]["gbm"][0.1][idx]), "gbm_p90_mw": f(r["preds"]["gbm"][0.9][idx]),
                      "gbm_p10_cqr_mw": f(r["preds"]["gbm"][0.1][idx] - off), "gbm_p90_cqr_mw": f(r["preds"]["gbm"][0.9][idx] + off), "best_mw": f(r["preds"][best][0.5][idx])})
    days = [d for d in np.unique(date[t]) if (t & (date == d)).sum() >= 20]
    daily = {"date": [str(d) for d in days], "mape_gbm": [], "mape_eia": [], "mape_naive": [], "actual_peak_mw": []}
    for d in days:
        k = t & (date == d)
        daily["mape_gbm"].append(float(_ape(y[k], r["preds"]["gbm"][0.5][k]).mean()))
        daily["mape_eia"].append(float(_ape(y[k], r["preds"]["eia_day_ahead"][0.5][k]).mean()))
        daily["mape_naive"].append(float(_ape(y[k], r["preds"]["seasonal_naive"][0.5][k]).mean()))
        daily["actual_peak_mw"].append(float(y[k].max()))
    return {"best_model": best, "cqr_offset_mw": off, "weeks": weeks, "daily_test": daily}
