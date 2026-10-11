"""Assemble every site artifact (site/public/data/*.json) from interim data + analytics. Deterministic."""
from __future__ import annotations

import gzip
import json
from datetime import datetime

import numpy as np
import polars as pl

from analytics import dispatch as X
from analytics import descriptive as D
from analytics import evaluate as EV
from analytics import forecast as F
from analytics.data import hourly
from pipelines.common import BA_NAMES, BA_TZ, BAS, END, FUELS, MANIFESTS, PROCESSED, PUBLIC, START, TRAIN_END, VAL_END, write_json
from pipelines.ingestion import topology
from pipelines.ingestion.noaa import STATIONS

VERSION = "0.1.0"
TOL_REL = 1e-6


def rnd(o, nd=4):
    if isinstance(o, float):
        return round(o, nd)
    if isinstance(o, dict):
        return {k: rnd(v, nd) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [rnd(v, nd) for v in o]
    return o


def emit(name: str, obj: dict, exact: dict | None = None) -> int:
    """Write an artifact with floats rounded to 4 decimals; `exact` top-level keys are written unrounded
    (tolerances such as 1e-6 would otherwise round to 0.0)."""
    return write_json(PUBLIC / f"{name}.json", {**rnd(obj), **(exact or {})})


def eia_bias_by_year(df: pl.DataFrame) -> dict[str, float]:
    """100 x mean(EIA day-ahead forecast - demand) / mean(demand) per local year, hours where both are clean (>= 1000 hours)."""
    ok = df.filter((pl.col("demand_status") == "ok") & (pl.col("demand_forecast_status") == "ok"))
    g = ok.group_by("local_year").agg(((pl.col("demand_forecast") - pl.col("demand")).mean() / pl.col("demand").mean() * 100).alias("b"), pl.len().alias("n")).sort("local_year")
    return {str(y): round(float(b), 2) for y, b, n in g.iter_rows() if n >= 1000}


def _generated_at() -> str:
    ex = json.loads((MANIFESTS / "eia_extract.json").read_text())
    ts = [datetime.strptime(v["last_updated"], "%d-%b-%y %I.%M.%S %p") for v in ex["series"].values()]
    return max(ts).isoformat() + "Z"


def build_all() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    led = json.loads((MANIFESTS / "cleaning_ledger.json").read_text())
    exm = json.loads((MANIFESTS / "eia_extract.json").read_text())
    nm = json.loads((MANIFESTS / "noaa_extract.json").read_text())
    topo = topology.parse()
    sha_topo = topo.pop("_sha256")
    tags = {}

    def T(name, **kw):
        tags[name] = kw
        return kw

    # ---- reconciliation + quality
    ledger = []
    for ba in BAS:
        for r in led[ba]["ledger"]:
            r = dict(r)
            r["flagged_range"], r["flagged_spike"] = r.pop("_range"), r.pop("_spike")
            ledger.append(r)
    emit("reconciliation", {"schema_version": "v1", "tags": T("reconciliation", ledger="OBSERVED/DERIVED", generation_vs_total="DERIVED", balance="DERIVED", weather="OBSERVED/DERIVED"),
                            "invariants": ["grid_slots = raw_rows + missing_slots", "raw_rows = kept + null_value + flagged_outlier (flagged_outlier = flagged_range + flagged_spike)", "imputed_short_gap hours are a subset of non-kept slots filled by linear interpolation and are never used as forecast targets"],
                            "ledger": ledger, "generation_vs_total": {ba: led[ba]["generation_vs_total"] for ba in BAS}, "balance": {ba: led[ba]["balance"] for ba in BAS},
                            "weather": [w for ba in BAS for w in led[ba]["weather"]]})
    core = {"D", "DF", "NG"}
    rules = [("range", "demand, forecast, total generation", "value <= 0, below 0.2 x or above 3 x the series median", {ba: sum(r["_range"] for r in led[ba]["ledger"] if r["kind"] in core) for ba in BAS}),
             ("spike", "demand, forecast, total generation", "differs >35% from the median of the same hour-of-week over +/-3 weeks AND >20% from both neighbouring hours in the same direction", {ba: sum(r["_spike"] for r in led[ba]["ledger"] if r["kind"] in core) for ba in BAS}),
             ("gen_range", "net generation by fuel", "absolute value above 1.5 x the larger of |P0.1| and |P99.9| of the series", {ba: sum(r["_range"] for r in led[ba]["ledger"] if r["kind"] == "GEN") for ba in BAS}),
             ("short_gap_imputation", "demand, forecast, total generation", "runs of at most 3 missing/null/flagged hours are linearly interpolated, flagged imputed, excluded from targets", {ba: sum(r["imputed_short_gap"] for r in led[ba]["ledger"]) for ba in BAS}),
             ("negative_generation_kept", "net generation by fuel", "negative fuel values are physical (storage charging in OTH, station service) and are retained, not flagged", {ba: int(hourly(ba).select([(pl.col(f"gen_{f.lower()}") < 0).sum() for f in FUELS[ba]]).sum_horizontal()[0]) for ba in BAS})]
    emit("quality", {"schema_version": "v1", "tags": T("quality", gaps="OBSERVED/DERIVED", dst="DERIVED", outlier_rules="DERIVED", spike_examples="OBSERVED"),
                     "gaps": {ba: {"series": led[ba]["quality"]["gaps"]} for ba in BAS}, "dst": {ba: led[ba]["quality"]["dst"] for ba in BAS},
                     "outlier_rules": [{"id": i, "applies_to": a, "rule": r, "flagged": c} for i, a, r, c in rules], "spike_examples": {ba: led[ba]["quality"]["spikes"] for ba in BAS}})

    # ---- per-BA analytics
    prof, mix, wrel, fe, fs, runs, cfgs, caps = {}, {}, {}, {}, {}, {}, {}, {}
    for ba in BAS:
        df = hourly(ba)
        prof[ba] = D.demand_profile(df, ba)
        mix[ba] = D.fuel_mix(df, ba)
        wrel[ba] = D.weather_relation(df, ba)
        r = F.run_cached(ba)
        runs[ba] = r
        fe[ba] = EV.evaluate(ba, r)
        fs[ba] = EV.samples(ba, r, fe[ba])
        peak = float(df.filter(pl.col("demand_status") == "ok")["demand"].max())
        cfgs[ba] = rnd(X.build_config(ba, df, mix[ba]["capacity_proxy_mw"], wrel[ba], peak))  # round BEFORE solving so the published inputs reproduce the LP exactly
        # predictions cache for tests/inspection
        PROCESSED.mkdir(parents=True, exist_ok=True)
        pr = r["df"].select("ts_utc", "demand", "demand_status", "demand_forecast", "demand_forecast_status").with_columns(
            pl.Series("split", np.where(r["masks"]["train"], "train", np.where(r["masks"]["val"], "val", "test"))), pl.Series("common", r["common"]),
            *[pl.Series(f"{k}_p{int(q * 100)}", v) for k, d in r["preds"].items() for q, v in d.items()])
        pr.fill_nan(None).write_parquet(PROCESSED / f"predictions_{ba}.parquet")
    emit("demand_profile", {"schema_version": "v1", "tags": T("demand_profile", daily="OBSERVED/DERIVED", month_hour_mean_mw="OBSERVED/DERIVED", how_mean_mw="OBSERVED/DERIVED", annual="OBSERVED/DERIVED"), "bas": prof})
    emit("fuel_mix", {"schema_version": "v1", "tags": T("fuel_mix", annual_share_pct="OBSERVED/DERIVED", month_hour_mean_mw="OBSERVED/DERIVED", capacity_proxy_mw="DERIVED", evening_ramp="DERIVED"), "bas": mix})
    emit("weather_relation", {"schema_version": "v1", "tags": T("weather_relation", model="DERIVED", binned="OBSERVED/DERIVED", pct_demand_per_c_above_base="DERIVED"), "bas": wrel})
    emit("forecast_eval", {"schema_version": "v1", "tags": T("forecast_eval", models="PREDICTED", intervals="PREDICTED", comparisons="PREDICTED/DERIVED", importance="DERIVED"), "bas": fe})
    emit("forecast_samples", {"schema_version": "v1", "tags": T("forecast_samples", actual_mw="OBSERVED", eia_mw="OBSERVED", naive_mw="PREDICTED", gbm_mw="PREDICTED", gbm_p10_mw="PREDICTED", gbm_p90_mw="PREDICTED", daily_test="PREDICTED/DERIVED"), "bas": fs})

    # ---- dispatch
    results, vectors = X.run_all(cfgs)
    ref_ba, ref_day = "CISO", "summer"
    ref_cfg = cfgs[ref_ba]
    lp = X.make_lp(ref_cfg, next(d for d in ref_cfg["days"] if d["id"] == ref_day), {})
    sol = X.solve(lp)
    emit("dispatch_model", {"schema_version": "v1", "tags": T("dispatch_model", formulation="SIMULATED", scenarios="SIMULATED", assumptions="SIMULATED", classes="SIMULATED/DERIVED", days="OBSERVED/DERIVED", observed_gen_mw="OBSERVED",
                                                           observed_interchange_mw="OBSERVED", battery="SIMULATED", heat_wave="DERIVED", controls="SIMULATED"),
                            "formulation": X.formulation(), "solver_versions": {"python_highspy": X.HIGHSPY_VERSION, "python_highs": X.HIGHS_VERSION, "browser": "highs@1.15.3 (HiGHS-wasm), declared by the web build and not executed in this repository"},
                            "scenarios": [{k: v for k, v in m.items()} for m in X.SCENARIO_META], "assumptions": X.assumptions("CISO") + [{"id": "gas_price_by_ba", "value": X.GAS_PRICE, "unit": "USD/MMBtu", "basis": "ASSUMPTION (SIMULATED)"}],
                            "bas": {ba: {k: cfgs[ba][k] for k in ("classes", "battery", "voll_usd_mwh", "days", "heat_wave", "display_order", "fixed_series", "sinks", "sign_convention", "controls", "scenarios")} for ba in BAS},
                            "reference_lp": {"ba": ref_ba, "day": ref_day, "scenario": "baseline", "objective_usd": sol["objective"], "cplex_lp": X.to_cplex_lp(lp)}})
    emit("dispatch_results", {"schema_version": "v1", "tags": T("dispatch_results", dispatch="SIMULATED", price="SIMULATED", co2="SIMULATED", renewable_share="SIMULATED", marginal_class="SIMULATED/DERIVED"), "bas": results})
    emit("dispatch_test_vectors", {"schema_version": "v1", "tags": T("dispatch_test_vectors", expected="SIMULATED"), "tolerance_rel": TOL_REL, "tolerance_abs": 0.5, "tolerance_price_usd_mwh": 0.01,
                                   "parity_keys": ["objective_usd", "cost_breakdown_usd", "unserved_mwh", "co2_t"],
                                   "lp_text": "lp_text_sha256 is the SHA-256 of the UTF-8 CPLEX LP text produced by analytics/dispatch.py::to_cplex_lp for that vector (numbers formatted '%.10g', variables x0.., rows r0..; see dispatch_model.formulation for the order). "
                                              "The text itself is not stored per vector (about 30 KB each); rebuild it from dispatch_model.json (ba, day, params). Objective parity is the pass criterion; the hash is a diagnostic that fails first if the builder differs.",
                                   "note": "Rebuild the LP from dispatch_model.json (ba, day, params) in the browser and solve with HiGHS. Compare objective_usd, cost_breakdown_usd, unserved_mwh and co2_t within tolerance_rel (abs tolerance_abs for values near zero). "
                                           "price_usd_mwh is compared (tolerance_price_usd_mwh) only when expected.price_comparable is true, i.e. the balance duals were verified unique by finite differences; otherwise duals can differ between optimal vertices. "
                                           "class_energy_mwh, curtailed_mwh, soc_mwh and marginal_class are informative: zero-cost choices (hydro timing, curtailment split) can differ between optimal vertices. Vector kinds: preset, random (seeded interior control combinations), stress_unserved, stress_curtailment.",
                                   "vectors": vectors}, exact={"tolerance_rel": TOL_REL})
    emit("grid_topology", {"schema_version": "v1", "tags": T("grid_topology", buses="SYNTHETIC", branches="SYNTHETIC", generators="SYNTHETIC"), "tag": "SYNTHETIC", **topo})

    # ---- facts
    facts = {}
    for ba in BAS:
        df = hourly(ba)
        ok = df.filter(pl.col("demand_status") == "ok")
        pk = ok.sort("demand", descending=True).row(0, named=True)
        loc = pk["ts_utc"].replace(tzinfo=__import__("zoneinfo").ZoneInfo("UTC")).astimezone(__import__("zoneinfo").ZoneInfo(BA_TZ[ba]))
        e = fe[ba]
        s = mix[ba]["annual_share_pct"]
        best_dep = e["comparison_vs_eia"]["best_model"]
        summer = results[ba]["days"]["summer"]["baseline"]
        facts[ba] = {"hours_expected": int(df.height), "demand_hours_kept": int(ok.height), "demand_coverage_pct": round(ok.height / df.height * 100, 2), "peak_demand_mw": float(pk["demand"]), "peak_demand_local": loc.strftime("%Y-%m-%d %H:%M"),
                     "mean_demand_mw": round(float(ok["demand"].mean()), 0), "min_demand_mw": float(ok["demand"].min()), "solar_share_pct": s["SUN"], "wind_share_pct": s["WND"], "gas_share_pct": s["NG"],
                     "clean_share_pct": round(s["SUN"] + s["WND"] + s["WAT"] + s["NUC"], 2), "evening_ramp_mw_per_h": round(mix[ba]["evening_ramp"]["mean_mw_per_h"], 0), "demand_temp_slope_pct_per_c": round(wrel[ba]["pct_demand_per_c_above_base"], 2),
                     "test_hours": e["common_test_hours"], "test_mape": {k: round(v["mape_pct"], 2) for k, v in e["models"].items()}, "test_mae_mw": {k: round(v["mae_mw"], 0) for k, v in e["models"].items()},
                     "interval_coverage_cqr_pct": round(e["intervals"]["gbm"]["cqr_coverage_pct"], 1), "interval_nominal_pct": 80, "beats_eia": e["comparison_vs_eia"]["beats_eia"], "best_model": best_dep,
                     "skill_vs_eia_pct": round((1 - e["models"]["gbm"]["mape_pct"] / e["models"]["eia_day_ahead"]["mape_pct"]) * 100, 1),
                     "dispatch_baseline_cost_usd": round(summer["objective_usd"], 0), "dispatch_reference_days": len(cfgs[ba]["days"]), **D.net_load_facts(df, ba),
                     "eia_dayahead_bias_pct_by_year": eia_bias_by_year(df)}
    tot_raw = sum(r["raw_rows"] for r in ledger)
    tot_kept = sum(r["kept"] for r in ledger)
    ciso_bias = facts["CISO"]["eia_dayahead_bias_pct_by_year"]
    bias_year = max(ciso_bias, key=int)
    emit("facts", {"schema_version": "v1", "tags": T("facts", bas="OBSERVED/DERIVED/PREDICTED/SIMULATED", **{"global": "DERIVED"}, eia_ciso_dayahead_bias_pct="DERIVED"), "bas": facts,
                   "eia_ciso_dayahead_bias_pct": ciso_bias[bias_year], "eia_ciso_dayahead_bias_year": int(bias_year),
                   "global": {"raw_rows_total": tot_raw, "kept_rows_total": tot_kept, "flagged_rows_total": sum(r["flagged_outlier"] for r in ledger), "bas": list(BAS),
                              "window_days": round(len(hourly(BAS[0])) / 24, 1), "topology_buses": len(topo["buses"]),
                              "definitions": {"interchange_abs_mean_pct_of_demand": "mean |total interchange| / mean demand x 100, clean demand hours", "interchange_net_mean_pct_of_demand": "mean total interchange (positive = export) / mean demand x 100",
                                              "deepest_bite_month": "calendar month (1-12) with the lowest mean midday (10:00-15:59 local) net load = demand - solar - wind, in bite_year (latest year with at least 8000 clean hours)",
                                              "eia_dayahead_bias_pct_by_year": "100 x mean(EIA-930 day-ahead demand forecast - demand) / mean(demand) per local calendar year, hours where both are clean, years with at least 1000 such hours; negative = the BA's forecast ran low. eia_ciso_dayahead_bias_pct is CISO's value in eia_ciso_dayahead_bias_year (the latest year; partial when the window ends mid-year)",
                                              "midday_net_load_min_mw_first_year/latest_year": "minimum hourly midday net load in net_load_first_year / net_load_latest_year (first and latest years with at least 8000 clean hours); in CISO this is the depth of the duck-curve belly"}}})

    # ---- meta (last, with sizes)
    sizes = {}
    for f in sorted(PUBLIC.glob("*.json")):
        b = f.read_bytes()
        sizes[f.stem] = {"bytes": len(b), "gzip_bytes": len(gzip.compress(b, 9, mtime=0))}
    emit("meta", {"schema_version": "v1", "tags": T("meta", sources="OBSERVED"), "pipeline_version": VERSION, "generated_at": _generated_at(), "window_utc": [START, END], "hours_in_window": int(hourly(BAS[0]).height),
                  "split": {"train": [START, TRAIN_END], "val": [TRAIN_END, VAL_END], "test": [VAL_END, END]},
                  "bas": {ba: {"name": BA_NAMES[ba], "tz": BA_TZ[ba], "fuels": list(FUELS[ba]), "stations": [{"id": s[1], "name": s[2], "weight": s[3]} for s in STATIONS if s[0] == ba]} for ba in BAS},
                  "sources": {"eia": {"url": exm["source_url"], "zip_sha256": exm["zip_sha256"], "zip_bytes": exm["zip_bytes"], "rows_extracted": exm["raw_rows_extracted"]}, "noaa": {"url": nm["source"], "files": len(nm["files"]), "raw_observations": nm["raw_observations"]},
                              "pglib": {"url": topo["source"], "sha256": sha_topo}},
                  "attribution": ["Source: U.S. Energy Information Administration (EIA-930 Hourly Electric Grid Monitor, bulk file EBA.zip). EIA content here is the observed hourly demand, forecast, generation and interchange series; everything else is this project's own computation.",
                                  "Weather: NOAA National Centers for Environmental Information, Integrated Surface Database (hourly).",
                                  "Topology: IEEE PES Power Grid Library pglib-opf, IEEE 14-bus case, CC BY 4.0. Illustrative test system, not a real grid."],
                  "artifact_tags": tags, "artifact_bytes": sizes})
    # meta's own size is recorded on the next pass through validate_artifacts; no self-reference
    for k, v in sorted(sizes.items()):
        print(f"{k:24s} {v['bytes']:>9,d} B  gzip {v['gzip_bytes']:>8,d} B")
