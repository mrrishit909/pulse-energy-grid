# Pulse Energy Grid

**The Invisible Machine That Powers Everything.** Real hourly demand, generation and day-ahead forecasts for two US balancing authorities (CISO, ERCO) from EIA-930, NOAA hourly weather, a strict-split forecasting benchmark against EIA's own forecast, and a time-coupled economic-dispatch LP with a battery that also runs in the browser (HiGHS WebAssembly). Static site; no backend.

This repository holds the data and engine (pipelines, analytics, tests, versioned JSON artifacts). The site lives in `site/`.

## Run
```
uv sync
uv run python -m pipelines.run_all --fetch   # first run: downloads EBA.zip (695 MB), NOAA files, pglib case
uv run python -m pipelines.run_all           # reruns from data/raw and data/interim, no network
uv run pytest -q
uv run python -m pipelines.validate_artifacts
```

## Docs
`docs/PROBLEM.md`, `DATA_SOURCES.md`, `DATA_CONTRACTS.md`, `METHODOLOGY.md` (generated), `LIMITATIONS.md`, `TESTING.md`. Honesty tags in every artifact: OBSERVED, DERIVED, PREDICTED, SIMULATED, SYNTHETIC.

## Data credits
Source: U.S. Energy Information Administration (EIA-930). Weather: NOAA NCEI Integrated Surface Database. Topology: IEEE PES Power Grid Library pglib-opf IEEE 14-bus case (CC BY 4.0), illustrative only.
