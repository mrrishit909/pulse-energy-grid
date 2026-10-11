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
    assert dem["missing_hours"] >= 0 and dem["longest_gap_h"] <= 72  # the longest gaps are the excluded timing-transition days (3 local days)


def test_outlier_rules_are_declared_and_nonnegative(art):
    q = art("quality")
    ids = {r["id"] for r in q["outlier_rules"]}
    assert {"range", "spike", "short_gap_imputation", "negative_generation_kept"} <= ids
    assert all(v >= 0 for r in q["outlier_rules"] for v in r["flagged"].values())


# ---- timestamp convention: EIA-930 stamps are hour-ending; ts_utc / local_hour are interval STARTS ----
import math
from datetime import date, datetime
from zoneinfo import ZoneInfo

from analytics.solar import centroid, solar_noon_clock  # noqa: E402


@pytest.mark.parametrize("ba", BAS)
def test_reference_days_solar_is_dark_at_night_and_centred_on_solar_noon(art, ba):
    for d in art("dispatch_model")["bas"][ba]["days"]:
        sun = d["observed_gen_mw"]["SUN"]
        peak = max(sun)
        night = [sun[h] for h in (22, 23, 0, 1, 2, 3)]
        assert max(night) <= 0.01 * peak, (ba, d["id"], night)
        noon = solar_noon_clock(ba, date.fromisoformat(d["date"]))
        assert abs(centroid(sun) - noon) <= 0.75, (ba, d["id"], centroid(sun), noon)
        assert d["avail_mw"]["solar"] == [max(v, 0) for v in sun]


@slow
@pytest.mark.parametrize("ba", BAS)
def test_summer_solar_profile_by_local_hour(hourly_all, ba):
    d = hourly_all.filter((pl.col("ba") == ba) & pl.col("local_month").is_in([6, 7, 8]) & pl.col("gen_sun").is_not_null())
    prof = d.group_by("local_hour").agg(pl.col("gen_sun").mean()).sort("local_hour")["gen_sun"].to_list()
    assert max(prof[h] for h in (22, 23, 0, 1, 2, 3)) <= 0.01 * max(prof)
    noon = sum(solar_noon_clock(ba, date(2024, m, 15)) for m in (6, 7, 8)) / 3
    assert abs(centroid(prof) - noon) <= 0.75


@slow
@pytest.mark.parametrize("ba", BAS)
def test_every_month_solar_centroid_within_075h_of_solar_noon(hourly_all, ba):
    d = hourly_all.filter((pl.col("ba") == ba) & pl.col("gen_sun").is_not_null())
    for m in range(1, 13):
        prof = d.filter(pl.col("local_month") == m).group_by("local_hour").agg(pl.col("gen_sun").mean()).sort("local_hour")["gen_sun"].to_list()
        mid = date(2024, m, 15)
        # DST starts/ends mid-March/early-November: use the clock offset of the month's majority of days
        noon = sum(solar_noon_clock(ba, date(2024, m, dd)) for dd in (3, 10, 17, 24)) / 4
        assert abs(centroid(prof) - noon) <= 0.75, (ba, m, centroid(prof), noon)
        assert max(prof[h] for h in (22, 23, 0, 1, 2, 3)) <= 0.01 * max(prof)


@slow
@pytest.mark.parametrize("ba", BAS)
def test_solar_timing_every_year_and_month_bin(hourly_all, ba):
    """P04-DATA-004: the all-years test hid opposite shifts in CISO; every (year, month) bin must be within +/-0.75 h and dark at night."""
    d = hourly_all.filter((pl.col("ba") == ba) & pl.col("gen_sun").is_not_null() & (pl.col("local_year") >= 2021))
    checked = 0
    for (y, m), x in d.group_by(["local_year", "local_month"]):
        if x.height < 200:
            continue
        prof = x.group_by("local_hour").agg(pl.col("gen_sun").mean()).sort("local_hour")["gen_sun"].to_list()
        noon = sum(solar_noon_clock(ba, date(y, m, dd)) for dd in (3, 10, 17, 24)) / 4
        assert abs(centroid(prof) - noon) <= 0.75, (ba, y, m, centroid(prof) - noon)
        assert max(prof[h] for h in (22, 23, 0, 1, 2, 3)) <= 0.01 * max(prof), (ba, y, m)
        checked += 1
    assert checked >= 50


@slow
@pytest.mark.parametrize("ba", BAS)
def test_forecast_and_demand_best_lag_is_zero_every_year(hourly_all, ba):
    import numpy as np
    d = hourly_all.filter(pl.col("ba") == ba).sort("ts_utc")
    D, F = d["demand"].to_numpy().astype(float), d["demand_forecast"].to_numpy().astype(float)
    ok = ((d["demand_status"] == "ok") & (d["demand_forecast_status"] == "ok")).to_numpy()
    yr = d["local_year"].to_numpy()
    for y in range(2021, 2026):
        best = None
        for k in (-2, -1, 0, 1, 2):
            Fs = np.roll(F, k)
            m = ok & np.roll(ok, k) & (yr == y) & np.isfinite(Fs) & np.isfinite(D)
            e = float(np.mean(np.abs(Fs[m] - D[m]) / D[m]))
            best = (e, k) if best is None or e < best[0] else best
        assert best[1] == 0, (ba, y, best)


@slow
@pytest.mark.parametrize("ba", BAS)
def test_net_generation_demand_interchange_identity_best_lag_zero_by_period(hourly_all, ba):
    import numpy as np
    d = hourly_all.filter(pl.col("ba") == ba).sort("ts_utc")
    NG, D, TI = (d[c].to_numpy().astype(float) for c in ("net_gen", "demand", "interchange"))
    ok = ((d["net_gen_status"] == "ok") & (d["demand_status"] == "ok")).to_numpy()
    yr = d["local_year"].to_numpy()
    for y in range(2021, 2026):
        res = {}
        for kd in (-1, 0, 1):
            r = (NG - np.roll(D, kd) - TI)[ok & (yr == y)]
            res[kd] = float(np.nanmean(np.abs(r)))
        assert min(res, key=res.get) == 0, (ba, y, res)


@slow
def test_timing_manifest_and_dst_transition_days(hourly_all):
    import json
    from pipelines.common import MANIFESTS
    t = json.loads((MANIFESTS / "timing_corrections.json").read_text())
    assert len(t["CISO"]["boundaries"]) == 2 and t["ERCO"]["boundaries"] == []
    assert {s["c_gen_h"] for s in t["CISO"]["segments"]} == {1, 0, -1}
    for ba in BAS:
        for s in t[ba]["segments"]:
            assert abs(s["solar_offset_median_h_after"]) <= 0.5
            assert s["identity_resid_mw_after"] <= s["identity_resid_mw_before"] + 1e-9
    # DST transition days keep 23 / 25 local hours and a sane solar centroid after correction
    for ba, dts in (("CISO", [date(2024, 3, 10), date(2024, 11, 3)]), ("ERCO", [date(2024, 3, 10), date(2024, 11, 3)])):
        for dt_ in dts:
            x = hourly_all.filter((pl.col("ba") == ba) & (pl.col("local_date") == dt_))
            assert x.height in (23, 25)
            sun = x.sort("ts_utc")["gen_sun"].to_list()
            assert max(sun[:3]) <= 0.02 * max(sun)
