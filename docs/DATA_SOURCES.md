# Data sources, provenance and licensing

Verified 2026-10-10 by download. Checksums and row counts: `data/manifests/*.json`.

| Source | Publisher | Coverage used | Format / size | Terms | Tag |
|---|---|---|---|---|---|
| EIA bulk `EBA.zip` (EIA-930 Hourly Electric Grid Monitor) | U.S. Energy Information Administration | CISO and ERCO, 2021-01-01T00Z to 2025-08-26T23Z | one 4.38 GB file `EBA.txt` inside a 695 MB zip, JSON lines, one series per line | Public domain; "Source: U.S. Energy Information Administration" acknowledgment | OBSERVED |
| NOAA Integrated Surface Database (global-hourly), mirrored on AWS Open Data | NOAA NCEI | 8 airport stations, 2021-01-01 to 2025-08-27 | CSV per station-year, 5 to 8 MB each, 40 files | U.S. Government work | OBSERVED |
| pglib-opf `pglib_opf_case14_ieee.m` v23.07 | IEEE PES Power Grid Library (data originally University of Washington PSTCA) | 14 buses, 20 branches, 5 generators | 13.8 KB | CC BY 4.0, attribution required | OBSERVED (illustrative test system) |

## EIA-930 row schema (verified)
`EBA.txt` is JSON lines. Each line: `series_id`, `name`, `units` (megawatthours), `f` ("H"), `description`, `start`, `end`, `last_updated`,
`data` = `[["YYYYMMDDTHH", value], ...]` newest first. **All timestamps are UTC** (ISO8601 hour) and **hour-ending** (see DATA_CONTRACTS.md, Timestamp convention). `series_id` pattern `EBA.{BA}-ALL.{KIND}[.{FUEL}].H`:

| Kind | Series used | Meaning |
|---|---|---|
| `D` | `EBA.{BA}-ALL.D.H` | Actual demand (MWh in the hour = average MW) |
| `DF` | `EBA.{BA}-ALL.DF.H` | EIA-930 day-ahead demand forecast as reported by the BA |
| `NG` | `EBA.{BA}-ALL.NG.H` | Total net generation |
| `NG.{fuel}` | `EBA.{BA}-ALL.NG.{fuel}.H` | Net generation by fuel: NG natural gas, COL coal, NUC nuclear, OIL oil (CISO only in this extract), OTH other, SUN solar, WAT hydro, WND wind |
| `TI` | `EBA.{BA}-ALL.TI.H` | Total interchange (positive = export) |

Source data begin 2019-01-01; we use 2021-01-01 onward to avoid the 2020 COVID demand regime, and end at 2025-08-26 because the NOAA mirror ends there (below).
Extraction is a single streaming pass (`pipelines/ingestion/eia.py`, peak memory under 1 GB). `EBA.txt` is not stored; the extracted rows are in `data/interim/eia_long.parquet`.

## Balancing authority choice (justified)
| BA | Why | Coverage check (this extract) |
|---|---|---|
| CISO | Largest solar fleet in the BA set, strong evening ramp, large net imports, 8 fuel series | 40,775 of 40,776 demand rows; DF 40,704 rows |
| ERCO | Wind + solar, extreme summer peaks (demand max 85.5 GW), nearly islanded, 7 fuel series | 40,775 demand rows; DF 40,776 rows |

Both have demand, day-ahead forecast, total generation, interchange and every fuel series for the full window. Other candidates were not evaluated; the choice is by regime contrast, not an exhaustive search.

## Weather: NOAA ISD (replaces Open-Meteo)
Open-Meteo is excluded (free tier non-commercial only, see research/P04-sources.md). NOAA ISD hourly observations (TMP air temperature, DEW dew point, in tenths of degC with quality codes) at
airport stations, mapped to each BA with approximate metro population weights (rounded 2020 census metro-area millions; weights are a documented assumption, DERIVED):

| BA | Station (USAF-WBAN) | Name | Weight |
|---|---|---|---|
| CISO | 72295023174 | Los Angeles Intl (LAX) | 0.55 |
| CISO | 72494023234 | San Francisco Intl (SFO) | 0.20 |
| CISO | 72290023188 | San Diego Intl (SAN) | 0.15 |
| CISO | 72483993225 | Sacramento Metropolitan (SMF) | 0.10 |
| ERCO | 72259003927 | Dallas/Fort Worth, DAL FTW WSCMO (DFW) | 0.38 |
| ERCO | 72243012960 | Houston Intercontinental (IAH) | 0.35 |
| ERCO | 72254013904 | Austin-Bergstrom (AUS) | 0.14 |
| ERCO | 72253012921 | San Antonio Intl (SAT) | 0.13 |

Weights are round-number metro-population shares (LA ~13M, Bay ~4.7M, San Diego ~3.3M, Sacramento ~2.4M; DFW ~7.6M, Houston ~7.1M, Austin ~2.3M, San Antonio ~2.6M) normalised and rounded. They are not demand-weighted; the sensitivity is stated in LIMITATIONS.
Download pattern: `https://noaa-global-hourly-pds.s3.amazonaws.com/{year}/{USAF}{WBAN}.csv`.

## Recorded failures and constraints (not hidden)
- **NOAA data end 2025-08-27.** The AWS mirror's newest observation in the downloaded 2025 files is 2025-08-27T07:59; no 2026 files exist on the mirror and the NCEI access service returned no rows for later dates. EIA runs to 2026-10. Therefore the study window ends at **2025-08-26T23Z**. EIA data after that date are unused.
- **LightGBM unavailable.** The macOS arm64 wheel fails to load (`libomp.dylib` missing, no Homebrew libomp). Per the orchestrator ruling the model is scikit-learn `HistGradientBoostingRegressor` (same algorithm family: histogram-based gradient-boosted trees, native quantile loss).
- **EIA Grid Monitor pages** returned 503 during research; we use only the bulk file. Update cadence of the bulk file not documented; `last_updated` per series is stored in the extraction manifest.
- San Antonio station id first tried (72252012921) does not exist on the mirror; the correct id 72253012921 is used.

## Candidates evaluated and not used
| Candidate | Why not |
|---|---|
| EIA v2 JSON API | Requires a key; DEMO_KEY capped at 5,000 rows per response. Bulk used instead |
| Open-Meteo archive | Free tier is non-commercial only |
| Real network models (CAISO/ERCOT) | Not public at usable fidelity; IEEE 14-bus is labelled illustrative |
| Market prices (CAISO OASIS, ERCOT) | Not in scope; dispatch costs are assumptions (SIMULATED), not market prices |

## Known quality issues handled (details in METHODOLOGY.md and `quality.json`)
Missing hours and null values; DST (EIA is UTC, local conversion via IANA tz); demand/forecast spikes; negative values in some generation series; generation by fuel vs total net generation reconciliation; EIA demand + interchange vs generation balance.
