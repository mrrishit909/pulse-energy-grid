"""Day-ahead hourly demand forecasting with a strict temporal split.

Forecast origin for a target hour = the end of the previous LOCAL day (local midnight before the target's day). A feature may only use data stamped
before that origin. Exceptions are explicit and labelled: `eia_df*` (EIA day-ahead forecast, published before the target day; used only by gbm_stacked)
and `pw_*` (observed target-day weather as a stand-in for a perfect weather forecast; used only by gbm_perfect_weather, an upper bound).
"""
from __future__ import annotations

import os
from datetime import timedelta

os.environ.setdefault("OMP_NUM_THREADS", "4")

import numpy as np
import pandas as pd
import polars as pl
from pandas.tseries.holiday import USFederalHolidayCalendar
from sklearn.ensemble import HistGradientBoostingRegressor

from analytics.data import hourly
from pipelines.common import TRAIN_END, VAL_END

SEED = 20261010
QS = (0.1, 0.5, 0.9)
CAL = ["local_hour", "local_dow", "local_month", "doy_sin", "doy_cos", "is_holiday", "is_weekend", "hour_of_week"]
LAGS = ["lag24", "lag48", "lag168", "same_hour_mean_7d", "prev_day_mean", "prev_day_max", "prev_day_min", "prev_day_hour_ratio", "ref_week_mean"]
OBS_WX = ["wx_prev_mean", "wx_prev_max", "wx_prev_min", "wx_prev_last", "wx_lag24", "wx_lag168", "dew_prev_mean", "dew_lag24"]
STACK = ["eia_df", "eia_df_vs_lag168"]
PW = ["pw_temp", "pw_dew", "pw_day_mean", "pw_day_max", "pw_day_min"]
FEATURES = {"gbm": CAL + LAGS + OBS_WX, "gbm_stacked": CAL + LAGS + OBS_WX + STACK, "gbm_perfect_weather": CAL + LAGS + OBS_WX + PW}
GRID = [dict(max_iter=300, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=40), dict(max_iter=300, learning_rate=0.05, max_leaf_nodes=31, min_samples_leaf=40),
        dict(max_iter=600, learning_rate=0.03, max_leaf_nodes=15, min_samples_leaf=80), dict(max_iter=600, learning_rate=0.03, max_leaf_nodes=31, min_samples_leaf=80)]


def holidays(dates: pl.Series) -> np.ndarray:
    d = pd.to_datetime(dates.to_numpy())
    h = USFederalHolidayCalendar().holidays(start=d.min(), end=d.max())
    return d.isin(h).astype(np.int8)


def build_features(df: pl.DataFrame) -> pl.DataFrame:
    """df = cleaned hourly frame for ONE BA sorted by ts_utc on the complete hourly grid. Pure function of df."""
    df = df.sort("ts_utc")
    dem, tmp, dew = pl.col("demand"), pl.col("temp_c"), pl.col("dew_c")
    day = (df.group_by("local_date").agg(dem.mean().alias("dm"), dem.max().alias("dx"), dem.min().alias("dn"), tmp.mean().alias("tm"), tmp.max().alias("tx"),
                                         tmp.min().alias("tn"), tmp.drop_nulls().last().alias("tl"), dew.mean().alias("dwm"), dem.count().alias("nvalid"))
           .sort("local_date"))
    # prior-day aggregates (local day D-1), 7-day reference level (mean of daily means of D-7..D-1)
    day = day.with_columns(pl.when(pl.col("nvalid") >= 20).then(pl.col("dm")).otherwise(None).alias("dm_ok"))
    day = day.with_columns(pl.col("dm_ok").shift(1).rolling_mean(7, min_samples=4).alias("ref_week_mean"), *[pl.col(c).shift(1).alias("p_" + c) for c in ("dm", "dx", "dn", "tm", "tx", "tn", "tl", "dwm")])
    # trailing 28 local days of (demand / EIA forecast) ratio, known at the origin: used to debias the EIA forecast (baseline) and nowhere else
    day = day.join(df.group_by("local_date").agg(pl.col("demand_forecast").sum().alias("fs"), pl.when(pl.col("demand_forecast").is_not_null()).then(dem).sum().alias("ds"),
                                                 ((pl.col("demand_forecast_status") == "ok") & (pl.col("demand_status") == "ok")).sum().alias("nboth")), on="local_date").sort("local_date")
    day = day.with_columns((pl.col("ds").shift(1).rolling_sum(28, min_samples=14) / pl.col("fs").shift(1).rolling_sum(28, min_samples=14)).alias("eia_ratio_28d"))
    df = df.join(day.select("local_date", "eia_ratio_28d"), on="local_date", how="left")
    df = df.join(day.select("local_date", "ref_week_mean", "p_dm", "p_dx", "p_dn", "p_tm", "p_tx", "p_tn", "p_tl", "p_dwm"), on="local_date", how="left")
    # same-day-of-target aggregates are used only by the perfect-weather variant
    df = df.join(day.select("local_date", pl.col("tm").alias("pw_day_mean"), pl.col("tx").alias("pw_day_max"), pl.col("tn").alias("pw_day_min")), on="local_date", how="left")
    doy = df["ts_utc"].dt.ordinal_day().to_numpy()
    hol = holidays(df["local_date"])
    # On a 25-hour (fall-back) local day the last hour's 24h lag lands on the first hour of the SAME day, i.e. at/after the origin: null it (one hour per year).
    leak24 = (df["ts_utc"] - timedelta(hours=24) >= origin_ts(df))
    dem24 = pl.when(leak24).then(None).otherwise(dem.shift(24))
    df = df.with_columns(
        dem24.alias("lag24"), dem.shift(48).alias("lag48"), dem.shift(168).alias("lag168"),
        pl.mean_horizontal(dem24, *[dem.shift(24 * k) for k in range(2, 8)]).alias("same_hour_mean_7d"),
        pl.col("p_dm").alias("prev_day_mean"), pl.col("p_dx").alias("prev_day_max"), pl.col("p_dn").alias("prev_day_min"),
        (dem24 / pl.col("p_dm")).alias("prev_day_hour_ratio"),
        pl.col("p_tm").alias("wx_prev_mean"), pl.col("p_tx").alias("wx_prev_max"), pl.col("p_tn").alias("wx_prev_min"), pl.col("p_tl").alias("wx_prev_last"),
        pl.when(leak24).then(None).otherwise(tmp.shift(24)).alias("wx_lag24"), tmp.shift(168).alias("wx_lag168"), pl.col("p_dwm").alias("dew_prev_mean"),
        pl.when(leak24).then(None).otherwise(dew.shift(24)).alias("dew_lag24"),
        pl.Series("doy_sin", np.sin(2 * np.pi * doy / 366)), pl.Series("doy_cos", np.cos(2 * np.pi * doy / 366)),
        pl.Series("is_holiday", hol), (pl.col("local_dow") >= 5).cast(pl.Int8).alias("is_weekend"), (pl.col("local_dow") * 24 + pl.col("local_hour")).alias("hour_of_week"),
        tmp.alias("pw_temp"), dew.alias("pw_dew"),
        pl.col("demand_forecast").alias("eia_df"), (pl.col("demand_forecast") / dem.shift(168)).alias("eia_df_vs_lag168"),
    )
    # lag24/48/168 of an hour are always at or before the origin (end of the previous local day) for the target's own day only when 24h before target <= origin: holds for
    # every hour of the day; DST days shift the origin by at most one hour and lag24 then equals the origin hour at worst.
    return df


def origin_ts(df: pl.DataFrame) -> pl.Series:
    """Forecast origin (UTC) of each row: the start of the target's local day."""
    tz = {"CISO": "America/Los_Angeles", "ERCO": "America/Chicago"}[df["ba"][0]]
    return (df["local_date"].cast(pl.Datetime("us")).dt.replace_time_zone(tz, ambiguous="earliest").dt.convert_time_zone("UTC").dt.replace_time_zone(None))


def split_masks(ts: pl.Series) -> dict[str, np.ndarray]:
    t = ts.to_numpy()
    a, b = np.datetime64(TRAIN_END), np.datetime64(VAL_END)
    return {"train": t <= a, "val": (t > a) & (t <= b), "test": t > b}


def _xy(df: pl.DataFrame, cols: list[str], mask: np.ndarray):
    X = df.select(cols).to_numpy().astype(float)[mask]
    return X


def fit_predict(df: pl.DataFrame, feats: list[str], params: dict, masks: dict[str, np.ndarray], qs=QS, norm: str = "ref_week_mean", fit_on: tuple = ("train",)):
    """Train quantile models on train rows; return {q: prediction array (MW) for all rows} and the models.
    Target is demand / norm (norm = trailing-week mean level, or the EIA day-ahead forecast for the stacked variant, which then learns a multiplicative correction)."""
    y = df["demand"].to_numpy().astype(float)
    ref = df[norm].to_numpy().astype(float)
    ok = (df["demand_status"] == "ok").to_numpy() & ~np.isnan(ref) & ~np.isnan(y)
    X = df.select(feats).to_numpy().astype(float)
    tr = np.logical_or.reduce([masks[k] for k in fit_on]) & ok
    preds, models = {}, {}
    for q in qs:
        m = HistGradientBoostingRegressor(loss="quantile", quantile=q, random_state=SEED, early_stopping=False, **params)
        m.fit(X[tr], y[tr] / ref[tr])
        preds[q] = m.predict(X) * ref
        models[q] = m
    return preds, models, X, ok


def mape(y, p):
    return float(np.mean(np.abs(p - y) / y) * 100)


def run(ba: str) -> dict:
    df = build_features(hourly(ba))
    masks = split_masks(df["ts_utc"])
    y = df["demand"].to_numpy().astype(float)
    ok = (df["demand_status"] == "ok").to_numpy()
    naive = df["lag168"].to_numpy().astype(float)
    eia = df["demand_forecast"].to_numpy().astype(float)
    eia_ok = (df["demand_forecast_status"] == "ok").to_numpy()
    common = ok & eia_ok & ~np.isnan(naive) & ~np.isnan(df["ref_week_mean"].to_numpy().astype(float))
    # hyper-parameter choice on validation (variant gbm, median MAPE)
    best, best_s = None, 1e9
    for p in GRID:
        pr, *_ = fit_predict(df, FEATURES["gbm"], p, masks, qs=(0.5,))
        s = mape(y[masks["val"] & common], pr[0.5][masks["val"] & common])
        if s < best_s:
            best, best_s = p, s
    out = {"params": best, "val_mape_gbm": best_s, "df": df, "masks": masks, "common": common, "ok": ok, "preds": {}, "models": {}, "X": {}, "preds_train_only": {}, "models_train_only": {}}
    for name, feats in FEATURES.items():
        nm = "eia_df" if name == "gbm_stacked" else "ref_week_mean"
        out["preds_train_only"][name], out["models_train_only"][name], _, _ = fit_predict(df, feats, best, masks, norm=nm)  # used for validation scoring and interval calibration
        pr, md, X, _ = fit_predict(df, feats, best, masks, norm=nm, fit_on=("train", "val"))  # deployed model: refit on train+val, test untouched
        out["preds"][name], out["models"][name], out["X"][name] = pr, md, X
    out["preds"]["seasonal_naive"] = {0.5: naive}
    out["preds"]["eia_day_ahead"] = {0.5: eia}
    out["preds"]["eia_debiased"] = {0.5: eia * df["eia_ratio_28d"].to_numpy().astype(float)}
    return out


def cqr_offset(y, lo, hi, alpha=0.2) -> float:
    e = np.maximum(lo - y, y - hi)
    n = len(e)
    k = min(int(np.ceil((n + 1) * (1 - alpha))), n)
    return float(np.sort(e)[k - 1])


if __name__ == "__main__":
    for ba in ("CISO", "ERCO"):
        r = run(ba)
        m, c, y = r["masks"], r["common"], r["df"]["demand"].to_numpy().astype(float)
        t = m["test"] & c
        print(ba, r["params"], "test n", t.sum())
        for k, v in r["preds"].items():
            print(" ", k, "test MAPE %.2f" % mape(y[t], v[0.5][t]), "val MAPE %.2f" % mape(y[m["val"] & c], v[0.5][m["val"] & c]))
