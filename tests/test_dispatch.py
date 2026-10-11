import hashlib
import json

import numpy as np
import pytest

from analytics import dispatch as X
from pipelines.common import BAS, PUBLIC


@pytest.fixture(scope="module")
def model():
    return json.loads((PUBLIC / "dispatch_model.json").read_text())


@pytest.fixture(scope="module")
def vectors():
    return json.loads((PUBLIC / "dispatch_test_vectors.json").read_text())


def cfg_of(model, ba):
    return model["bas"][ba]


def run(model, ba, day, params):
    cfg = cfg_of(model, ba)
    d = next(x for x in cfg["days"] if x["id"] == day)
    lp = X.make_lp(cfg, d, params)
    return cfg, lp, X.solve(lp)


def test_reported_cost_equals_solver_objective_and_breakdown_sums(model):
    res = json.loads((PUBLIC / "dispatch_results.json").read_text())
    n = 0
    for ba in BAS:
        ids = {c["id"] for c in model["bas"][ba]["classes"] if c["kind"] == "dispatchable"}
        for day, sc in res["bas"][ba]["days"].items():
            for s, r in sc.items():
                assert set(r["cost_breakdown_usd"]) == ids | {"battery_wear", "unserved_voll"}
                assert set(r["dispatch_mw"]) == ids | {"battery_discharge"}
                assert sum(r["cost_breakdown_usd"].values()) == pytest.approx(r["objective_usd"], rel=1e-6, abs=1)
                params = next(x for x in model["bas"][ba]["scenarios"] if x["id"] == s)["params"]
                _, lp, sol = run(model, ba, day, params)
                assert r["objective_usd"] == pytest.approx(sol["objective"], rel=1e-9, abs=1e-3)
                n += 1
    assert n == 6 * (5 + 4)


def test_marginal_class_values_and_prices(model):
    res = json.loads((PUBLIC / "dispatch_results.json").read_text())
    for ba in BAS:
        ids = {c["id"] for c in model["bas"][ba]["classes"] if c["kind"] == "dispatchable"} | {"unserved", "surplus"}
        for sc in res["bas"][ba]["days"].values():
            for r in sc.values():
                assert len(r["marginal_class"]) == 24 and set(r["marginal_class"]) <= ids
                for t in range(24):
                    if r["marginal_class"][t] == "unserved":
                        assert r["unserved_mw"][t] > 0.5 and r["price_usd_mwh"][t] == pytest.approx(1000, abs=1e-3)
                    assert r["price_usd_mwh"][t] >= -1e-6


def test_battery_soc_within_bounds_and_energy_conserved(model):
    for ba in BAS:
        cfg = cfg_of(model, ba)
        b = cfg["battery"]
        for d in cfg["days"]:
            for sc in cfg["scenarios"]:
                lp = X.make_lp(cfg, d, sc["params"])
                r = X.package(cfg, lp, X.solve(lp))
                soc = np.array(r["battery"]["soc_mwh"])
                E = lp["E"]
                assert soc.min() >= b["soc_min_frac"] * E - 1e-2 and soc.max() <= E + 1e-2
                assert soc[0] == pytest.approx(b["soc0_frac"] * E, abs=1e-2) and soc[-1] >= soc[0] - 1e-2
                ch, di = np.array(r["battery"]["charge_mw"]), np.array(r["battery"]["discharge_mw"])
                eta = b["round_trip_eff"] ** 0.5
                assert np.allclose(np.diff(soc), eta * ch - di / eta, atol=0.05)
                assert ch.max() <= lp["P"] + 1e-2 and di.max() <= lp["P"] + 1e-2


def test_power_balance_ramps_and_capacity(model):
    for ba in BAS:
        cfg = cfg_of(model, ba)
        for d in cfg["days"]:
            lp = X.make_lp(cfg, d, {"heat_wave_c": 3.0})
            r = X.package(cfg, lp, X.solve(lp))
            supply = sum(np.array(v) for k, v in r["dispatch_mw"].items() if k != "battery_discharge") + np.array(r["renewable_used_mw"]["solar"]) + np.array(r["renewable_used_mw"]["wind"])
            supply += np.array(r["battery"]["discharge_mw"]) - np.array(r["battery"]["charge_mw"]) + np.array(r["unserved_mw"])
            assert np.allclose(supply, lp["dnet"], atol=0.05)
            for c in cfg["classes"]:
                if c["kind"] != "dispatchable":
                    continue
                g = np.array(r["dispatch_mw"][c["id"]])
                assert g.max() <= c["capacity_mw"] + 0.01 and g.min() >= c["pmin_frac"] * c["capacity_mw"] - 0.01
                assert np.abs(np.diff(g)).max() <= c["ramp_frac_per_h"] * c["capacity_mw"] + 0.05
            assert np.array(r["dispatch_mw"]["hydro"]).sum() <= d["hydro_energy_mwh"] + 0.1


def test_text_lp_and_matrix_lp_agree(model):
    ref = model["reference_lp"]
    _, lp, sol = run(model, ref["ba"], ref["day"], {})
    assert X.solve_cplex_text(ref["cplex_lp"]) == pytest.approx(sol["objective"], rel=1e-8)
    assert ref["objective_usd"] == pytest.approx(sol["objective"], rel=1e-8)
    assert X.to_cplex_lp(lp) == ref["cplex_lp"]


def test_vector_composition(vectors):
    v = vectors["vectors"]
    assert len(v) >= 24
    for ba in BAS:
        mine = [x for x in v if x["ba"] == ba]
        days = {x["day"] for x in mine}
        assert len(days) >= 2
        for d in days:
            kinds = [x["kind"] for x in mine if x["day"] == d]
            assert kinds.count("preset") == 6 and kinds.count("random") >= 4 and "stress_unserved" in kinds and "stress_curtailment" in kinds
        assert any(x["expected"]["unserved_mwh"] > 0 for x in mine if x["kind"] == "stress_unserved")
        assert any(x["expected"]["curtailed_mwh"] > 0 for x in mine if x["kind"] == "stress_curtailment")
        assert any(x["kind"] == "random" and x["params"] not in [s["params"] for s in cfg_scen(ba)] for x in mine)


def cfg_scen(ba):
    return json.loads((PUBLIC / "dispatch_model.json").read_text())["bas"][ba]["scenarios"]


def test_vectors_reproduce_exactly_including_lp_hash_and_prices(model, vectors):
    tol = vectors["tolerance_rel"]
    n_price = 0
    for v in vectors["vectors"]:
        cfg, lp, sol = run(model, v["ba"], v["day"], v["params"])
        r = X.package(cfg, lp, sol)
        e = v["expected"]
        assert hashlib.sha256(X.to_cplex_lp(lp).encode()).hexdigest() == v["lp_text_sha256"]
        assert r["objective_usd"] == pytest.approx(e["objective_usd"], rel=tol, abs=vectors["tolerance_abs"])
        for k, x in e["cost_breakdown_usd"].items():
            assert r["cost_breakdown_usd"][k] == pytest.approx(x, rel=1e-4, abs=vectors["tolerance_abs"] * 10)
        assert sum(e["cost_breakdown_usd"].values()) == pytest.approx(e["objective_usd"], rel=1e-6, abs=1)
        assert r["unserved_mwh"] == pytest.approx(e["unserved_mwh"], abs=vectors["tolerance_abs"])
        assert r["co2_t"] == pytest.approx(e["co2_t"], rel=1e-4, abs=0.5)
        if e["price_comparable"]:
            n_price += 1
            assert np.allclose(r["price_usd_mwh"], e["price_usd_mwh"], atol=vectors["tolerance_price_usd_mwh"])
    assert n_price > 0.3 * len(vectors["vectors"])


def test_control_extremes_are_feasible_and_solvable(model):
    for ba in BAS:
        cfg = cfg_of(model, ba)
        rng = np.random.default_rng(3)
        d = cfg["days"][2]
        ctr = {c["id"]: c for c in cfg["controls"]}
        corners = [{k: (c["min"] if c["kind"] == "range" else "none") for k, c in ctr.items()}, {k: (c["max"] if c["kind"] == "range" else c["options"][-1]) for k, c in ctr.items()}]
        for p in corners + [X.random_params(cfg, rng) for _ in range(10)]:
            lp = X.make_lp(cfg, d, p)
            sol = X.solve(lp)
            assert sol["objective"] >= 0


def test_controls_and_display_metadata(model):
    for ba in BAS:
        cfg = cfg_of(model, ba)
        for c in cfg["controls"]:
            if c["kind"] == "range":
                assert c["min"] <= c["default"] <= c["max"] and c["step"] > 0
        ids = {c["id"] for c in cfg["classes"]}
        assert set(cfg["display_order"]) >= (ids - {"coal"} if "coal" not in ids else ids) | {"imports", "other", "battery_discharge"}
        assert len(set(cfg["display_order"])) == len(cfg["display_order"])
        assert [s["id"] for s in cfg["sinks"]] == ["battery_charge", "curtailment", "exports"]
        for sc in cfg["scenarios"]:
            assert set(sc["params"]) == {c["id"] for c in cfg["controls"]}
        for d in cfg["days"]:
            assert d["dst_transition"] is False and len(d["demand_mw"]) == 24
            assert set(d["observed_gen_mw"]) == set(model["bas"][ba]["classes"] and {"NG", "COL", "NUC", "OIL", "OTH", "SUN", "WAT", "WND"} - ({"OIL"} if ba == "ERCO" else set()))
    intro = [d for d in cfg_of(model, "CISO")["days"] if d["intro"]]
    assert len(intro) == 1 and "highest share" in intro[0]["intro_rule"]
    assert not any(d["intro"] for d in cfg_of(model, "ERCO")["days"])


def test_observed_day_identity_demand_equals_generation_plus_imports(model):
    """DR-1: the published observed stack is the real day: sum of fuels + imports reproduces demand within EIA's own CISO residual."""
    for ba in BAS:
        for d in cfg_of(model, ba)["days"]:
            gen = sum(np.array(v) for v in d["observed_gen_mw"].values())
            resid = gen - np.array(d["observed_interchange_mw"]) - np.array(d["demand_mw"])
            assert np.abs(resid).max() < 6000  # CISO: EIA identity gap; ERCO: fuel-sum gap since 2024-10 (both documented in reconciliation.json)


def test_scenario_directions_are_sane(model):
    for ba in BAS:
        for d in model["bas"][ba]["days"]:
            o = {s["id"]: run(model, ba, d["id"], s["params"])[2]["objective"] for s in model["bas"][ba]["scenarios"]}
            assert o["renewables_up"] <= o["baseline"] + 1e-6
            assert o["demand_growth"] >= o["baseline"] - 1e-6
            assert o["battery_big"] <= o["baseline"] + 1e-6
            assert o["heat_wave"] >= o["baseline"] - 1e-6
            assert o["outage"] >= o["baseline"] - 1e-6


def test_zero_battery_never_beats_default(model):
    for ba in BAS:
        d = model["bas"][ba]["days"][2]
        a = run(model, ba, d["id"], {"battery_power_mw": 0.0})[2]["objective"]
        b = run(model, ba, d["id"], {})[2]["objective"]
        assert b <= a + 1e-6


def test_solver_versions_and_price_definition_published(model):
    assert model["solver_versions"]["python_highspy"] and "highs@1.15.3" in model["solver_versions"]["browser"]
    assert "row dual" in model["formulation"]["price_definition"]
