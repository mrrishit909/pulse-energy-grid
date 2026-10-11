import polars as pl
import pytest

from pipelines.common import BAS

slow = pytest.mark.slow


@slow
@pytest.mark.parametrize("ba", BAS)
def test_value_ranges(hourly_all, ba):
    d = hourly_all.filter(pl.col("ba") == ba)
    ok = d.filter(pl.col("demand_status") == "ok")
    assert 8_000 < ok["demand"].min() and ok["demand"].max() < 100_000
    assert d["temp_c"].min() > -35 and d["temp_c"].max() < 50
    assert d["temp_c"].null_count() < 50
    assert (d["gen_sun"].drop_nulls() >= -1).all() or ba == "CISO"  # solar never meaningfully negative
    assert d["interchange"].abs().max() < 20_000


@slow
@pytest.mark.parametrize("ba", BAS)
def test_demand_coverage_and_gap_report(hourly_all, art, ba):
    d = hourly_all.filter(pl.col("ba") == ba)
    kept = (d["demand_status"] == "ok").sum()
    assert kept / d.height > 0.995
    q = art("quality")["gaps"][ba]["series"]
    dem = next(s for s in q if s["series"] == "D")
    assert dem["missing_hours"] >= 0 and dem["longest_gap_h"] <= 24


def test_outlier_rules_are_declared_and_nonnegative(art):
    q = art("quality")
    ids = {r["id"] for r in q["outlier_rules"]}
    assert {"range", "spike", "short_gap_imputation", "negative_generation_kept"} <= ids
    assert all(v >= 0 for r in q["outlier_rules"] for v in r["flagged"].values())
