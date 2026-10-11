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
    b = model["bas"][ba]
    return {"classes": b["classes"], "battery": b["battery"], "voll_usd_mwh": b["voll_usd_mwh"], "days": b["days"], "heat_wave": b["heat_wave"]}


def run(model, ba, day, params):
    cfg = cfg_of(model, ba)
    d = next(x for x in cfg["days"] if x["id"] == day)
    lp = X.make_lp(cfg, d, params)
    return cfg, lp, X.solve(lp)


def test_reported_cost_equals_solver_objective_and_breakdown_sums(model):
    res = json.loads((PUBLIC / "dispatch_results.json").read_text())
    n = 0
    for ba in BAS:
        for day, sc in res["bas"][ba]["days"].items():
            for s, r in sc.items():
                assert sum(r["cost_breakdown_usd"].values()) == pytest.approx(r["objective_usd"], rel=1e-6, abs=1)
                _, lp, sol = run(model, ba, day, next(x for x in model["scenarios"] if x["id"] == s)["params"])
                assert r["objective_usd"] == pytest.approx(sol["objective"], rel=1e-9, abs=1e-3)
                n += 1
    assert n == 48


def test_battery_soc_within_bounds_and_energy_conserved(model):
    for ba in BAS:
        cfg = cfg_of(model, ba)
        b = cfg["battery"]
        for d in cfg["days"]:
            for sc in X.SCENARIOS:
                lp = X.make_lp(cfg, d, sc["params"])
                r = X.package(cfg, lp, X.solve(lp))
                bs = lp["params"]["battery_scale"]
                soc = np.array(r["battery"]["soc_mwh"])
                E = b["energy_mwh"] * bs
                assert soc.min() >= b["soc_min_frac"] * E - 1e-2 and soc.max() <= E + 1e-2
                assert soc[0] == pytest.approx(b["soc0_frac"] * E, abs=1e-2) and soc[-1] >= soc[0] - 1e-2
                ch, di = np.array(r["battery"]["charge_mw"]), np.array(r["battery"]["discharge_mw"])
                eta = b["round_trip_eff"] ** 0.5
                assert np.allclose(np.diff(soc), eta * ch - di / eta, atol=0.05)
                assert ch.max() <= b["power_mw"] * bs + 1e-2 and di.max() <= b["power_mw"] * bs + 1e-2


def test_power_balance_ramps_and_capacity(model):
    for ba in BAS:
        cfg = cfg_of(model, ba)
        for d in cfg["days"]:
            lp = X.make_lp(cfg, d, {"heat_delta_c": 3.0})
            r = X.package(cfg, lp, X.solve(lp))
            supply = sum(np.array(v) for v in r["dispatch_mw"].values()) + np.array(r["renewable_used_mw"]["solar"]) + np.array(r["renewable_used_mw"]["wind"])
            supply += np.array(r["battery"]["discharge_mw"]) - np.array(r["battery"]["charge_mw"]) + np.array(r["unserved_mw"])
            assert np.allclose(supply, lp["dnet"], atol=0.05)
            for c in cfg["classes"]:
                if c["kind"] != "dispatchable":
                    continue
                g = np.array(r["dispatch_mw"][c["id"]])
                assert g.max() <= c["capacity_mw"] + 0.01 and g.min() >= c["pmin_frac"] * c["capacity_mw"] - 0.01
                assert np.abs(np.diff(g)).max() <= c["ramp_frac_per_h"] * c["capacity_mw"] + 0.05
            hy = np.array(r["dispatch_mw"]["hydro"]).sum()
            assert hy <= d["hydro_energy_mwh"] + 0.1


def test_text_lp_and_matrix_lp_agree(model):
    ref = model["reference_lp"]
    _, lp, sol = run(model, ref["ba"], ref["day"], {})
    assert X.solve_cplex_text(ref["cplex_lp"]) == pytest.approx(sol["objective"], rel=1e-8)
    assert ref["objective_usd"] == pytest.approx(sol["objective"], rel=1e-8)
    assert X.to_cplex_lp(lp) == ref["cplex_lp"]


def test_vectors_reproduce_exactly(model, vectors):
    assert len(vectors["vectors"]) >= 24
    tol = vectors["tolerance_rel"]
    for v in vectors["vectors"]:
        cfg, lp, sol = run(model, v["ba"], v["day"], v["params"])
        r = X.package(cfg, lp, sol)
        e = v["expected"]
        assert r["objective_usd"] == pytest.approx(e["objective_usd"], rel=tol, abs=vectors["tolerance_abs"])
        for k, x in e["cost_breakdown_usd"].items():
            assert r["cost_breakdown_usd"][k] == pytest.approx(x, rel=1e-4, abs=vectors["tolerance_abs"] * 10)
        assert r["unserved_mwh"] == pytest.approx(e["unserved_mwh"], abs=vectors["tolerance_abs"])
        assert r["co2_t"] == pytest.approx(e["co2_t"], rel=1e-4, abs=0.5)


def test_scenario_directions_are_sane(model):
    for ba in BAS:
        for d in model["bas"][ba]["days"]:
            o = {s["id"]: run(model, ba, d["id"], s["params"])[2]["objective"] for s in model["scenarios"]}
            assert o["renewables_up"] <= o["baseline"] + 1e-6
            assert o["demand_growth"] >= o["baseline"] - 1e-6
            assert o["battery_big"] <= o["baseline"] + 1e-6
            assert o["heat_wave"] >= o["baseline"] - 1e-6
            assert o["outage"] >= o["baseline"] - 1e-6


def test_zero_battery_never_beats_default(model):
    for ba in BAS:
        d = model["bas"][ba]["days"][2]
        a = run(model, ba, d["id"], {"battery_scale": 0.0})[2]["objective"]
        b = run(model, ba, d["id"], {})[2]["objective"]
        assert b <= a + 1e-6
