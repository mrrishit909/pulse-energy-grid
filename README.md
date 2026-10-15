# Pulse Energy Grid

**The Invisible Machine That Powers Everything.** Real hourly demand, generation and day-ahead forecasts for two US balancing authorities (CISO, ERCO) from EIA-930, NOAA hourly weather, a strict-split forecasting benchmark against EIA's own forecast, and a time-coupled economic-dispatch LP with a battery that also runs in the browser (HiGHS WebAssembly). Static site; no backend.

This repository holds the data and engine (pipelines, analytics, tests, versioned JSON artifacts). The site lives in `site/`.

Live site (placeholder until deployed): https://mrrishit909.github.io/pulse-energy-grid/

Part of The Data Frontier program (project 04). Status: `docs/BUILD_STATUS.md`. It is an educational explainer on public operating data and an assumption-based dispatch model, not a market tool and not a model of the real grid.

## Run
```
uv sync
uv run python -m pipelines.run_all --fetch   # first run: downloads EBA.zip (695 MB), NOAA files, pglib case
uv run python -m pipelines.run_all           # reruns from data/raw and data/interim, no network
uv run pytest -q
uv run python -m pipelines.validate_artifacts
```

## Docs
`docs/`: PROBLEM, DATA_SOURCES, DATA_CONTRACTS, METHODOLOGY (generated), VISUAL_DESIGN, MOTION_SYSTEM, ARCHITECTURE, TESTING, LIMITATIONS, DEPLOYMENT, BUILD_STATUS. Honesty tags in every artifact: OBSERVED, DERIVED, PREDICTED, SIMULATED, SYNTHETIC.

## Site and reproduction

Requires Python 3.12+ with [uv](https://docs.astral.sh/uv/) and Node 24. The raw downloads are large (EBA.zip 695 MB, 4.38 GB unpacked, streamed once). The published artifacts are committed, so the site steps work without the pipeline.

```
# data and engine
uv sync
uv run python -m pipelines.run_all --fetch
uv run pytest -q          # 11 slow tests skip themselves when data/interim is absent

# site
cd site
npm ci
npm run typecheck && npm run lint && npm test
npm run build && npm run preview    # http://localhost:4331/pulse-energy-grid/
npm run e2e                         # Playwright against the production build, includes the parity run
```

Browser parity run: `npm run e2e` solves all 108 vectors from `dispatch_test_vectors.json` with HiGHS-wasm in a worker and compares them with the Python results. The criterion is the objective on all 108 vectors; prices only where the vector is `price_comparable`.

Layout: `pipelines/` (ingestion, cleaning, publish, contracts), `analytics/` (forecast, evaluate, dispatch), `data/contracts/` (JSON Schema per artifact), `site/` (Vite + React 18 + TypeScript, Canvas 2D, Lenis, HiGHS-wasm module worker), `site/public/data/` (13 artifacts), `tests/` (pytest). See `docs/ARCHITECTURE.md`. Deploy: `scripts/deploy_site_pages.sh pulse-energy-grid` (`docs/DEPLOYMENT.md`).

## Honesty tags

Every number carries a tag, visible in the UI.

| Tag | Meaning |
|---|---|
| OBSERVED | Read directly from EIA-930 or NOAA files |
| DERIVED | Deterministic computation on observed data (cleaning, aggregates, net load, bias) |
| PREDICTED | Forecast-model output on held-out data |
| SIMULATED | The dispatch LP, its costs, prices and emissions, under stated assumptions |
| SYNTHETIC | Generated stand-in data; none is published |

## Data credits
Source: U.S. Energy Information Administration (EIA-930). Weather: NOAA NCEI Integrated Surface Database. Topology: IEEE PES Power Grid Library pglib-opf IEEE 14-bus case (CC BY 4.0), illustrative only.

- U.S. Energy Information Administration, EIA-930 Hourly Electric Grid Monitor: public domain; "Source: U.S. Energy Information Administration".
- NOAA NCEI Integrated Surface Database (via the AWS Open Data mirror): U.S. Government work, public domain.
- pglib-opf case14 (IEEE PES Power Grid Library): CC BY 4.0, attribution required.
- HiGHS (highs-js, `highs@1.15.3`): MIT licence; runs in the browser as WebAssembly served from this site.

## Fonts and code

Fonts are self-hosted through `@fontsource-variable` with no runtime font requests (172 KB): Newsreader (SIL OFL 1.1) and JetBrains Mono (SIL OFL 1.1). The visual system is inspired by a reference site; none of its fonts, logos, images or code are used. Code: author's own work; no license file has been added yet (open question).

## Code licence status

No code licence has been selected for this repository. It is public so the work can be viewed; public visibility does not itself grant any right to copy, modify, redistribute or reuse the code, text or design. All rights are reserved by the author until a licence file is added. Third-party data keeps its own licence and attribution terms, listed in `docs/DATA_SOURCES.md`.
