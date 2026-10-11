"""Time-coupled economic dispatch LP (24 h, single node) with ramp limits, an energy-limited hydro class and a battery with state of charge.

Everything here is SIMULATED: capacities are DERIVED from observed generation, costs/ramps/battery are documented assumptions (ASSUMPTIONS below).
The LP is built from plain arrays so the browser can rebuild it identically (variable and row order are fixed and published in dispatch_model.json).
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import highspy
import numpy as np
import polars as pl
from scipy.sparse import coo_matrix

from pipelines.common import BAS, FUELS

T = 24
_h = highspy.Highs()
HIGHS_VERSION = _h.version()
HIGHSPY_VERSION = getattr(highspy, '__version__', None) or __import__('importlib.metadata', fromlist=['version']).version('highspy')
del _h
INF = highspy.kHighsInf
VOLL = 1000.0
WEAR = 2.0
ETA_RT, SOC0, SOC_MIN = 0.90, 0.5, 0.10
GAS_PRICE = {"CISO": 4.5, "ERCO": 3.0}  # USD/MMBtu, ASSUMPTION (regional spread: California gas is dearer than Texas)
COAL_PRICE = 2.5
SCENARIO_META = [
    {"id": "baseline", "label": "Baseline", "description": "Observed demand, imports and renewable output of the reference day; default fleet and battery."},
    {"id": "renewables_up", "label": "Renewables +50%", "description": "Solar and wind availability scaled by 1.5 on the same weather shape."},
    {"id": "demand_growth", "label": "Demand +15%", "description": "Every hour of demand scaled by 1.15 (structural growth, e.g. electrification or data centres)."},
    {"id": "battery_big", "label": "Battery x4", "description": "Battery power quadrupled at the same duration (energy capacity also x4)."},
    {"id": "heat_wave", "label": "Heat wave +5 C", "description": "Temperature +5 C all day; demand shock from the fitted per-hour cooling coefficients (weather_relation.json)."},
    {"id": "outage", "label": "Outage: 35% of gas CCGT", "description": "35% of the combined-cycle gas class capacity is unavailable all day (forced outage)."},
]


def scenarios_for(cfg: dict) -> list[dict]:
    """Preset scenarios as plain control values (ids = controls[].id), per BA because battery power is absolute."""
    bp = cfg["battery"]["power_mw"]
    params = {"baseline": {}, "renewables_up": {"renewables_scale": 1.5}, "demand_growth": {"demand_growth_pct": 15.0}, "battery_big": {"battery_power_mw": bp * 4},
              "heat_wave": {"heat_wave_c": 5.0}, "outage": {"outage_class": "ccgt", "outage_pct": 35.0}}
    return [{**m, "params": full_params(cfg, params[m["id"]])} for m in SCENARIO_META]


def full_params(cfg: dict, params: dict | None = None) -> dict:
    p = {"renewables_scale": 1.0, "demand_growth_pct": 0.0, "heat_wave_c": 0.0, "battery_power_mw": cfg["battery"]["power_mw"], "battery_hours": cfg["battery"]["hours"], "outage_class": "none", "outage_pct": 100.0}
    p.update(params or {})
    return {k: (float(v) if isinstance(v, (int, float)) else v) for k, v in p.items()}


def controls_for(cfg: dict) -> list[dict]:
    bp = cfg["battery"]["power_mw"]
    ids = [c["id"] for c in cfg["classes"] if c["kind"] == "dispatchable"]
    return [
        {"id": "renewables_scale", "label": "Renewables multiplier", "unit": "x", "kind": "range", "min": 0.0, "max": 3.0, "step": 0.05, "default": 1.0, "param_path": "params.renewables_scale"},
        {"id": "demand_growth_pct", "label": "Demand growth", "unit": "%", "kind": "range", "min": -20.0, "max": 50.0, "step": 1.0, "default": 0.0, "param_path": "params.demand_growth_pct"},
        {"id": "heat_wave_c", "label": "Heat wave", "unit": "C", "kind": "range", "min": 0.0, "max": 10.0, "step": 0.5, "default": 0.0, "param_path": "params.heat_wave_c"},
        {"id": "battery_power_mw", "label": "Battery power", "unit": "MW", "kind": "range", "min": 0.0, "max": bp * 8, "step": 100.0, "default": bp, "param_path": "params.battery_power_mw"},
        {"id": "battery_hours", "label": "Battery duration", "unit": "h", "kind": "range", "min": 1.0, "max": 8.0, "step": 1.0, "default": cfg["battery"]["hours"], "param_path": "params.battery_hours"},
        {"id": "outage_class", "label": "Outage class", "unit": "", "kind": "enum", "options": ["none"] + ids, "default": "none", "param_path": "params.outage_class"},
        {"id": "outage_pct", "label": "Outage size", "unit": "% of class capacity", "kind": "range", "min": 0.0, "max": 100.0, "step": 5.0, "default": 100.0, "param_path": "params.outage_pct"},
    ]


SEASON_Q = [("winter", (12, 1, 2), 0.5), ("spring", (3, 4, 5), 0.5), ("summer", (6, 7, 8), 0.9), ("fall", (9, 10, 11), 0.5)]


def assumptions(ba: str) -> list[dict]:
    g = GAS_PRICE[ba]
    return [
        {"id": "gas_price", "value": g, "unit": "USD/MMBtu", "basis": "ASSUMPTION (SIMULATED): round number for a regional gas hub level, not a market quote; California set above Texas"},
        {"id": "coal_price", "value": COAL_PRICE, "unit": "USD/MMBtu", "basis": "ASSUMPTION (SIMULATED): round number"},
        {"id": "heat_rate_ccgt", "value": 7.0, "unit": "MMBtu/MWh", "basis": "ASSUMPTION: typical combined-cycle range 6.5 to 7.5"},
        {"id": "heat_rate_peaker", "value": 10.5, "unit": "MMBtu/MWh", "basis": "ASSUMPTION: typical simple-cycle range 9.5 to 12"},
        {"id": "heat_rate_coal", "value": 10.0, "unit": "MMBtu/MWh", "basis": "ASSUMPTION: typical steam-coal range 9.5 to 11"},
        {"id": "vom", "value": {"ccgt": 3.0, "peaker": 5.0, "coal": 4.0}, "unit": "USD/MWh", "basis": "ASSUMPTION: variable O&M round numbers"},
        {"id": "marginal_cost_formula", "value": "heat_rate * fuel_price + vom", "unit": "USD/MWh", "basis": "Computed per class; nuclear 9.0 and hydro 0.0 are flat assumptions"},
        {"id": "co2_factor", "value": {"gas": 53.06, "coal": 95.0}, "unit": "kg CO2/MMBtu", "basis": "Standard combustion factors, rounded (gas ~53, coal ~95); ASSUMPTION for display, not a measured emission"},
        {"id": "ramp_frac_per_h", "value": {"nuclear": 0.02, "coal": 0.15, "ccgt": 0.30, "peaker": 1.0, "hydro": 0.5}, "unit": "fraction of capacity per hour", "basis": "ASSUMPTION; no ramp constraint is applied between the day-before and hour 0"},
        {"id": "pmin_frac", "value": {"nuclear": 0.85, "coal": 0.25, "ccgt": 0.20, "peaker": 0.0, "hydro": 0.0}, "unit": "fraction of capacity", "basis": "ASSUMPTION: fleet-level minimum stable output standing in for committed units; no unit commitment (no start-up costs or minimum-up times). Drives midday curtailment and battery value"},
        {"id": "gas_split", "value": {"ccgt": 0.75, "peaker": 0.25}, "unit": "share of observed gas capacity proxy", "basis": "ASSUMPTION; EIA-930 reports gas as one fuel"},
        {"id": "voll", "value": VOLL, "unit": "USD/MWh", "basis": "ASSUMPTION: value of lost load as a penalty price (far below real market caps, keeps the LP well scaled)"},
        {"id": "battery_sizing", "value": {"power_frac_of_peak_demand": 0.03, "duration_h": 4}, "unit": "MW / h", "basis": "ASSUMPTION: 3% of the window's peak demand, 4 hours; not the real fleet size"},
        {"id": "battery_efficiency", "value": ETA_RT, "unit": "round trip", "basis": "ASSUMPTION; each direction sqrt(0.90)"},
        {"id": "battery_soc", "value": {"initial_frac": SOC0, "min_frac": SOC_MIN, "end_constraint": "final SoC >= initial SoC"}, "unit": "fraction of energy capacity", "basis": "ASSUMPTION"},
        {"id": "battery_wear", "value": WEAR, "unit": "USD/MWh discharged", "basis": "ASSUMPTION: a small throughput cost that also removes simultaneous charge/discharge"},
        {"id": "capacity_proxy", "value": "max hourly observed net generation of the fuel in 2021-01-01..2025-08-26", "unit": "MW", "basis": "DERIVED from OBSERVED; not nameplate"},
        {"id": "must_run_other", "value": "max(0, median over the day of observed OTH generation), flat", "unit": "MW", "basis": "DERIVED; in CISO OTH includes storage with negative charging hours so only a flat geothermal/biomass-like floor is kept"},
        {"id": "imports", "value": "-(observed total interchange) per hour", "unit": "MW", "basis": "OBSERVED, fixed in every scenario"},
        {"id": "omitted_classes", "value": "fuels whose capacity proxy is under 0.5% of peak demand (CISO coal, oil)", "unit": "", "basis": "Omitted from the dispatch fleet; their small output is not re-added"},
        {"id": "network", "value": "single node (copper plate)", "unit": "", "basis": "No transmission constraints; the IEEE 14-bus case is illustrative only"},
    ]


GROUP = {"nuclear": "nuclear", "coal": "coal", "ccgt": "gas_cc", "peaker": "gas_ct", "hydro": "hydro", "solar": "solar", "wind": "wind"}


def build_config(ba: str, df: pl.DataFrame, caps: dict, weather: dict, peak_mw: float) -> dict:
    """Generator classes, battery and reference days for one BA."""
    g = GAS_PRICE[ba]
    ng = caps["NG"]
    classes = [
        {"id": "nuclear", "label": "Nuclear", "kind": "dispatchable", "capacity_mw": caps["NUC"], "marginal_cost_usd_mwh": 9.0, "ramp_frac_per_h": 0.02, "pmin_frac": 0.85, "heat_rate_mmbtu_mwh": 0.0, "co2_kg_mmbtu": 0.0, "capacity_basis": "max hourly observed NUC"},
        {"id": "ccgt", "label": "Gas combined cycle", "kind": "dispatchable", "capacity_mw": round(0.75 * ng, 0), "marginal_cost_usd_mwh": round(7.0 * g + 3.0, 2), "ramp_frac_per_h": 0.30, "pmin_frac": 0.20, "heat_rate_mmbtu_mwh": 7.0, "co2_kg_mmbtu": 53.06, "capacity_basis": "75% of max hourly observed NG"},
        {"id": "peaker", "label": "Gas peaker", "kind": "dispatchable", "capacity_mw": round(0.25 * ng, 0), "marginal_cost_usd_mwh": round(10.5 * g + 5.0, 2), "ramp_frac_per_h": 1.0, "pmin_frac": 0.0, "heat_rate_mmbtu_mwh": 10.5, "co2_kg_mmbtu": 53.06, "capacity_basis": "25% of max hourly observed NG"},
        {"id": "hydro", "label": "Hydro (energy-limited)", "kind": "dispatchable", "capacity_mw": caps["WAT"], "marginal_cost_usd_mwh": 0.0, "ramp_frac_per_h": 0.5, "pmin_frac": 0.0, "heat_rate_mmbtu_mwh": 0.0, "co2_kg_mmbtu": 0.0, "capacity_basis": "max hourly observed WAT; daily energy = observed that day"},
    ]
    if caps.get("COL", 0) >= 0.005 * peak_mw:
        classes.insert(1, {"id": "coal", "label": "Coal", "kind": "dispatchable", "capacity_mw": caps["COL"], "marginal_cost_usd_mwh": round(10.0 * COAL_PRICE + 4.0, 2), "ramp_frac_per_h": 0.15, "pmin_frac": 0.25,
                           "heat_rate_mmbtu_mwh": 10.0, "co2_kg_mmbtu": 95.0, "capacity_basis": "max hourly observed COL"})
    classes += [{"id": "solar", "label": "Solar", "kind": "renewable", "capacity_mw": caps["SUN"], "marginal_cost_usd_mwh": 0.0, "ramp_frac_per_h": 1.0, "pmin_frac": 0.0, "heat_rate_mmbtu_mwh": 0.0, "co2_kg_mmbtu": 0.0, "capacity_basis": "max hourly observed SUN; availability = observed output of the reference day"},
                {"id": "wind", "label": "Wind", "kind": "renewable", "capacity_mw": caps["WND"], "marginal_cost_usd_mwh": 0.0, "ramp_frac_per_h": 1.0, "pmin_frac": 0.0, "heat_rate_mmbtu_mwh": 0.0, "co2_kg_mmbtu": 0.0, "capacity_basis": "max hourly observed WND; availability = observed output of the reference day"}]
    pw = round(0.03 * peak_mw / 100) * 100
    battery = {"power_mw": float(pw), "energy_mwh": float(pw * 4), "hours": 4.0, "round_trip_eff": ETA_RT, "soc0_frac": SOC0, "soc_min_frac": SOC_MIN, "wear_cost_usd_mwh": WEAR}
    for c in classes:
        c["group"] = GROUP[c["id"]]
    disp = [c for c in classes if c["kind"] == "dispatchable" and c["id"] not in ("hydro", "nuclear")]
    order = ["solar", "wind", "imports", "other", "hydro", "nuclear", "battery_discharge"] + [c["id"] for c in sorted(disp, key=lambda c: c["marginal_cost_usd_mwh"])]
    cfg = {"classes": classes, "battery": battery, "voll_usd_mwh": VOLL, "days": reference_days(ba, df), "heat_wave": {"cool_base_c": weather["cool_base_c"], "b_cool_mw_per_c_by_hour": weather["b_cool_mw_per_c_by_hour"]},
           "display_order": order,
           "fixed_series": [{"id": "imports", "label": "Imports (observed net)", "group": "imports", "source": "net_imports_mw where positive"}, {"id": "other", "label": "Other must-run (flat)", "group": "other", "source": "fixed_other_mw"}],
           "sinks": [{"id": "battery_charge", "label": "Battery charging", "array": "battery.charge_mw"}, {"id": "curtailment", "label": "Curtailment", "array": "curtailment_mw"},
                     {"id": "exports", "label": "Exports (observed net)", "array": "max(0, -net_imports_mw)"}],
           "sign_convention": "Sources are drawn positive and sinks negative. All arrays in dispatch_results and dispatch_model are non-negative magnitudes except net_imports_mw, which is signed: positive = import (a source, series `imports`), "
                              "negative = export (a sink, series `exports`, drawn below zero as its magnitude). fixed_other_mw is clamped at zero (never a sink). Battery charging and curtailment are sinks. The LP balance uses net_imports_mw with its sign."}
    cfg["controls"] = controls_for(cfg)
    cfg["scenarios"] = scenarios_for(cfg)
    return cfg




def _day_record(x: pl.DataFrame, ba: str, did: str, label: str, season: str, intro: bool) -> dict:
    x = x.sort("local_hour")
    assert x.height == 24 and x["local_hour"].to_list() == list(range(24))
    oth = x["gen_oth"].to_numpy()
    return {"id": did, "label": label, "date": str(x["local_date"][0]), "season": season, "intro": intro, "dst_transition": False,
            "local_hours": "0..23 in the BA's IANA zone; days with 23 or 25 local hours are never selected",
            "demand_mw": [float(v) for v in x["demand"]], "net_imports_mw": [float(-v) for v in x["interchange"]], "fixed_other_mw": [float(max(0.0, np.median(oth)))] * T,
            "avail_mw": {"solar": [float(max(v, 0)) for v in x["gen_sun"]], "wind": [float(max(v, 0)) for v in x["gen_wnd"]]}, "hydro_energy_mwh": float(np.clip(x["gen_wat"].to_numpy(), 0, None).sum()),
            "temp_c": [float(round(v, 2)) for v in x["temp_c"]],
            "observed_gen_mw": {f: [float(v) for v in x[f"gen_{f.lower()}"]] for f in FUELS[ba]}, "observed_interchange_mw": [float(v) for v in x["interchange"]]}


def _complete_days(d: pl.DataFrame, ba: str) -> pl.DataFrame:
    fcols = [f"gen_{f.lower()}" for f in FUELS[ba]]
    return (d.group_by("local_date").agg(pl.len().alias("n"), (pl.col("demand_status") == "ok").all().alias("dok"), pl.col("interchange").is_not_null().all().alias("ti"), pl.col("temp_c").is_not_null().all().alias("tp"),
                                        pl.all_horizontal(*[pl.col(c).is_not_null().all() for c in fcols]).alias("fo"), pl.col("demand").max().alias("peak"), pl.col("local_dow").first().alias("dow"),
                                        pl.col("local_month").first().alias("mo"), pl.col("demand").sum().alias("dsum"), pl.col("gen_sun").clip(lower_bound=0).sum().alias("ssum"))
            .filter((pl.col("n") == 24) & pl.col("dok") & pl.col("ti") & pl.col("tp") & pl.col("fo")))


def reference_days(ba: str, df: pl.DataFrame) -> list[dict]:
    """Four seasonal weekday references from the test year plus, for CISO, one intro day (DR-2).
    Seasonal rule: the complete weekday whose daily peak is closest to the q-quantile of that season's complete-weekday peaks (q = .5, .5, .9 summer, .5).
    Intro rule (CISO only): among complete days of the latest complete local year (>= 8000 clean hours), the day with the highest share of demand met by solar."""
    from pipelines.common import VAL_END
    d = df.filter(pl.col("ts_utc") > np.datetime64(VAL_END))
    full = _complete_days(d, ba).filter(pl.col("dow") < 5)
    days = []
    for season, months, q in SEASON_Q:
        s = full.filter(pl.col("mo").is_in(months)).sort("peak")
        target = float(np.quantile(s["peak"].to_numpy(), q))
        pick = s.with_columns((pl.col("peak") - target).abs().alias("dist")).sort("dist", "local_date").row(0, named=True)
        x = d.filter(pl.col("local_date") == pick["local_date"])
        days.append(_day_record(x, ba, season, f"{season.capitalize()} weekday ({pick['local_date']})", season, False))
    if ba == "CISO":
        yrs = df.filter(pl.col("demand_status") == "ok").group_by("local_year").len().filter(pl.col("len") >= 8000)["local_year"].max()
        pool = _complete_days(df.filter(pl.col("local_year") == yrs), ba)
        pick = pool.with_columns((pl.col("ssum") / pl.col("dsum")).alias("share")).sort("share", "local_date", descending=[True, False]).row(0, named=True)
        x = df.filter(pl.col("local_date") == pick["local_date"])
        rec = _day_record(x, ba, "intro", f"Highest solar share, {yrs} ({pick['local_date']})", "intro", True)
        rec["intro_rule"] = f"day with the highest share of demand met by solar among complete local days of {yrs}, the latest year with at least 8000 clean demand hours; solar share = {pick['share']:.4f}"
        days.append(rec)
    return days


# ---------------------------------------------------------------- LP construction
def make_lp(cfg: dict, day: dict, params: dict | None = None) -> dict:
    """Return the LP as arrays: cost, lb, ub, A (csr data), row_lb, row_ub, plus index maps. Variable/row order is documented in formulation()."""
    p = full_params(cfg, params)
    disp = [c for c in cfg["classes"] if c["kind"] == "dispatchable"]
    nC = len(disp)
    nv = (nC + 6) * T
    G = lambda c, t: c * T + t  # noqa: E731
    CS, CW, CH, DI, SO, UN = ((nC + k) * T for k in range(6))
    b = cfg["battery"]
    P = p["battery_power_mw"]
    E = P * p["battery_hours"]
    eta = b["round_trip_eff"] ** 0.5
    rs = p["renewables_scale"]
    S = np.array(day["avail_mw"]["solar"]) * rs
    W = np.array(day["avail_mw"]["wind"]) * rs
    Tc, bc = cfg["heat_wave"]["cool_base_c"], np.array(cfg["heat_wave"]["b_cool_mw_per_c_by_hour"])
    temp = np.array(day["temp_c"])
    shock = bc * (np.maximum(temp + p["heat_wave_c"] - Tc, 0) - np.maximum(temp - Tc, 0))
    D = np.array(day["demand_mw"]) * (1.0 + p["demand_growth_pct"] / 100.0) + shock
    dnet = D - np.array(day["net_imports_mw"]) - np.array(day["fixed_other_mw"])
    cost, lb, ub = np.zeros(nv), np.zeros(nv), np.full(nv, INF)
    for ci, c in enumerate(disp):
        a = 1.0 - p["outage_pct"] / 100.0 if p["outage_class"] == c["id"] else 1.0
        for t in range(T):
            cost[G(ci, t)] = c["marginal_cost_usd_mwh"]
            ub[G(ci, t)] = c["capacity_mw"] * a
            lb[G(ci, t)] = min(c["pmin_frac"] * c["capacity_mw"], ub[G(ci, t)])  # an outage removes capacity, not the fleet minimum (capped at what is left)
    for t in range(T):
        ub[CS + t], ub[CW + t] = S[t], W[t]
        ub[CH + t] = ub[DI + t] = P
        cost[DI + t] = b["wear_cost_usd_mwh"]
        lb[SO + t], ub[SO + t] = b["soc_min_frac"] * E, E
        cost[UN + t] = cfg["voll_usd_mwh"]
    lb[SO + T - 1] = b["soc0_frac"] * E  # end-of-day SoC >= start-of-day SoC
    soc0 = b["soc0_frac"] * E
    rows, cols, vals, rlb, rub = [], [], [], [], []
    r = 0

    def add(entries, lo, hi):
        nonlocal r
        for j, v in entries:
            rows.append(r); cols.append(j); vals.append(v)
        rlb.append(lo); rub.append(hi)
        r += 1

    for t in range(T):  # balance: sum g - curtS - curtW + dis - ch + uns = dnet - S - W
        add([(G(ci, t), 1.0) for ci in range(nC)] + [(CS + t, -1.0), (CW + t, -1.0), (DI + t, 1.0), (CH + t, -1.0), (UN + t, 1.0)], dnet[t] - S[t] - W[t], dnet[t] - S[t] - W[t])
    for t in range(T):  # soc_t - soc_{t-1} - eta*ch_t + dis_t/eta = 0   (soc_{-1} = soc0 constant)
        e = [(SO + t, 1.0), (CH + t, -eta), (DI + t, 1.0 / eta)]
        if t > 0:
            e.append((SO + t - 1, -1.0))
        add(e, soc0 if t == 0 else 0.0, soc0 if t == 0 else 0.0)
    hy = [ci for ci, c in enumerate(disp) if c["id"] == "hydro"]
    for ci in hy:
        add([(G(ci, t), 1.0) for t in range(T)], -INF, day["hydro_energy_mwh"])
    for ci, c in enumerate(disp):
        R = c["ramp_frac_per_h"] * c["capacity_mw"]
        for t in range(1, T):
            add([(G(ci, t), 1.0), (G(ci, t - 1), -1.0)], -INF, R)
            add([(G(ci, t - 1), 1.0), (G(ci, t), -1.0)], -INF, R)
    A = coo_matrix((vals, (rows, cols)), shape=(r, nv)).tocsr()
    return {"cost": cost, "lb": lb, "ub": ub, "A": A, "row_lb": np.array(rlb), "row_ub": np.array(rub), "disp_ids": [c["id"] for c in disp], "nC": nC, "offsets": {"CS": CS, "CW": CW, "CH": CH, "DI": DI, "SO": SO, "UN": UN},
            "S": S, "W": W, "demand": D, "dnet": dnet, "eta": eta, "params": p, "E": E, "P": P}


def solve(lp: dict) -> dict:
    h = highspy.Highs()
    h.setOptionValue("output_flag", False)
    h.setOptionValue("threads", 1)
    h.setOptionValue("random_seed", 0)
    nv, nr = len(lp["cost"]), lp["A"].shape[0]
    m = highspy.HighsLp()
    m.num_col_, m.num_row_ = nv, nr
    m.col_cost_, m.col_lower_, m.col_upper_ = lp["cost"], lp["lb"], lp["ub"]
    m.row_lower_, m.row_upper_ = lp["row_lb"], lp["row_ub"]
    csc = lp["A"].tocsc()
    m.a_matrix_.format_ = highspy.MatrixFormat.kColwise
    m.a_matrix_.start_, m.a_matrix_.index_, m.a_matrix_.value_ = csc.indptr.astype(np.int32), csc.indices.astype(np.int32), csc.data
    h.passModel(m)
    h.run()
    assert h.getModelStatus() == highspy.HighsModelStatus.kOptimal, h.modelStatusToString(h.getModelStatus())
    sol = h.getSolution()
    return {"x": np.array(sol.col_value), "dual": np.array(sol.row_dual), "objective": float(h.getInfo().objective_function_value)}


def marginal_class(cfg: dict, lp: dict, x: np.ndarray) -> list[str]:
    """Per hour: 'unserved' if load is shed; else the most expensive dispatchable class strictly inside its bounds (0.5 MW tolerance);
    else 'surplus' if anything is curtailed; else the most expensive class producing more than its minimum; else 'surplus'. Descriptive (DERIVED from the solution), not a dual."""
    o, nC = lp["offsets"], lp["nC"]
    disp = [c for c in cfg["classes"] if c["kind"] == "dispatchable"]
    out = []
    for t in range(T):
        if x[o["UN"] + t] > 0.5:
            out.append("unserved"); continue
        inner = [(c["marginal_cost_usd_mwh"], i) for i, c in enumerate(disp) if lp["lb"][i * T + t] + 0.5 < x[i * T + t] < lp["ub"][i * T + t] - 0.5]
        if inner:
            out.append(disp[max(inner)[1]]["id"]); continue
        if x[o["CS"] + t] + x[o["CW"] + t] > 0.5:
            out.append("surplus"); continue
        run = [(c["marginal_cost_usd_mwh"], i) for i, c in enumerate(disp) if x[i * T + t] > lp["lb"][i * T + t] + 0.5]
        out.append(disp[max(run)[1]]["id"] if run else "surplus")
    return out


def package(cfg: dict, lp: dict, sol: dict) -> dict:
    """Round-trip friendly result dict. Costs are computed from the primal solution and sum to the solver objective."""
    x, o = sol["x"], lp["offsets"]
    rr = lambda a: [float(round(v, 3)) for v in a]  # noqa: E731
    disp = {cid: x[ci * T:(ci + 1) * T] for ci, cid in enumerate(lp["disp_ids"])}
    breakdown = {cid: float(lp["cost"][ci * T:(ci + 1) * T] @ disp[cid]) for ci, cid in enumerate(lp["disp_ids"])}
    breakdown["battery_wear"] = float(lp["cost"][o["DI"]:o["DI"] + T] @ x[o["DI"]:o["DI"] + T])
    breakdown["unserved_voll"] = float(lp["cost"][o["UN"]:o["UN"] + T] @ x[o["UN"]:o["UN"] + T])
    sol_used = lp["S"] - x[o["CS"]:o["CS"] + T]
    wind_used = lp["W"] - x[o["CW"]:o["CW"] + T]
    soc = np.concatenate([[cfg["battery"]["soc0_frac"] * lp["E"]], x[o["SO"]:o["SO"] + T]])
    co2 = sum(float(disp[c["id"]].sum()) * c["heat_rate_mmbtu_mwh"] * c["co2_kg_mmbtu"] / 1000.0 for c in cfg["classes"] if c["kind"] == "dispatchable")
    ren_share = float((sol_used.sum() + wind_used.sum()) / max(lp["demand"].sum(), 1e-9) * 100)
    dmw = {k: rr(v) for k, v in disp.items()}
    dmw["battery_discharge"] = rr(x[o["DI"]:o["DI"] + T])
    return {"objective_usd": sol["objective"], "cost_breakdown_usd": breakdown, "dispatch_mw": dmw, "renewable_used_mw": {"solar": rr(sol_used), "wind": rr(wind_used)},
            "curtailment_mw": rr(x[o["CS"]:o["CS"] + T] + x[o["CW"]:o["CW"] + T]), "unserved_mw": rr(x[o["UN"]:o["UN"] + T]),
            "battery": {"charge_mw": rr(x[o["CH"]:o["CH"] + T]), "discharge_mw": rr(x[o["DI"]:o["DI"] + T]), "soc_mwh": rr(soc)}, "price_usd_mwh": rr(sol["dual"][:T]),
            "marginal_class": marginal_class(cfg, lp, x),
            "co2_t": float(round(co2, 3)), "renewable_share_pct": float(round(ren_share, 2)), "unserved_mwh": float(round(x[o["UN"]:o["UN"] + T].sum(), 3)),
            "curtailed_mwh": float(round((x[o["CS"]:o["CS"] + 2 * T]).sum(), 3))}


def price_check(lp: dict, sol: dict, eps: float = 0.01) -> bool:
    """True when the balance-row duals are unique: forward and backward finite differences of the objective w.r.t. each hour's demand agree with the dual."""
    base = sol["objective"]
    ok = True
    for t in range(T):
        vals = []
        for sgn in (1, -1):
            l2 = dict(lp)
            lo, hi = lp["row_lb"].copy(), lp["row_ub"].copy()
            lo[t] += sgn * eps; hi[t] += sgn * eps
            l2["row_lb"], l2["row_ub"] = lo, hi
            try:
                vals.append(sgn * (solve(l2)["objective"] - base) / eps)
            except AssertionError:
                return False
        if abs(vals[0] - vals[1]) > 1e-6 or abs(vals[0] - sol["dual"][t]) > 1e-4:
            ok = False
            break
    return ok


def to_cplex_lp(lp: dict) -> str:
    nv = len(lp["cost"])
    out = ["\\ Pulse Energy Grid dispatch LP (generated); variable order in dispatch_model.json", "Minimize", " obj: " + " + ".join(f"{c:.10g} x{j}" for j, c in enumerate(lp["cost"]) if c != 0), "Subject To"]
    A = lp["A"].tocsr()
    for i in range(A.shape[0]):
        a, b = lp["row_lb"][i], lp["row_ub"][i]
        terms = " ".join(f"{'+' if v >= 0 else '-'} {abs(v):.10g} x{j}" for j, v in zip(A.indices[A.indptr[i]:A.indptr[i + 1]], A.data[A.indptr[i]:A.indptr[i + 1]]))
        if a == b:
            out.append(f" r{i}: {terms} = {a:.10g}")
        else:
            assert a == -INF and b < INF
            out.append(f" r{i}: {terms} <= {b:.10g}")
    out.append("Bounds")
    for j in range(nv):
        hi = "+inf" if lp["ub"][j] >= INF else f"{lp['ub'][j]:.10g}"
        out.append(f" {lp['lb'][j]:.10g} <= x{j} <= {hi}")
    out.append("End")
    return "\n".join(out) + "\n"


def solve_cplex_text(text: str) -> float:
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "m.lp"
        f.write_text(text)
        h = highspy.Highs()
        h.setOptionValue("output_flag", False)
        h.readModel(str(f))
        h.run()
        return float(h.getInfo().objective_function_value)


def formulation() -> dict:
    return {"summary": "Single-node 24-hour least-cost dispatch. Minimise fuel/VOM cost + battery wear + value-of-lost-load penalty subject to hourly energy balance, battery state of charge, hydro daily energy, ramp limits and capacity bounds.",
            "variables": ["g[c,t] dispatchable class output MW (c in dispatchable classes, t = 0..23)", "curtS[t], curtW[t] curtailed solar and wind MW (used = availability*renewables_scale - curtailment)", "ch[t], dis[t] battery charge and discharge MW",
                          "soc[t] battery energy MWh at the END of hour t (t = 0..23; the start-of-day SoC is the constant soc0)", "uns[t] unserved energy MW"],
            "constraints": ["balance[t]: sum_c g[c,t] - curtS[t] - curtW[t] + dis[t] - ch[t] + uns[t] = Dnet[t] - Savail[t] - Wavail[t]; Dnet = demand*demand_scale + heat_shock - imports - fixed_other",
                            "soc[t] - soc[t-1] - eta*ch[t] + dis[t]/eta = 0 with soc[-1] = soc0*E, eta = sqrt(round_trip_eff)", "sum_t g[hydro,t] <= hydro_energy_mwh", "ramp: |g[c,t] - g[c,t-1]| <= ramp_frac*capacity for t = 1..23 (two rows each)",
                            "bounds: min(pmin*cap, cap*a) <= g <= cap*a (a = 1 - outage_pct/100 for the outaged class, else 1), 0 <= curt <= availability, 0 <= ch,dis <= battery_power_mw, soc_min*E <= soc <= E with E = battery_power_mw * battery_hours, soc[23] >= soc0*E, uns >= 0"],
            "objective": "min sum_t [ sum_c cost[c]*g[c,t] + wear*dis[t] + VOLL*uns[t] ]; reported cost = solver objective; the breakdown by class sums to it",
            "variable_order": ["g: index c*24 + t, classes in the order of `classes` filtered to kind=dispatchable", "curtS: (nC+0)*24 + t", "curtW: (nC+1)*24 + t", "ch: (nC+2)*24 + t", "dis: (nC+3)*24 + t", "soc: (nC+4)*24 + t", "uns: (nC+5)*24 + t"],
            "row_order": ["balance rows t = 0..23", "soc rows t = 0..23 (row 0 has right-hand side soc0*E)", "hydro energy row (if a hydro class exists)", "for each dispatchable class c in order, for t = 1..23: ramp-up row (g[c,t]-g[c,t-1] <= R) then ramp-down row (g[c,t-1]-g[c,t] <= R)"],
            "heat_shock": "heat_shock[h] = b_cool[h] * (max(T[h] + heat_wave_c - Tc, 0) - max(T[h] - Tc, 0)) from weather_relation.json",
            "solver": f"HiGHS via highspy {HIGHSPY_VERSION} (HiGHS {HIGHS_VERSION}), simplex, presolve on, 1 thread, in Python; the browser build declares highs@1.15.3 (HiGHS-wasm), not run in this repo",
            "price_definition": "price_usd_mwh[t] = row dual of balance[t] = d(objective_usd)/d(Dnet[t]): USD per extra MWh of demand in hour t. Positive when more demand raises cost; equals the marginal cost of the marginal class, VOLL (1000) when load is shed, about 0 in curtailment hours. In HiGHS' sign convention for a minimisation problem. Unique only when the LP is non-degenerate at that hour (see price_comparable in the test vectors).",
            "controls_note": "Control ids are the keys of every params object. battery energy = battery_power_mw * battery_hours. demand scale = 1 + demand_growth_pct/100. outage removes outage_pct percent of one class's capacity (its minimum output stays, capped at the remaining capacity, so an outage never lowers cost); 'none' disables it."}


def stress_params(cfg: dict) -> dict:
    return {"stress_unserved": full_params(cfg, {"demand_growth_pct": 35.0, "heat_wave_c": 8.0, "outage_class": "ccgt", "outage_pct": 50.0}),
            "stress_curtailment": full_params(cfg, {"renewables_scale": 3.0})}


def random_params(cfg: dict, rng: np.random.Generator) -> dict:
    out = {}
    for c in cfg["controls"]:
        if c["kind"] == "range":
            n = int(round((c["max"] - c["min"]) / c["step"]))
            out[c["id"]] = float(round(c["min"] + c["step"] * rng.integers(0, n + 1), 6))
        else:
            out[c["id"]] = str(rng.choice(c["options"]))
    # keep random combinations interior: no outage class half of the time
    if rng.random() < 0.5:
        out["outage_class"] = "none"
    return full_params(cfg, out)


def run_all(cfgs: dict[str, dict]) -> tuple[dict, list[dict]]:
    import hashlib
    results, vectors = {}, []
    rng = np.random.default_rng(20261010)
    for ba, cfg in cfgs.items():
        results[ba] = {"days": {}}
        for day in cfg["days"]:
            results[ba]["days"][day["id"]] = {}
            cases = [(sc["id"], "preset", sc["params"]) for sc in cfg["scenarios"]]
            cases += [(f"random_{i}", "random", random_params(cfg, rng)) for i in range(4)]
            cases += [(k, k, v) for k, v in stress_params(cfg).items()]
            for sid, kind, params in cases:
                lp = make_lp(cfg, day, params)
                sol = solve(lp)
                res = package(cfg, lp, sol)
                if kind == "preset":
                    results[ba]["days"][day["id"]][sid] = res
                vectors.append({"ba": ba, "day": day["id"], "scenario": sid, "kind": kind, "params": lp["params"],
                                "expected": {"objective_usd": res["objective_usd"], "cost_breakdown_usd": res["cost_breakdown_usd"], "class_energy_mwh": {k: float(round(sum(v), 3)) for k, v in res["dispatch_mw"].items()},
                                             "unserved_mwh": res["unserved_mwh"], "curtailed_mwh": res["curtailed_mwh"], "soc_mwh": res["battery"]["soc_mwh"], "price_usd_mwh": res["price_usd_mwh"],
                                             "price_comparable": price_check(lp, sol), "max_price_usd_mwh": max(res["price_usd_mwh"]), "co2_t": res["co2_t"], "marginal_class": res["marginal_class"]},
                                "lp_text_sha256": hashlib.sha256(to_cplex_lp(lp).encode()).hexdigest()})
    return results, vectors
