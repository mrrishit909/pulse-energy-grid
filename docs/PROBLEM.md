# Problem statement: Pulse Energy Grid

**Tagline.** The Invisible Machine That Powers Everything.

## Question
A power grid must match supply to demand every hour with no inventory. Two things decide whether it does so cheaply and cleanly:
(1) how well tomorrow's demand can be predicted, and (2) how generators and storage are dispatched against that demand hour by hour.
This product answers both with real operating data and a transparent, reproducible model.

1. **Forecast.** For two large US balancing authorities (BAs), how accurately can hourly demand be forecast a day ahead, and does an
   independent model with weather features beat the BA's own day-ahead forecast published through EIA-930? If it does not, we say so.
2. **Dispatch.** Given a real day of demand and renewable output, what is the minimum-cost 24-hour schedule for a fleet of generator
   classes plus a battery, and how does that schedule and its cost move under scenarios (more renewables, demand growth, a larger
   battery, a heat wave, an outage of one class)?

## Why these two BAs
- **CISO (California ISO).** Solar-heavy: the "duck curve" makes the evening ramp and batteries the central story. Net imports are large.
- **ERCO (ERCOT, Texas).** Wind + solar with a hot, volatile summer peak and a nearly islanded grid (interchange near zero).
Together they show two different renewable regimes with identical pipelines.

## Users and decisions served
A curious non-specialist and a technical reviewer. The site lets them (a) see a forecast against truth with honest error numbers,
(b) run the dispatch LP live in the browser and watch the stack fill the 24-hour clock, (c) read every limitation.

## Scope
In: hourly EIA-930 demand, EIA day-ahead forecast, net generation by fuel, interchange, for CISO and ERCO,
2021-01-01 to 2025-08-26 UTC (40,776 hourly slots per series); NOAA ISD hourly temperature and dew point at population-weighted airport stations;
the IEEE 14-bus test case as an illustrative topology.

Out (stated, not hidden): real network constraints (the dispatch is a single-node copper-plate LP; the 14-bus case is decoration of the
idea, never the real CAISO or ERCOT network), unit commitment (no binary start-up decisions), reserves/ancillary services, real
market prices, weather forecasts as inputs (only observed weather, see LIMITATIONS), outage statistics.

## Success criteria (checked in `tests/`)
- Source reconciliation: raw rows = kept + excluded, per series, exactly.
- Strict temporal split with no leakage; features use only information available at the forecast origin (except the clearly labelled
  perfect-weather variant, which is an upper bound and never presented as deployable).
- Forecast errors reported for the test period against two baselines (seasonal-naive, EIA day-ahead), with interval coverage.
- Every reported dispatch cost equals the HiGHS objective; battery state of charge stays within bounds; browser parity vectors reproduce.
- All published artifacts validate against `data/contracts/*.schema.json` and each is under 400 KB gzip.

## Honesty tags
OBSERVED (EIA, NOAA as published), DERIVED (computed from observed data by a stated rule), PREDICTED (model output on held-out data),
SIMULATED (dispatch LP outputs and all cost/emission assumptions), SYNTHETIC (none planned). Tags appear in every artifact and in the UI.

## Ethics and licensing
EIA data is a US government work in the public domain; acknowledgment "Source: U.S. Energy Information Administration" is shown.
NOAA ISD is a US government work. pglib-opf IEEE 14-bus data is CC BY 4.0 (attribution shown). Open-Meteo was rejected because its free
tier is non-commercial only.
