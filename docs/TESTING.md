# Testing (data and engine)

`uv run pytest -q` (slow tests need `data/interim/hourly.parquet`, built by `uv run python -m pipelines.run_all`; they are skipped with a clear reason otherwise).

| File | What it proves |
|---|---|
| `tests/test_cleaning.py` | gap filling only for short bounded gaps; spike rule flags an isolated spike but not a level shift; complete 40,776-slot UTC grid per BA, no duplicates; DST day counts (23h and 25h days) and local-hour conversion; flagged values retained as flags; imputed hours flagged |
| `tests/test_quality.py` | value ranges (demand, temperature, interchange); coverage above 99.5%; gap report; outlier rules declared |
| `tests/test_reconciliation.py` | ledger invariants hold exactly for all 23 series (`grid_slots = raw + missing`, `raw = kept + null + flagged`); ledger total equals the extraction manifest; fuel-sum and EIA identity checks; weather coverage and weights |
| `tests/test_models.py` | strict temporal split (disjoint, ordered); **no-leakage test**: all observations at or after a row's forecast origin are nulled and the deployable features of that row must be unchanged (includes the 25-hour fall-back edge case); conformal coverage; bootstrap CI; forecast_eval internal consistency; facts agree with forecast_eval |
| `tests/test_dispatch.py` | reported cost equals the HiGHS objective for all 48 solves and the per-class breakdown sums to it; battery SoC bounds, dynamics and power limits; hourly power balance, capacity, minimum output, ramp limits and hydro energy; text LP and matrix LP give the same objective and the text is reproducible; test vectors reproduce; scenario directions are sane; a zero battery never beats the default |
| `tests/test_contracts.py` | every artifact validates against its JSON Schema; gzip budget (400 KB); honesty tags valid; no NaN/Inf; schema files equal the generator; no U+2014/U+2015 in tracked files; attribution and illustrative-topology labels present |

Reproducibility: two consecutive `run_all` runs must produce byte-identical artifacts (checked in `docs/BUILD_STATUS`-adjacent evidence by the orchestrator via `shasum site/public/data/*.json`).
