import pytest

from pipelines.common import BAS


def test_ledger_invariants_exact(art):
    rec = art("reconciliation")
    assert len(rec["ledger"]) == 2 * (4 + 8) - 1  # CISO: D DF NG TI + 8 fuels; ERCO: 4 + 7 fuels
    for r in rec["ledger"]:
        assert r["grid_slots"] == r["raw_rows"] + r["missing_slots"], r
        assert r["raw_rows"] == r["kept"] + r["null_value"] + r["flagged_outlier"] + r["timing_excluded"], r
        assert r["flagged_outlier"] == r["flagged_range"] + r["flagged_spike"], r
        assert r["grid_slots"] == 40776


def test_ledger_matches_extraction_manifest(art):
    import json
    from pipelines.common import MANIFESTS
    m = json.loads((MANIFESTS / "eia_extract.json").read_text())
    raw = sum(r["raw_rows"] for r in art("reconciliation")["ledger"])
    # extraction is padded by 3 h each side and the per-series timing correction moves rows, so on-grid rows are the extract minus a few edge/collision rows
    assert m["raw_rows_extracted"] - 23 * 12 <= raw <= m["raw_rows_extracted"]


@pytest.mark.parametrize("ba", BAS)
def test_fuel_sum_vs_total_and_balance_identity(art, ba):
    rec = art("reconciliation")
    g, b = rec["generation_vs_total"][ba], rec["balance"][ba]
    assert g["n_hours"] > 40_000 and g["mean_abs_resid_pct"] < 0.5
    assert b["n_hours"] > 39_000
    if ba == "ERCO":
        assert b["mean_abs_resid_mw"] < 5  # EIA identity NG = D + TI holds for ERCOT
    else:
        assert b["mean_abs_resid_mw"] > 100  # known CISO inconsistency is documented, not hidden


def test_weather_coverage(art):
    for w in art("reconciliation")["weather"]:
        assert w["hours_observed"] + w["hours_missing"] >= 0.99 * w["hours_expected"]
        assert w["hours_missing"] < 0.02 * w["hours_expected"]
    for ba in BAS:
        assert abs(sum(w["weight"] for w in art("reconciliation")["weather"] if w["ba"] == ba) - 1) < 1e-9
