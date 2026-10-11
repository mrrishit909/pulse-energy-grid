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

## Commands run (2026-10-11, working tree during Stage B; numbers are from these runs)

| Command | Result |
|---|---|
| `uv run pytest -q` | 68 passed (5.07 s) with `data/interim` present locally |
| `uv run pytest -q -m "not slow"` | 57 passed, 11 deselected (3.95 s); this is what CI runs, because `tests/conftest.py` skips the 11 `slow` tests (they need `data/interim/hourly.parquet`, built from the 695 MB EBA.zip) |
| `npm run typecheck` (site) | clean |
| `npm run lint` (site) | clean |
| `npm test` (site, Vitest) | 7 files, 55 tests passed (2.19 s) |

Not run in this pass (frontend agent owns the production build): `npm run build`, `npm run e2e`. The Playwright specs in `site/e2e/` (`shell`, `prototype`, `labels`) cover shell and nav, axe, no external requests, LCP ghost, the S00 radius rule, radial-only strokes, area truth, the 108/108 worker parity run and the PRECOMPUTED fallback; their results are `TBD (pending QA)`.

## Site tests

| Layer | What it proves |
|---|---|
| Vitest (`site/src/**/*.test.ts`) | `loader` typed states; `copy` text agrees with `facts.json` and hygiene (no banned characters); `lp` browser LP text builder; `fmt`; `city` Window City model; `rose` geometry; `progress` stepped scroll progress |
| Playwright (`site/e2e/`) | see above; run against the production build served by `npm run preview` |

## Browser parity (HiGHS-wasm vs Python)

The criterion is the **objective on all 108 vectors** in `dispatch_test_vectors.json` (relative tolerance `tolerance_rel`, published unrounded at 1e-6, plus `tolerance_abs`); **prices are compared only where the vector is `price_comparable`** (a degenerate LP can have several optimal duals). The browser builds the same CPLEX LP text as Python and the hash of the text is checked per vector. Run: build and preview the site, then `cd site && npm run e2e` (the parity spec solves all 108 vectors in the worker). Result: `TBD (pending QA)`.

## Performance, accessibility, visual QA

Lighthouse, axe-core on the final build, frame pacing, and screenshots at 1440x900, 768x1024, 390x844: `TBD (pending QA)`. Stage A and B screenshot evidence is in `artifacts/evidence/`.
