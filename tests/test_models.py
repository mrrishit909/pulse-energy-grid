from datetime import timedelta

import numpy as np
import polars as pl
import pytest

from analytics import evaluate as EV
from analytics import forecast as F
from analytics.data import hourly
from pipelines.common import BAS, TRAIN_END, VAL_END

slow = pytest.mark.slow


def test_split_is_strictly_temporal_and_disjoint():
    ts = pl.Series("ts", np.arange(np.datetime64("2021-01-01T00"), np.datetime64("2025-08-27T00")).astype("datetime64[us]"))
    m = F.split_masks(ts)
    assert (m["train"].astype(int) + m["val"].astype(int) + m["test"].astype(int) == 1).all()
    t = ts.to_numpy()
    assert t[m["train"]].max() < t[m["val"]].min() and t[m["val"]].max() < t[m["test"]].min()
    assert t[m["train"]].max() == np.datetime64(TRAIN_END) and t[m["val"]].max() == np.datetime64(VAL_END)


@slow
@pytest.mark.parametrize("ba", BAS)
def test_features_use_only_data_before_forecast_origin(ba):
    """Null every observation at or after a row's forecast origin; the deployable features of that row must not change."""
    full = F.build_features(hourly(ba))
    rng = np.random.default_rng(7)
    test_rows = np.where(F.split_masks(full["ts_utc"])["test"])[0]
    rows = list(rng.choice(test_rows, 4, replace=False))
    # include the 25-hour fall-back edge case (last local hour of 2024-11-03)
    edge = full.with_row_index().filter((pl.col("local_date") == pl.date(2024, 11, 3)) & (pl.col("local_hour") == 23))["index"][0]
    rows.append(int(edge))
    origins = F.origin_ts(full)
    base = hourly(ba)
    cols = F.FEATURES["gbm"]
    for i in rows:
        o = origins[int(i)]
        mask = base["ts_utc"] >= o
        trunc = base.with_columns([pl.when(mask).then(None).otherwise(pl.col(c)).alias(c) for c in ("demand", "demand_forecast", "temp_c", "dew_c", "interchange")])
        tf = F.build_features(trunc)
        a = full.select(cols).row(int(i))
        b = tf.select(cols).row(int(i))
        for name, x, y in zip(cols, a, b):
            if name in ("ref_week_mean",):
                pass
            assert (x is None and y is None) or (x is not None and y is not None and abs(x - y) < 1e-9), (ba, i, name, x, y)


@slow
def test_pw_and_stack_features_are_the_only_ones_that_see_target_hour():
    assert not set(F.FEATURES["gbm"]) & set(F.PW + F.STACK)
    assert set(F.PW) <= set(F.FEATURES["gbm_perfect_weather"]) and set(F.STACK) <= set(F.FEATURES["gbm_stacked"])


def test_cqr_offset_gives_coverage():
    rng = np.random.default_rng(1)
    y = rng.normal(0, 1, 5000)
    lo, hi = np.full(5000, -0.5), np.full(5000, 0.5)  # intervals too narrow
    off = F.cqr_offset(y[:2500], lo[:2500], hi[:2500], 0.2)
    cov = ((y[2500:] >= lo[2500:] - off) & (y[2500:] <= hi[2500:] + off)).mean()
    assert 0.77 < cov < 0.83


def test_block_bootstrap_ci_contains_mean_and_is_ordered():
    d = np.random.default_rng(2).normal(-0.5, 1, 365)
    lo, hi = EV.block_bootstrap_ci(d)
    assert lo < d.mean() < hi and hi - lo < 0.6


def test_forecast_eval_artifact_is_consistent(art):
    fe = art("forecast_eval")["bas"]
    for ba in BAS:
        e = fe[ba]
        assert e["split"]["test"][0] == VAL_END and e["common_test_hours"] > 8000
        m = e["models"]
        assert m["seasonal_naive"]["available_at_forecast_time"] and not m["gbm_perfect_weather"]["available_at_forecast_time"]
        for k, v in m.items():
            assert v["mape_pct"] > 0 and v["mae_mw"] > 0 and len(v["mape_by_hour"]) == 24 and len(v["mape_by_month"]) == 12
        assert m["gbm"]["mape_pct"] < m["seasonal_naive"]["mape_pct"]  # a weather/lag model must beat last week
        for iv in e["intervals"].values():
            assert 0 < iv["raw_coverage_pct"] <= 100 and iv["cqr_mean_width_mw"] >= iv["mean_width_mw"]
        c = e["comparison_vs_eia"]
        assert c["beats_eia"] == (c["mape_diff_ci95"][1] < 0)
        assert ("worse" in c["statement"]) or ("better" in c["statement"]) or ("indistinguishable" in c["statement"])


def test_facts_agree_with_forecast_eval(art):
    f, fe = art("facts")["bas"], art("forecast_eval")["bas"]
    for ba in BAS:
        for k, v in fe[ba]["models"].items():
            assert f[ba]["test_mape"][k] == pytest.approx(v["mape_pct"], abs=0.006)
        assert f[ba]["beats_eia"] == fe[ba]["comparison_vs_eia"]["beats_eia"]
