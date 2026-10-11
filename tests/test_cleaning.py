import numpy as np
import polars as pl
import pytest

from pipelines.cleaning import clean
from pipelines.common import BAS

slow = pytest.mark.slow


def test_fill_short_fills_only_short_bounded_gaps():
    x = np.array([1.0, np.nan, np.nan, 4.0, np.nan, np.nan, np.nan, np.nan, 9.0, np.nan])
    y, imp = clean.fill_short(x, 3)
    assert list(y[:4]) == [1.0, 2.0, 3.0, 4.0]
    assert np.isnan(y[4:8]).all() and np.isnan(y[9])  # 4-hour gap and trailing gap are left alone
    assert imp.sum() == 2


def test_spike_rule_flags_isolated_spike_but_not_level_shift():
    rng = np.random.default_rng(0)
    base = 100 + 10 * np.sin(np.arange(168 * 8) * 2 * np.pi / 24) + rng.normal(0, 0.5, 168 * 8)
    x = base.copy()
    x[700] = base[700] * 0.4  # isolated dip
    x[900:] *= 1.5  # sustained level shift is not a spike
    rng_f, spk, _, _ = clean.flag_series(x)
    assert spk[700] and not spk[900:960].any() and not rng_f[700]


@slow
def test_full_hourly_grid_and_no_duplicates(hourly_all):
    for ba in BAS:
        d = hourly_all.filter(pl.col("ba") == ba).sort("ts_utc")
        assert d.height == 40776
        assert d["ts_utc"].n_unique() == d.height
        assert (d["ts_utc"].diff().drop_nulls() == pl.duration(hours=1)).all()


@slow
def test_dst_day_counts_and_local_hours(hourly_all):
    ca = clean.dst_info("America/Los_Angeles")
    assert (ca["days_23h"], ca["days_25h"]) == (5, 4)  # springs 2021..2025, falls 2021..2024 inside the window
    tx = clean.dst_info("America/Chicago")
    assert (tx["days_23h"], tx["days_25h"]) == (5, 4)
    d = hourly_all.filter((pl.col("ba") == "CISO") & (pl.col("local_date") == pl.date(2024, 11, 3)))
    assert d.height == 25 and sorted(d["local_hour"].unique().to_list()) == list(range(24))
    d = hourly_all.filter((pl.col("ba") == "CISO") & (pl.col("local_date") == pl.date(2024, 3, 10)))
    assert d.height == 23


@slow
def test_flagged_values_are_retained_as_flags_not_dropped(hourly_all):
    d = hourly_all.filter(pl.col("ba") == "CISO")
    assert (d["demand_status"] == "flagged").sum() + (d["net_gen_status"] == "flagged").sum() > 0
    assert d.filter(pl.col("demand_status") == "flagged")["demand"].is_null().all()  # flagged values are not used downstream


@slow
def test_imputed_hours_are_flagged(hourly_all):
    d = hourly_all.filter(pl.col("ba") == "CISO")
    imp = d.filter(pl.col("demand_status") == "imputed")
    assert imp.height > 0 and imp["demand"].is_not_null().all()
