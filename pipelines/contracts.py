"""Generate JSON Schemas (draft 2020-12) for every published artifact into data/contracts/*.schema.json.

Layout rule: per-BA content lives under a top-level "bas" object keyed by "CISO" / "ERCO". Large series are columnar arrays.
"""
from __future__ import annotations

import json

from pipelines.common import CONTRACTS

N, I, S, B = {"type": "number"}, {"type": "integer"}, {"type": "string"}, {"type": "boolean"}
NN = {"type": ["number", "null"]}
TAGS = {"type": "object", "minProperties": 1, "additionalProperties": {"type": "string", "pattern": "^(OBSERVED|DERIVED|PREDICTED|SIMULATED|SYNTHETIC)(/(OBSERVED|DERIVED|PREDICTED|SIMULATED|SYNTHETIC))*$"}}
BAS = ["CISO", "ERCO"]


def arr(item, n=None, lo=None):
    d = {"type": "array", "items": item}
    if n is not None:
        d["minItems"] = d["maxItems"] = n
    elif lo is not None:
        d["minItems"] = lo
    return d


def obj(props: dict, req: list | None = None, extra: bool = True) -> dict:
    return {"type": "object", "properties": props, "required": req if req is not None else list(props), "additionalProperties": extra}


def per_ba(item: dict) -> dict:
    return obj({b: item for b in BAS})


def top(name: str, props: dict, req: list | None = None) -> dict:
    p = {"schema_version": {"const": "v1"}, "tags": TAGS, **props}
    r = ["schema_version", "tags"] + (req if req is not None else list(props))
    return {"$schema": "https://json-schema.org/draft/2020-12/schema", "title": name, **obj(p, r)}


MODEL_IDS = ["seasonal_naive", "eia_day_ahead", "eia_debiased", "gbm", "gbm_stacked", "gbm_perfect_weather"]
VEC = lambda n: arr(N, n)  # noqa: E731
SCEN = ["baseline", "renewables_up", "demand_growth", "battery_big", "heat_wave", "outage"]
GROUPS = ["solar", "wind", "nuclear", "hydro", "gas_cc", "gas_ct", "coal", "oil", "imports", "other"]
PARAMS = obj({"renewables_scale": N, "demand_growth_pct": N, "heat_wave_c": N, "battery_power_mw": N, "battery_hours": N, "outage_class": S, "outage_pct": N}, extra=False)
_CL = ["nuclear", "coal", "ccgt", "peaker", "hydro"]
_MW = {k: VEC(24) for k in _CL + ["battery_discharge"]}
DISP = obj(_MW, req=["nuclear", "ccgt", "peaker", "hydro", "battery_discharge"], extra=False)
DISP_E = obj({k: N for k in _MW}, req=["nuclear", "ccgt", "peaker", "hydro", "battery_discharge"], extra=False)
COST = obj({**{k: N for k in _CL}, "battery_wear": N, "unserved_voll": N}, req=["nuclear", "ccgt", "peaker", "hydro", "battery_wear", "unserved_voll"], extra=False)

SCHEMAS = {
    "meta": top("meta", {
        "pipeline_version": S, "generated_at": S, "window_utc": arr(S, 2), "hours_in_window": I,
        "split": obj({k: arr(S, 2) for k in ("train", "val", "test")}),
        "bas": per_ba(obj({"name": S, "tz": S, "fuels": arr(S, lo=7), "stations": arr(obj({"id": S, "name": S, "weight": N}), lo=1)})),
        "sources": {"type": "object"}, "attribution": arr(S, lo=3), "artifact_tags": {"type": "object"}, "artifact_bytes": {"type": "object"}}),
    "facts": top("facts", {"bas": per_ba(obj({k: {} for k in [
        "hours_expected", "demand_hours_kept", "demand_coverage_pct", "peak_demand_mw", "peak_demand_local", "mean_demand_mw", "min_demand_mw",
        "solar_share_pct", "wind_share_pct", "gas_share_pct", "clean_share_pct", "evening_ramp_mw_per_h", "demand_temp_slope_pct_per_c",
        "test_hours", "test_mape", "test_mae_mw", "interval_coverage_cqr_pct", "interval_nominal_pct", "beats_eia", "best_model", "skill_vs_eia_pct",
        "dispatch_baseline_cost_usd", "dispatch_reference_days", "interchange_abs_mean_pct_of_demand", "interchange_net_mean_pct_of_demand", "deepest_bite_month",
        "deepest_bite_month_mean_midday_net_load_mw", "bite_year", "midday_net_load_min_mw_first_year", "midday_net_load_min_mw_latest_year", "net_load_first_year", "net_load_latest_year",
        "eia_dayahead_bias_pct_by_year"]})), "global": obj({k: {} for k in [
        "raw_rows_total", "kept_rows_total", "flagged_rows_total", "bas", "window_days", "topology_buses", "definitions"]}),
        "eia_ciso_dayahead_bias_pct": N, "eia_ciso_dayahead_bias_year": I}),
    "reconciliation": top("reconciliation", {
        "invariants": arr(S, lo=2),
        "ledger": arr(obj({"ba": S, "kind": S, "fuel": S, "grid_slots": I, "raw_rows": I, "missing_slots": I, "null_value": I, "flagged_outlier": I,
                           "kept": I, "imputed_short_gap": I, "flagged_range": I, "flagged_spike": I, "timing_excluded": I}), lo=20),
        "generation_vs_total": per_ba(obj({"n_hours": I, "mean_signed_resid_pct": N, "mean_abs_resid_pct": N, "p99_abs_resid_pct": N, "hours_gt_2pct": I, "definition": S})),
        "balance": per_ba(obj({"n_hours": I, "mean_resid_mw": N, "mean_abs_resid_mw": N, "p99_abs_resid_mw": N, "definition": S})),
        "weather": arr(obj({"ba": S, "station_id": S, "name": S, "weight": N, "hours_expected": I, "hours_observed": I, "hours_interpolated": I, "hours_missing": I}), lo=8)}),
    "quality": top("quality", {
        "gaps": per_ba(obj({"series": arr(obj({"series": S, "n_gaps": I, "missing_hours": I, "longest_gap_h": I, "top_runs": arr(obj({"start_utc": S, "hours": I}))}), lo=1)})),
        "dst": per_ba(obj({"tz": S, "local_days": I, "days_23h": I, "days_25h": I, "transitions": arr(obj({"date": S, "type": S, "hours": I}))})),
        "timing": per_ba(obj({"derived": S, "boundaries": arr(S), "collision_rows_dropped": I, "excluded_rows": I, "daily_solar_offset_days": I, "rows_by_group": {"type": "object"},
                              "segments": arr(obj({"from": S, "to": S, "c_gen_h": I, "c_D_h": I, "c_TI_h": I, "c_DF_h": I, "solar_offset_median_h": N, "solar_offset_median_h_after": NN, "days": I,
                                                   "identity_resid_mw_before": N, "identity_resid_mw_after": N, "df_mape_pct_before": N, "df_mape_pct_after": N}), lo=1)})),
        "outlier_rules": arr(obj({"id": S, "applies_to": S, "rule": S, "flagged": obj({b: I for b in BAS})}), lo=3),
        "spike_examples": per_ba(arr(obj({"series": S, "ts_utc": S, "value": N, "reference": N, "ratio": N, "rule": S})))}),
    "demand_profile": top("demand_profile", {"bas": per_ba(obj({
        "daily": obj({"date": arr(S, lo=1000), "mean_mw": arr(NN), "peak_mw": arr(NN), "min_mw": arr(NN), "temp_mean_c": arr(NN), "valid_hours": arr(I)}),
        "month_hour_mean_mw": arr(NN, 288), "how_mean_mw": arr(NN, 168), "annual": arr(obj({"year": I, "mean_mw": N, "peak_mw": N, "valid_hours": I}), lo=4),
        "tz": S, "index_note": S}))}),
    "fuel_mix": top("fuel_mix", {"bas": per_ba(obj({
        "fuels": arr(S, lo=7), "annual_share_pct": {"type": "object"}, "annual_share_by_year": arr(obj({"year": I, "share_pct": {"type": "object"}}), lo=4),
        "month_hour_mean_mw": {"type": "object"},
        "month_hour_mean_mw_by_year": {"type": "object", "minProperties": 4, "additionalProperties": obj({"demand": arr(NN, 288), "SUN": arr(NN, 288), "WND": arr(NN, 288), "months_present": I})},
        "capacity_proxy_mw": {"type": "object"}, "capacity_proxy_rule": S,
        "evening_ramp": obj({"definition": S, "mean_mw_per_h": N, "p95_mw_per_h": N})}))}),
    "weather_relation": top("weather_relation", {"bas": per_ba(obj({
        "model": S, "cool_base_c": N, "heat_base_c": N, "r2": N, "n": I,
        "b_cool_mw_per_c_by_hour": arr(N, 24), "b_heat_mw_per_c_by_hour": arr(N, 24), "intercept_mw_by_hour": arr(N, 24),
        "binned": obj({"temp_c": arr(N, lo=10), "mean_mw": arr(N), "p10_mw": arr(N), "p90_mw": arr(N), "n": arr(I)}),
        "pct_demand_per_c_above_base": N, "pct_ci": arr(N, 2), "note": S}))}),
    "forecast_eval": top("forecast_eval", {"bas": per_ba(obj({
        "split": obj({k: arr(S, 2) for k in ("train", "val", "test")}), "n_train": I, "n_val": I, "n_test": I, "common_test_hours": I,
        "origin_rule": S, "features": obj({k: arr(S) for k in ("gbm", "gbm_stacked", "gbm_perfect_weather")}),
        "hyperparameters": {"type": "object"},
        "models": obj({m: obj({"label": S, "tag": S, "available_at_forecast_time": B, "mae_mw": N, "mape_pct": N, "rmse_mw": N, "bias_mw": N, "mape_peak5_pct": N,
                               "mape_by_hour": arr(N, 24), "mape_by_month": arr(N, 12)}) for m in MODEL_IDS}),
        "intervals": obj({m: obj({"nominal_pct": N, "raw_coverage_pct": N, "cqr_coverage_pct": N, "mean_width_mw": N, "cqr_mean_width_mw": N, "cqr_offset_mw": N})
                          for m in ("gbm", "gbm_stacked", "gbm_perfect_weather")}),
        "comparison_vs_eia": obj({"best_model": S, "beats_eia": B, "mape_diff_pp": N, "mape_diff_ci95": arr(N, 2), "ci_method": S, "statement": S}),
        "comparisons": arr(obj({"model": S, "baseline": S, "mape_diff_pp": N, "ci95": arr(N, 2), "significant": B, "statement": S}), lo=4),
        "importance": arr(obj({"feature": S, "mape_increase_pp": N}), lo=1)}))}),
    "forecast_samples": top("forecast_samples", {"bas": per_ba(obj({
        "best_model": S, "cqr_offset_mw": N,
        "weeks": arr(obj({"label": S, "reason": S, "start_utc": S, "hours": I, "ts_local": arr(S), "actual_mw": arr(NN), "eia_mw": arr(NN), "naive_mw": arr(NN),
                          "gbm_mw": arr(NN), "gbm_p10_mw": arr(NN), "gbm_p90_mw": arr(NN), "gbm_p10_cqr_mw": arr(NN), "gbm_p90_cqr_mw": arr(NN), "best_mw": arr(NN)}), lo=3),
        "daily_test": obj({"date": arr(S), "mape_gbm": arr(NN), "mape_eia": arr(NN), "mape_naive": arr(NN), "actual_peak_mw": arr(NN)})}))}),
    "dispatch_model": top("dispatch_model", {
        "formulation": obj({"summary": S, "variables": arr(S, lo=5), "constraints": arr(S, lo=5), "objective": S, "variable_order": arr(S, lo=5), "row_order": arr(S, lo=4), "solver": S,
                            "price_definition": S, "controls_note": S, "heat_shock": S}),
        "solver_versions": obj({"python_highspy": S, "python_highs": S, "browser": S}),
        "scenarios": arr(obj({"id": S, "label": S, "description": S}), 6),
        "assumptions": arr(obj({"id": S, "value": {}, "unit": S, "basis": S}), lo=5),
        "bas": per_ba(obj({
            "classes": arr(obj({"id": S, "label": S, "kind": {"enum": ["dispatchable", "renewable"]}, "group": {"enum": GROUPS}, "capacity_mw": N, "marginal_cost_usd_mwh": N, "ramp_frac_per_h": N,
                                "pmin_frac": N, "heat_rate_mmbtu_mwh": N, "co2_kg_mmbtu": N, "capacity_basis": S}), lo=5),
            "display_order": arr(S, lo=8), "fixed_series": arr(obj({"id": S, "label": S, "group": S, "source": S}), 2),
            "sinks": arr(obj({"id": S, "label": S, "array": S}), 3), "sign_convention": S,
            "battery": obj({"power_mw": N, "energy_mwh": N, "hours": N, "round_trip_eff": N, "soc0_frac": N, "soc_min_frac": N, "wear_cost_usd_mwh": N}),
            "voll_usd_mwh": N,
            "controls": arr(obj({"id": S, "label": S, "unit": S, "kind": {"enum": ["range", "enum"]}, "default": {}, "param_path": S}, req=["id", "label", "unit", "kind", "default", "param_path"]), 7),
            "scenarios": arr(obj({"id": S, "label": S, "description": S, "params": PARAMS}), 6),
            "days": arr(obj({"id": S, "label": S, "date": S, "season": S, "intro": B, "dst_transition": B, "local_hours": S, "demand_mw": VEC(24), "net_imports_mw": VEC(24), "fixed_other_mw": VEC(24),
                             "avail_mw": obj({"solar": VEC(24), "wind": VEC(24)}), "hydro_energy_mwh": N, "temp_c": VEC(24),
                             "observed_gen_mw": {"type": "object", "minProperties": 7, "additionalProperties": VEC(24)}, "observed_interchange_mw": VEC(24)},
                            req=["id", "label", "date", "season", "intro", "dst_transition", "local_hours", "demand_mw", "net_imports_mw", "fixed_other_mw", "avail_mw", "hydro_energy_mwh", "temp_c", "observed_gen_mw", "observed_interchange_mw"]), lo=4),
            "heat_wave": obj({"cool_base_c": N, "b_cool_mw_per_c_by_hour": arr(N, 24)})})),
        "reference_lp": obj({"ba": S, "day": S, "scenario": S, "objective_usd": N, "cplex_lp": S})}),
    "dispatch_results": top("dispatch_results", {"bas": per_ba(obj({"days": {"type": "object", "minProperties": 4, "additionalProperties": obj({s: obj({
        "objective_usd": N, "cost_breakdown_usd": COST, "dispatch_mw": DISP, "renewable_used_mw": obj({"solar": VEC(24), "wind": VEC(24)}),
        "curtailment_mw": VEC(24), "unserved_mw": VEC(24), "battery": obj({"charge_mw": VEC(24), "discharge_mw": VEC(24), "soc_mwh": VEC(25)}),
        "price_usd_mwh": VEC(24), "marginal_class": arr(S, 24), "co2_t": N, "renewable_share_pct": N, "unserved_mwh": N, "curtailed_mwh": N}) for s in SCEN})}}))}),
    "dispatch_test_vectors": top("dispatch_test_vectors", {"tolerance_rel": {"type": "number", "exclusiveMinimum": 0}, "tolerance_abs": N, "tolerance_price_usd_mwh": N, "note": S, "lp_text": S, "parity_keys": arr(S, lo=3), "vectors": arr(obj({
        "ba": S, "day": S, "scenario": S, "kind": {"enum": ["preset", "random", "stress_unserved", "stress_curtailment"]}, "params": PARAMS, "lp_text_sha256": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
        "expected": obj({"objective_usd": N, "cost_breakdown_usd": COST, "class_energy_mwh": DISP_E, "unserved_mwh": N, "curtailed_mwh": N, "soc_mwh": VEC(25), "price_usd_mwh": VEC(24),
                         "price_comparable": B, "max_price_usd_mwh": N, "co2_t": N, "marginal_class": arr(S, 24)})}), lo=24)}),
    "grid_topology": top("grid_topology", {
        "label": S, "tag": {"const": "SYNTHETIC"}, "illustrative": {"const": True}, "source": S, "license": S, "notes": S, "base_mva": N,
        "buses": arr(obj({"id": I, "type": I, "pd_mw": N, "qd_mvar": N, "gs_mw": N, "bs_mvar": N, "base_kv": N}), 14),
        "branches": arr(obj({"from": I, "to": I, "r_pu": N, "x_pu": N, "b_pu": N, "rate_a_mva": N}), 20),
        "generators": arr(obj({"bus": I, "pmax_mw": N, "pmin_mw": N, "cost_usd_mwh": N, "pglib_note": S}), 5)}),
}


def build() -> None:
    CONTRACTS.mkdir(parents=True, exist_ok=True)
    for n, sc in SCHEMAS.items():
        (CONTRACTS / f"{n}.schema.json").write_text(json.dumps(sc, indent=1, sort_keys=True) + "\n")


if __name__ == "__main__":
    build()
