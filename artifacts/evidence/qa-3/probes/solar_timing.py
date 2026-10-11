"""P04-QA-003 (copy of the P04-QA-002 probe) D-008 / D-025 data probe (read-only). Run from the project root: uv run python artifacts/evidence/qa-3/probes/solar_timing.py
1. Per BA x year x month: generation-weighted solar centroid (interval midpoint, local hour + 0.5) minus solar noon
   (the builder's own solar_noon_clock from tests/test_quality.py), i.e. the test the builder ran pooled over all years.
2. CISO step dates: 7-day rolling median of the daily centroid offset.
3. Per BA x year: MAPE of the EIA day-ahead forecast (DF) against demand (D) with DF delayed by k = -2..+2 hours; the
   best k should be 0 if D and DF share one time convention.
4. Test split (forecast_eval split): EIA MAPE at k = 0 (published) and k = +1.
5. Reference days in dispatch_model: hourly solar as % of the day's peak (sunrise / sunset hours by eye)."""
import json, sys
from datetime import date
import numpy as np, polars as pl
sys.path.insert(0, "."); sys.path.insert(0, "tests")
from analytics.data import hourly
from test_quality import solar_noon_clock, centroid
h = hourly()
print("== 1. solar centroid minus solar noon (h), by year and month")
for ba in ["CISO", "ERCO"]:
    d = h.filter((pl.col("ba") == ba) & pl.col("gen_sun").is_not_null())
    for y in range(2021, 2026):
        row = []
        for m in range(1, 13):
            x = d.filter((pl.col("local_month") == m) & (pl.col("local_year") == y))
            if x.height < 200: row.append(f"{m}:  na "); continue
            prof = x.group_by("local_hour").agg(pl.col("gen_sun").mean()).sort("local_hour")["gen_sun"].to_list()
            noon = sum(solar_noon_clock(ba, date(y, m, dd)) for dd in (3, 10, 17, 24)) / 4
            row.append(f"{m}:{centroid(prof) - noon:+.2f}")
        print(ba, y, " ".join(row))
print("== 2. CISO step dates (7-day rolling median of the daily offset, printed when it moves by >= 0.5 h)")
c = h.filter((pl.col("ba") == "CISO") & pl.col("gen_sun").is_not_null()).with_columns(pl.col("gen_sun").clip(lower_bound=0).alias("s"))
g = c.group_by("local_date").agg(((pl.col("local_hour") + 0.5) * pl.col("s")).sum().alias("a"), pl.col("s").sum().alias("b"), pl.len().alias("n")).sort("local_date").filter(pl.col("n") == 24)
ds = g["local_date"].to_list(); off = np.array([a / b - solar_noon_clock("CISO", dd) for a, b, dd in zip(g["a"], g["b"], ds)])
r = np.array([np.median(off[max(0, i - 3):i + 4]) for i in range(len(off))]); ref = r[0]
print(ds[0], f"{r[0]:+.2f}")
for i in range(len(r)):
    if abs(r[i] - ref) >= 0.5 and abs(np.median(r[i:i + 30]) - ref) >= 0.5: print(ds[i], f"{r[i]:+.2f}"); ref = np.median(r[i:i + 30])
print("== 3. EIA day-ahead MAPE (%) vs demand with DF delayed by k hours, per year (best k should be 0)")
ev = json.load(open("site/public/data/forecast_eval.json"))
for ba in ["CISO", "ERCO"]:
    d = h.filter(pl.col("ba") == ba).sort("ts_utc")
    D = np.array(d["demand"], dtype=float); F = np.array(d["demand_forecast"], dtype=float)
    ok = (np.array(d["demand_status"]) == "ok") & (np.array(d["demand_forecast_status"]) == "ok")
    yr = np.array(d["local_year"]); ld = np.array(d["local_date"].cast(pl.Utf8))
    for y in range(2021, 2026):
        res = []
        for k in (-2, -1, 0, 1, 2):
            Fs = np.roll(F, k); m = ok & np.roll(ok, k) & (yr == y) & np.isfinite(Fs) & np.isfinite(D)
            res.append((k, 100 * np.mean(np.abs(Fs[m] - D[m]) / D[m])))
        print(ba, y, " ".join(f"k{k:+d}:{v:.2f}" for k, v in res), "best k", min(res, key=lambda t: t[1])[0])
    t0, t1 = ev["bas"][ba]["split"]["test"]; test = (ld >= t0[:10]) & (ld <= t1[:10])
    for k in (0, 1):
        Fs = np.roll(F, k); m = ok & np.roll(ok, k) & test & np.isfinite(Fs) & np.isfinite(D)
        print(f"== 4. {ba} test split {t0[:10]}..{t1[:10]}: EIA MAPE at k={k}: {100 * np.mean(np.abs(Fs[m] - D[m]) / D[m]):.2f}% (n={m.sum()})")
print("== 5. reference days: solar % of the day's peak, hours 05..21 (index h = interval h:00-h+1:00 local)")
dm = json.load(open("site/public/data/dispatch_model.json"))
for ba, b in dm["bas"].items():
    for day in b["days"]:
        s = day["observed_gen_mw"]["SUN"]; pk = max(s)
        print(ba, day["id"], day["date"], " ".join(f"{hh}:{round(100 * max(v, 0) / pk)}" for hh, v in enumerate(s) if 5 <= hh <= 21))
