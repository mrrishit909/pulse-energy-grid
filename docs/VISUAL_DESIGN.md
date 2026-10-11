# Visual design: Pulse Energy Grid ("The Invisible Machine That Powers Everything")

This document covers phases 14-16: reference research, three competing concepts with a scored
selection, and the experience blueprint. The motion bible (phase 17) is `MOTION_SYSTEM.md`.
Author: Creative Director (task P04-CD-001), 2026-10-10.

## Contents

0. [Binding inputs](#0-binding-inputs)
1. [Reference research (phase 14)](#1-reference-research-phase-14)
2. [Three concepts and the selection (phase 15)](#2-three-concepts-and-the-selection-phase-15)
3. [Experience blueprint (phase 16)](#3-experience-blueprint-phase-16)
4. [Signature interactions](#4-signature-interactions)
5. [Copy deck](#5-copy-deck)
6. [Placeholder bindings and data requests](#6-placeholder-bindings-and-data-requests)
7. [Hard rejection criteria](#7-hard-rejection-criteria)

---

## 0. Binding inputs

These are inputs to the design. The design does not choose them.

- **Shared language.** `design/reference-analysis.md`, `design/interaction-inventory.md`, `shared/design-tokens/tokens.css` and `design/fonts/DECISION.md` (workspace root). Fonts: Newsreader (display) and JetBrains Mono (everything else). The ghost-word state is opacity 0.55 plus a 12px blur (ENGINEERING_DECISIONS #10).
- **What other projects own** (`docs/DESIGN_AUDIT.md`, ENGINEERING_DECISIONS #14, #15, #19, and the three sibling VISUAL_DESIGN docs). Evidence I opened: P01 `artifacts/evidence/stage-b3/sheet-1440x900.png` and its `06-futures-a-busier.png` frame, and P02 `design/sketches/orb-s00-d.svg`.
  - **P01** owns an oversized *stroked* ring with nodes on its circumference, chords inside, a stepping horizon dial, and seeded pulses travelling along chords.
  - **P02** owns rectilinear depth walls, an Electric price orb that contracts to a floor marker and grows back, and orange trade droplets. DESIGN_AUDIT forbids P04 from reusing "blue gradient mass plus orange droplets".
  - **P03** owns a Solar data globe of square grid cells, an equal-area unwrap, a vertical core of yearly strata, and a push into the cell surface.
  - **Owned by P04.** Both P02's and P03's documents list the **24-hour radial clock** as P04's identity, so radial time is ours. The task is to make it a *filled* form that can never be confused with P01's ring.
- **Data facts read on 2026-10-10.** I read these from `data/interim/hourly.parquet` (read only, for sizing; copy numbers bind to `facts.json`):
  - The window is 2021-01-01 to 2025-08-26 UTC.
  - Observed hourly demand peaks are **CISO 51,104 MW** and **ERCO 85,544 MW**. Both fit under the 96,000 MW window city (3.4 S03a).
  - On CISO days, `gen_oth` is **negative at midday and positive in the evening** (storage charging and discharging reported in OTH). Negative stack values are therefore normal in OBSERVED roses, so the rose has an explicit sink rule (below).
  - Some observed hours have demand greater than generation plus imports (an EIA balance residual), so the rose has a residual rule.
- **Contracts.** `docs/DATA_CONTRACTS.md` plus 13 schemas in `data/contracts/` (commit `17897cc`, "Contracts: ..."). Section 6 binds every placeholder to those field names. Anything missing is a numbered data request (DR-n).
- **Sketches** (original, rendered from three OBSERVED EIA-930 days): `design/sketches/rose-s00-d.svg/.png` (S00 end state), `design/sketches/city-s03a-d.svg/.png` (S03a), and `design/sketches/distinctness-sheet.png` (P01 real frame, P02 S00 sketch, and two P04 sketches side by side). The generator is `design/sketches/render_rose_sketch.py`.
  - The first sketch stacked nuclear and hydro at the centre and read as **concentric rings**. That was rejected and fixed by the true merit order (zero-cost solar and wind at the centre), which makes every band boundary swing with the sun.
- **What we take from the reference** (principles only, never assets or copy):
  - black stages lit by one luminous form
  - oversized serif statements revealed word by word through blur
  - uppercase mono for all UI and body copy
  - 100dvh sticky stages in long tracks
  - threshold-stepped 1.2s settles
  - 4-segment story cards
  - an argument card stack
  - a square blur bottom nav and a mobile current-section pill
  - a closing that echoes the opening

  We do **not** take its 164vw ring dial: P04's circle is filled, never stroked, and never rotates.

### The Day Rose: encoding (binding)

The giant circular element is **the Day Rose**: one day of a real grid as 24 filled petals.

| Aspect | Rule |
|---|---|
| Petal | Petal `h` is local hour `[h, h+1)` in the BA's IANA zone (`America/Los_Angeles` CISO, `America/Chicago` ERCO). Its angles are `θ0 = (h − 12) × 15°` and `θ1 = θ0 + 15°`, clockwise from 12 o'clock |
| **Sky orientation** | **Noon at the top**, dawn on the left, dusk on the right and midnight at the bottom. This is the sun's path as seen facing south, so the solar lobe always sits in the upper half. It is not a clock face: there is no "12 o'clock means midnight" ambiguity, and no hand |
| **Area is energy** | The cumulative radius is `r(c) = R100 × sqrt(c / 100,000 MW)`, where `R100` is the radius of a 100,000 MW hour in the active geometry state. Band area is therefore proportional to MW, as in Nightingale's polar area diagram. **Radius is never linear in MW.** Data tweens interpolate `r²` (area), never `r` |
| Band order (centre outward) | **Merit order.** OBSERVED roses: `SUN, WND, NUC, WAT, IMPORTS (−TI where TI < 0), OTH (positive part), NG, COL, OIL`. SIMULATED roses: `dispatch_model.bas[ba].display_order` (DR-5): renewables used, fixed inflows, hydro, nuclear, battery discharge, then dispatchable classes by `marginal_cost_usd_mwh`. The order is fixed per BA, never per hour, so every band is keyed by class across hours |
| Demand line | A 1px white arc at `r(demand)` across each petal, over a 2px black underlay |
| **Sink cap** (S > D) | Supply that did not serve load goes **beyond** the demand line, hatched (45°, 1.5px lines at a 6px pitch): `#9B5CFF` for battery charging and negative OTH ("storage charging and station use, as reported"), `#9A9A9A` for exports (TI > 0). The order outward is charging, then exports |
| **Residual** (OBSERVED, D > S) | The gap `r(S)..r(D)` is a 1px dotted white outline with no fill. The inspector calls it `BALANCE RESIDUAL (AS REPORTED)`, and its size comes from `reconciliation.json` |
| **Unserved** (SIMULATED) | `r(served)..r(demand)` gets a white 45° hatch on black with a 1px `#FF6A4D` (`--state-error`) outline |
| **Curtailment** (SIMULATED) | A 1px dotted `#8FD9FF` outline from the petal tip out to `r(tip + curtailed)`, with no fill: energy that was available and thrown away |
| Spokes | Constant-width black gaps, built from parallel edges rather than radial ones: D 3px at G0 and 2px elsewhere, T 3/2px, M 2/1.5px |
| Seams | A 1px black seam at every band boundary (0.5px on M). Adjacent hues are always separated, so colour is never the only cue |
| Selected hour | The petal translates outward by `0.025 × R100` along its bisector and gets a 1px white outline. Nothing else moves |
| Hour labels | Only `00 06 12 18`, in mono 11px (M) to 13px (D), placed 16px beyond **that petal's own tip**. They follow the data and never sit on a fixed circle |
| Scale key | A free-standing wedge glyph beside the readout, drawn at the active `R100`: `THIS WEDGE = 10,000 MW FOR ONE HOUR` |
| **Never** | Never an outer circle, concentric gridlines, a tick ring, nodes or markers on any circumference, chords, rotation, a stepped angle, a sweep hand or any angular (clockwise) fill. **Fills are radial: band by band, all 24 petals at once** |

### Colour semantics (project 04 rule set)

Roles. **Deep blue `#192CE4` is the control system:** operator surfaces, filled only. **Orange-red `#FF4C25` is energy being burned at the margin.** This differs from P02, where blue *is* the data mass (a gradient of liquidity) and orange falls as droplets. In P04, blue never appears as a gradient, never as a data area and never as a moving mark, and orange never falls.

| Role | Value | Contrast on `#000` | Rule |
|---|---|---|---|
| Solar | `#FFC23D` | 13.0 | Band and window colour family |
| Wind | `#8FD9FF` | 13.5 | |
| Nuclear | `#F2F2F2` | 18.8 | |
| Hydro | `#58B8E1` | 9.4 | |
| Imports (fixed inflow) | `#9A9A9A` | 7.5 | Not generated in the BA |
| Other (OTH, fixed other) | `#5A5A5A` | 3.0 | Passes 3:1 for graphics; the seam separates it |
| Battery discharge / charging hatch | `#9B5CFF` | 5.4 | It is not the SYNTHETIC tag colour (`#B48CFF`), and is never used for text |
| Gas, observed (NG) and gas peaker class | `#FF4C25` | 6.3 | The "energy" colour |
| Gas combined-cycle class | `#FF7A1F` | 8.1 | SIMULATED classes only |
| Coal | `#B8361A` | 3.6 | |
| Oil | `#B8361A` plus a 2px black 45° hatch | 3.6 | |
| **Deep blue (fill only)** | `#192CE4` | 2.5 | Active parameter blocks (white text, 8.3:1), notification card 2, the blue story card, and bus squares in S07. **Never** a line, text, gradient or data band |
| Network lines (P04 token `--grid-line`) | `#5B6BFF` | 5.0 | The only blue line colour. It is used solely for the illustrative 14-bus branches (S07) |
| Window lit / unlit | `#FFF3A6` / `#1A1A1A` | 18.6 / n/a | S03a only |
| PREDICTED | `#8FA2FF` (`--tag-predicted`, 8.8) | | See the uncertainty grammar |
| Text | `#fff`, and `rgba(255,255,255,.5)` at 13px and up | | Data colours are never used for body text |

**PRICE layer** (S06, CTRL): petals switch from the class stack to one fill per petal, binned by the SIMULATED shadow price `price_usd_mwh`. Luminance rises with price ("the day burns brighter where power is dear"). The bins (USD/MWh) are:

| Bin | Range | Colour |
|---|---|---|
| P0 | 0 or below (surplus, curtailing) | `#8FD9FF` |
| P1 | above 0 to 25 | `#5A5A5A` |
| P2 | 25 to 50 | `#B8361A` |
| P3 | 50 to 100 | `#FF4C25` |
| P4 | 100 to 500 | `#FF7A1F` |
| P5 | 500 to below VOLL | `#FFC23D` |
| P6 | VOLL (`voll_usd_mwh`, unserved) | `#FFF3A6` plus the unserved hatch |

The legend is a direct 7-swatch mono strip with its edges written under it.

**Colour vision.** Bands are separated by black seams and spokes. The stack order is fixed, so position also encodes class, and the direct legend lists the stack centre-first beside the rose with MW values. Blue versus yellow (wind versus solar) survives protan and deutan vision. Tritan risk (wind versus nuclear) is covered by the seam and the order.

### Uncertainty and honesty grammar

| Kind | Tag | Visual |
|---|---|---|
| Observed demand or generation (EIA-930) | OBSERVED | Solid bands. As a series, a solid white 2px line |
| Unit chart, month-hour means, net load, temperature response | DERIVED | Solid fills plus a DERIVED chip. Lines and edges in `#58B8E1` |
| Our forecast (P50) | PREDICTED | A `#8FA2FF` 1.5px line |
| Our interval (P10-P90) | PREDICTED | A `#8FA2FF` 45° hatch (1px at a 6px pitch, 50%) with no edge line. **Never a solid fill** |
| EIA day-ahead forecast (the BA's own) | PREDICTED, published by the BA in EIA-930 | White 1px dashed (4/3) |
| Seasonal-naive baseline | PREDICTED (baseline) | White 50% 1px dotted (1/3) |
| Dispatch, cost, price, CO2, SoC, unserved, curtailment | SIMULATED | The rose plus a **permanently attached** orange `SIMULATED · MODEL` chip at the rose's lower right, and every readout number prefixed `MODEL`. In the CTRL ledger, the cost line ends with `= SOLVER OBJECTIVE ✓` |
| IEEE 14-bus network | Artifact tag plus `ILLUSTRATIVE` | Only in S07 answer 4 (3.4) |
| SYNTHETIC | Never, unless the artifact tags the topology so (DR-10) | |

Every visual carries one chip: 13px mono, 8px padding, `#ffffff1a` background, with the tag colour from tokens. Where an artifact carries a `tags` entry, **the chip text comes from the artifact**, not from this document. `gbm_perfect_weather` appears only in S07 answer 3, labelled `UPPER BOUND · NOT AVAILABLE AT FORECAST TIME`.

---

## 1. Reference research (phase 14)

Each reference was verified on 2026-10-10 by one of these methods:

- **C:** `curl -L` (desktop UA) returned HTTP 200, and the page title was read (quoted).
- **R:** the orchestrator's captured reference walk (`design/reference/`).
- **F:** a fact read from a file in this repository.

**The Motion column describes, it does not observe.** Unless the row is marked R, I did not watch the motion in a browser for this task, and the design does not claim it as an observed interaction.

Excluded after checking (not cited):

| URL | Result |
|---|---|
| app.electricitymaps.com | 403 (Cloudflare) |
| gridstatus.io | 403 (Cloudflare) |
| otexts.com/fpp3 (Hyndman, *Forecasting: Principles and Practice*) | 403 |
| bloomberg.com/graphics (climate data) | 403 bot check |
| nrel.gov/grid | timed out (HTTP 000) |
| isotype.org | 200, but an unrelated Italian company |
| blackmarble.gsfc.nasa.gov | a redirect stub only |
| en.wikipedia.org/wiki/Economic_dispatch | redirects to "Merit order" (cited once, as #20) |

| # | Reference (URL) | Verified | Technique | Motion (described, not observed, unless R) | Strength for us | Implementation direction | Originality strategy |
|---|---|---|---|---|---|---|---|
| 1 | Blink Capital, https://blink.capital/ | R | 100dvh sticky stages, story cards, chat stack, blur bottom nav, one luminous form | Observed: 1.2s `cubic-bezier(.33,1,.68,1)` stepped settles, word blur reveal, instant nav jumps | The mandatory grammar | Principles only, through the shared shell and tokens | Our luminous form is a filled day of energy, not a ring. No rotation, no dial |
| 2 | EIA "Real-time Operating Grid", https://www.eia.gov/electricity/gridmonitor/ | C ("Real-time Operating Grid - U.S. Energy Information Administration (EIA)") | The publisher's own dashboard of EIA-930 demand, forecast, generation and interchange | Chart updates on selection | Source of record. It shows what experts expect to see side by side | Our S02 card 1 explains one EIA-930 row field by field, in the publisher's terms | A narrative instrument, not a monitor. We make no live claim and state the data vintage |
| 3 | EIA Today in Energy, "As solar capacity grows, duck curves are getting deeper in California", https://www.eia.gov/todayinenergy/detail.php?id=56880 | C (title as quoted) | Net load by year as overlaid lines | Static | The canonical framing of the duck and its year-on-year deepening | S03b "The Bite": NET LOAD carves the rose, and YEAR steps deepen the bite (DR-3) | A duck as a **bitten rose**: the midday hollow is a missing area at the top of a radial day, not a line dip |
| 4 | CAISO "Today's Outlook", https://www.caiso.com/todays-outlook | C ("Today's Outlook \| California ISO") | Demand, net demand, forecast and supply trend charts for the current day | Live updating | Shows that a BA's own public framing is net demand against forecast | S03b NET LOAD layer and the S04 EIA day-ahead line | We show history and held-out tests, never "today" |
| 5 | CAISO "Today's Outlook \| Supply", https://www.caiso.com/todays-outlook/supply | C (title as quoted) | Supply by resource as a stacked area through the day | Live | The supply stack by fuel, hour by hour, is the operator's mental model | The Day Rose *is* this stack, made radial and area-true | Stacked radially in merit order, so the marginal fuel is always the rim |
| 6 | ERCOT "Grid and Market Conditions", https://www.ercot.com/gridmktinfo/dashboards | C ("Grid and Market Conditions") | Dashboard of demand, supply, fuel mix and outages | Live | The second BA's own vocabulary (near-islanded grid, wind and solar) | GRID toggle copy, and the S01 card 2 claim (DR-9) | Same as 4 |
| 7 | ERCOT "Load Forecast", https://www.ercot.com/gridinfo/load/forecast | C ("Load Forecast") | A BA publishing its own day-ahead forecasts | n/a | Confirms the "beat the BA's own forecast" framing | S04 compares our model with the BA forecast carried in EIA-930 | We report both outcomes honestly (`beats_eia` true or false) |
| 8 | Kate Morley, "National Grid: Live", https://grid.iamkate.com/ | C ("National Grid: Live") | A minimal, typographic, single-page view of a national grid's sources | Light updates | Proof that restraint and type can carry grid data | Mono readouts with tabular figures, direct legends, no chrome | Editorial scenes and a radial day; we never copy her layout |
| 9 | "Carbon Intensity", https://carbonintensity.org.uk/ | C ("Carbon Intensity") | Forecast and actual carbon intensity per half hour | n/a | Pairs a forecast with its realisation | The CTRL ledger's CO2 line (SIMULATED) sits next to cost | We never show a carbon forecast; CO2 is a model output, labelled so |
| 10 | Fraunhofer ISE "Energy-Charts", https://www.energy-charts.info/ | C ("Energy-Charts") | Dense research charts of generation, prices and load | Interactive charts | The analytical depth a technical reader expects | The forecast lab and the scenario ledger meet that bar | We keep one question per scene instead of a chart wall |
| 11 | Ember, "Electricity Data Explorer", https://ember-energy.org/data/electricity-data-explorer/ | C ("Electricity Data Explorer \| Ember") | Country and fuel shares over years | Selection transitions | Annual shares as context | S02 card 2 shares (`fuel_mix.annual_share_pct`) | Shares appear inside roses, not as bar races |
| 12 | IEA "Real-Time Electricity Tracker", https://www.iea.org/data-and-statistics/data-tools/real-time-electricity-tracker | C ("Real-Time Electricity Tracker - IEA") | Daily demand and weather-corrected comparisons | n/a | Demand against weather as a first-class relation | S02 card 3 "Heat leans on the load" (`weather_relation`) | We show the fitted relation with its CI, DERIVED |
| 13 | Our World in Data, "Energy", https://ourworldindata.org/energy | C ("Energy \| Our World in Data") | Explainers plus charts with clear sourcing | Static | Source and licence lines under every chart | The tag chip plus a source line on every visual | n/a |
| 14 | Data Viz Catalogue, "Nightingale Rose Chart", https://datavizcatalogue.com/methods/nightingale_rose_chart.html | C ("Nightingale Rose Chart - Learn about this chart and tools") | Polar area chart: equal angles, radius by value | n/a | Names the form and its known pitfall: area must be proportional, so the radius goes as the square root | `r = R100 × sqrt(MW / 100,000)` everywhere, and tweens in `r²` | Ours is stacked in merit order, sky-oriented, giant and cropped, and fills radially as the LP solves |
| 15 | Wikipedia, "Florence Nightingale", https://en.wikipedia.org/wiki/Florence_Nightingale | C ("Florence Nightingale - Wikipedia") | Origin of the polar area diagram (1858) | n/a | A 19th-century persuasive radial form: a precedent for an argued, not decorative, rose | The rose argues one thing per scene (the bite, the rim thinning, the stress) | A day, not a year of months |
| 16 | D3, "Radial areas", https://d3js.org/d3-shape/radial-area | C ("Radial areas \| D3 by Observable") | Radial area generator (angle, inner and outer radius) | n/a | The geometry API family for annular bands | We use our own Canvas2D annular-sector path with constant-width spokes (3.2). `d3-shape` is not needed for the rose | n/a |
| 17 | D3, "Arcs", https://d3js.org/d3-shape/arc | C ("Arcs \| D3 by Observable") | Annular sectors with `padAngle` and `padRadius` | n/a | `padRadius` gives constant-width gaps, which is the spoke rule | Our spoke rule mirrors `padRadius` semantics, with a Vitest geometry check | n/a |
| 18 | Chart.js, "Polar Area Chart", https://www.chartjs.org/docs/latest/charts/polar.html | C ("Polar Area Chart \| Chart.js") | A library polar area chart with gridline circles and a legend box | Default grow-in | **Anti-reference.** It is exactly what the rose must never look like: concentric gridlines, angle lines, a floating legend, a radius-linear scale | Rejection criteria 1 to 3 | No gridlines, no legend box, area-true, giant and cropped |
| 19 | NASA Earth Observatory, "Night Lights", https://earthobservatory.nasa.gov/features/NightLights | C ("Earth Observatory - NASA Science") | Cities read as light at night | Static imagery | The emotional image behind "a dark city lighting up" | The S03a window city: warm windows on black | **No geography.** Our city is a unit chart of real MW, and buildings are groups of windows, not places |
| 20 | Wikipedia, "Merit order", https://en.wikipedia.org/wiki/Merit_order | C ("Merit order - Wikipedia") | Dispatch in ascending marginal cost | n/a | The economic rule behind the stack order | The band order (centre = cheapest), and the rim = the price-setting unit | The merit order becomes geometry: the rim is where cost lives |
| 21 | Wikipedia, "Duck curve", https://en.wikipedia.org/wiki/Duck_curve | C ("Duck curve - Wikipedia") | Net load through the day, with a midday dip and an evening ramp | n/a | Shared vocabulary | S03b copy and the evening-ramp readouts | Radial, so the ramp is the right-hand flank of the rose |
| 22 | Wikipedia, "Isotype (picture language)", https://en.wikipedia.org/wiki/Isotype_(picture_language) | C ("Isotype (picture language) - Wikipedia") | Countable unit pictograms: one symbol = a fixed quantity | n/a | The honest way to say "a city lighting up": count units, never scale symbols | `1 WINDOW = 100 MW`, one building = 80 windows, filled building by building | Windows are squares in a facade, not people or icons |
| 23 | HiGHS, https://highs.dev/ | C ("HiGHS - High-performance parallel linear optimization software") | Open-source LP/MIP solver | n/a | The Python pipeline's solver (`formulation.solver`) | The browser uses the **same solver** for parity | n/a |
| 24 | highs-js, https://github.com/lovasoa/highs-js | C ("GitHub - lovasoa/highs-js: Javascript linear programming library") | HiGHS compiled to WebAssembly; solves a CPLEX LP string | n/a | Same solver in the browser. Measured from the npm tarball `highs@1.15.3`: `highs.wasm` 3.53 MB raw / **1.21 MB gzip**, `highs.mjs` 39 KB gzip | Lazy-loaded in a module worker at S04 (MOTION_SYSTEM 9.1). The TS builder emits the same CPLEX LP text as Python (`reference_lp.cplex_lp`) | n/a |
| 25 | pglib-opf, https://github.com/power-grid-lib/pglib-opf | C ("GitHub - power-grid-lib/pglib-opf: Benchmarks for the Optimal Power Flow Problem") | Benchmark power networks (IEEE 14-bus, CC BY 4.0) | n/a | A real, citable test topology | S07 answer 4 only, labelled ILLUSTRATIVE, with our own layout `design/ieee14-layout.json` | It is never the CAISO or ERCOT network, and the LP never uses it |
| 26 | Romano, Patterson, Candès, "Conformalized Quantile Regression", https://arxiv.org/abs/1905.03222 | C ("[1905.03222] Conformalized Quantile Regression") | Calibrating quantile intervals to nominal coverage | n/a | The method behind `intervals.gbm.cqr_*` | S04 interval toggle RAW / CONFORMAL with coverage readouts | Coverage shown as counted hours, not adjectives |
| 27 | LightGBM documentation, https://lightgbm.readthedocs.io/en/latest/ | C ("Welcome to LightGBM's documentation! ...") | Gradient-boosted trees, quantile objective | n/a | The model family named in the plan | S07 answer 1 names the model and its features (`forecast_eval.features`) | n/a |
| 28 | Claus O. Wilke, *Fundamentals of Data Visualization*, "Visualizing uncertainty", https://clauswilke.com/dataviz/visualizing-uncertainty.html | C ("Fundamentals of Data Visualization") | Bands and graded displays for uncertainty | Static | Different uncertainty kinds need different looks | The grammar in section 0: hatch for intervals, dashed for the BA forecast, dotted for naive | n/a |
| 29 | W3C, "Understanding Success Criterion 1.4.11: Non-text Contrast", https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html | C (title as quoted) | 3:1 for graphical objects | n/a | Why `#192CE4` (2.5:1) cannot be a network line | The `--grid-line` token `#5B6BFF` (5.0:1) | n/a |
| 30 | Lenis, https://lenis.darkroom.engineering/ | C ("Lenis – Smooth Scroll") | Normalized smooth scroll | Inertial scroll | The reference's own smoothing | Lenis drives the one progress loop (shared shell) | n/a |
| 31 | Igloo Inc (Awwwards SOTD), https://www.awwwards.com/sites/igloo-inc | C ("Igloo Inc - Awwwards SOTD") | A cinematic intro that hands off to scroll | Described | Award-level intro pacing | The 4.6s skippable Bloom, whose end state *is* the S01 start | Our intro is a data stack filling, not a crystal or a camera flight |
| 32 | Active Theory V6 (Awwwards SOTD), https://www.awwwards.com/sites/active-theory-v6 | C ("Active Theory V6 - Awwwards SOTD") | A studio site built on one dominant real-time form | Described | Shows one form carrying a whole site | The rose carries every scene from S00 to S08 (G-states) | 2D Canvas, data-bound, no 3D |
| 33 | The Pudding, "Human Terrain", https://pudding.cool/2018/10/city_3d/ | C ("Human Terrain") | One object transformed under scroll | Scroll-driven camera (described) | Pacing of one transformation | S04 unroll: the rose opens at midnight into a week-long line | No 3D, no terrain |
| 34 | MDN, "Using Web Workers", https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers | C ("Using Web Workers - Web APIs \| MDN") | Off-main-thread work | n/a | Solving must never block scroll or input | The solver lives in a module worker, latest-request-wins | n/a |
| 35 | MDN, `WebAssembly.instantiateStreaming()`, https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static | C (title as quoted) | Compile wasm while it downloads | n/a | Shortest path from bytes to a ready solver | The worker compiles `highs.wasm` by streaming, with real byte progress | n/a |

---

## 2. Three concepts and the selection (phase 15)

All three use the shared family:

- black stages, Newsreader statements, mono UI
- sticky stages in tracks
- story cards and an argument stack
- the bottom blur nav and a closing echo

What differs is the metaphor, the giant circular composition, the scene composition and the closing.

**The distinctness constraint I designed against:**

| Project | Owns (do not touch) |
|---|---|
| P01 | A 164vw **stroked** ring with nodes on its circumference, chords inside, stepping as a horizon dial. Seeded pulses along chords. A rising spectral horizon closing |
| P02 | Rectilinear depth walls. An **Electric glow orb** that contracts to a marker and grows back. Orange droplets. Blue as gradient mass |
| P03 | A Solar globe of square cells, the equal-area unwrap, a vertical core of strata, a push into the surface |
| Planned P05-P10 | Radial dot field (P05), radar sweep over rings (P06), globe-limb arc with travelling nodes (P07), concentric population rings (P08), cohort rings (P09), a central orb branching (P10) |

### Concept A: "The Day Rose"

- **Philosophy.** A grid is a machine with no warehouse: every hour, supply must equal demand. A day of the grid is therefore 24 separate acts of balance. Draw each hour as a petal whose **area is the energy** it needed, filled from the centre outward in **merit order**: the free sun and wind at the core, then the steady plants, then whatever is burned at the margin. The rim of every petal is the hour's most expensive, dirtiest decision. The whole site asks one question of this flower: **what does it take to keep the rim thin?**
- **Signature geometry.** The **Day Rose** (section 0) and its two companions:
  - the **window city**, a unit chart where 1 window = 100 MW of observed demand
  - the **unrolled week**, the forecast lab, where the rose opens at midnight into a line
- **Accent use.**
  - The rose's light is the fuels themselves: solar yellow, wind and hydro blues, nuclear white, gas orange-red.
  - Deep blue `#192CE4` is the control system, used as filled operator surfaces.
  - Orange-red is energy at the margin: gas, the rim pulse after each solve, and the high price bins.
- **Layout.** Asymmetric editorial: statements on a left measure, the rose centre-right. In S00 and S08 the rose is giant, centred and cropped. In S03a it sits over a skyline across the bottom of the frame. In CTRL, a control rail runs on the right.
- **3D/2D strategy.** **Canvas2D only**: about 24 x 12 annular sectors, 960 windows and one 168-point line. There is no WebGL and no three.js. The illustrative 14-bus card is SVG. HiGHS-wasm runs in a worker.
- **Hero concept.** Black. A giant rose outline (one real CISO spring day, OBSERVED) appears at full, cropped size, and its bands **fill radially in merit order**: sun, wind, nuclear, hydro, imports, other, gas. The top half becomes a solar fan, and the night side burns at the rim. "The invisible machine that powers everything."
- **Nav labels.** PULSE · SOURCE · DEMAND · NET LOAD · FORECAST · DISPATCH · STRESS · EVIDENCE · CONTROL ROOM
- **Motion character.**
  - Radial filling: never sweeping, never rotating.
  - Petals settle, and the rim beats once after every solve.
  - Hour and month changes are 200ms crossfades between real states.
- **Responsive approach.**
  - D: the rose sits centre-right.
  - T: the rose sits on top, with controls in chip rows.
  - M: the rose sits at the top of the frame, the skyline is a compact band, and controls live in a bottom sheet.
  - The rose is always drawn from parameters (centre, `R100`), never by scaling a bitmap.

### Concept B: "The Furnace"

- **Philosophy.** The grid as a furnace that glows with load: one sun-like disc whose luminosity and colour temperature follow system demand and marginal cost, hour by hour.
- **Signature geometry.** A giant flat concentric Solar/Spectral glow disc, with the dispatch stack as horizontal "grate" strata beneath it.
- **Hero concept.** A dim ember brightens through 24 hours into a white-hot evening peak.
- **Nav labels.** EMBER · FUEL · HEAT · DUCK · TOMORROW · STOKE · STRAIN · PROOF · BOILER ROOM
- **Weaknesses.**
  - The disc is one number per frame. It cannot show the stack, the duck or 24 hours at once, so time becomes animation only.
  - A glow disc is **exactly** what P02 (Electric orb) and P03 (Solar orb) already open and close with. A contact sheet would confuse them.
  - Luminosity as a quantitative channel is weak and unlabelled.

### Concept C: "The Switchboard"

- **Philosophy.** The grid as a network: the IEEE 14-bus system drawn as a giant circular busbar with feeders as spokes and generators on the circumference. Orange pulses travel the ring as demand rises; a dark city lights up district by district.
- **Signature geometry.** A 164vw stroked busbar ring with nodes, plus spokes.
- **Hero concept.** A black-start: one generator node lights, a pulse runs around the ring, and districts light up.
- **Nav labels.** BUS · LINES · LOAD · FLOW · TOMORROW · DISPATCH · FAULT · PROOF · SWITCHBOARD
- **Weaknesses.**
  - A stroked ring with nodes on its circumference and travelling pulses **is P01's identity**.
  - The LP is copper-plate. A network hero would emphasise physics the model does not compute, and the 14-bus case is not CAISO or ERCOT. That is an honesty failure as a hero.
  - The districts would be invented (SYNTHETIC).

### Scores (1 = poor, 5 = excellent)

| Criterion | A The Day Rose | B The Furnace | C The Switchboard |
|---|---|---|---|
| Fidelity to the reference language (one luminous form, statements, cards, stack, stepped settles, closing echo) | 5 | 4 | 3 |
| Analytical clarity (demand, net load, forecast, merit order, storage, scenarios all legible) | 5 | 2 | 2 |
| **Distinct from P01-P03** (and the planned P05-P10 forms) | 5 | 1 | 1 |
| Feasibility on static Pages (Lighthouse 90+, 60fps D / 30fps M, live LP) | 5 | 5 | 3 |
| Data honesty (area-true, sinks and residuals explicit, SIMULATED separated) | 5 | 2 | 1 |
| Mobile quality | 4 | 4 | 2 |
| Memorability | 5 | 3 | 4 |
| **Total (of 35)** | **34** | **21** | **16** |

**Why A gets 5 for distinctness.** Here is A checked against every owner, and against the evidence sheet `design/sketches/distinctness-sheet.png`:

1. **Not P01.** P01 is hairline strokes at constant radius with nodes and chords. The rose is hard-edged *filled* wedges whose outline changes radius every 15 degrees with the data. It has no circumference marks, no chords and no rotation. The time cursor is a lifted petal, not a dial step. P01's pulses travel along lines; ours is a radial rim beat inside wedges, plus (S07 only) whole branch segments energizing, never moving dots.
2. **Not P02.** P02 is a smooth blue-violet gradient glow that shrinks to a point. The rose is never smooth, never a gradient, never blue-dominant and never smaller than its giant crop in S00 or S08 (it never contracts to or grows from a point). Our blue is flat control surfaces, not data mass, and our orange never falls.
3. **Not P03.** P03 is a sphere of square cells with a limb. The rose is flat and radial with no sphere, cells, limb or camera push. The window city is a rectilinear facade elevation, not a globe or a map.
4. **Planned owners.** No concentric rings (P08, P09): band boundaries swing with solar every hour, and seams and spokes break any annulus. No sweep (P06): fills are radial, all petals at once. No dot field (P05), no limb arc (P07), no central branching orb (P10).

**Why A gets 4, not 5, for mobile.** The giant rose at M (r_peak 530px) is cropped on all four sides, so the solar fan and the night rim are both visible but the hour labels are not. The M S00 relies on the scrim headline and the corner label. That is solvable (3.3), but it is the main M risk.

### Selection: A, "The Day Rose", with two grafts

A is the only concept where the analytical object (an hourly stack that must equal demand) is itself the giant circular geometry, and where the signature motion (radial filling in merit order) *is* the dispatch logic.

- **From B, luminosity as a real channel.** The PRICE layer (S06, CTRL) replaces the stack with one binned fill per petal by SIMULATED shadow price. Luminance rises with price. This keeps B's "sun-like glow" as a labelled, binned encoding, not a decorative glow.
- **From C, the network, demoted and honest.** The IEEE 14-bus system appears once, in S07 answer 4 "Where are the wires?", as an illustrative card. Its branches energize as whole segments from bus 1 outward (no moving dots, no MW on any branch), with the caption that our dispatch is a single-node copper plate. This keeps the plan's "deep blue network with orange-red pulses" while never implying modelled power flow.

**Departure from MASTER_PLAN.** The plan's "dark city lighting up building by building" is kept, but as a **unit chart of OBSERVED demand** (S03a), not a picture of a place. The plan's "24-hour radial demand clock that the dispatch stack fills band by band" is kept exactly, as the Day Rose with **radial** band filling and **sky orientation** (noon at the top), so it is not a clock face.

---

## 3. Experience blueprint (phase 16)

### 3.1 Chapter-to-scene map

| Scene | Directive chapter | Nav label | Track | Kind |
|---|---|---|---|---|
| S00 Opening | The invisible machine (intro) | (none, overlay) | 0 (fixed overlay, 4.6s or less) | Timed intro, skippable |
| S01 Big Idea | No warehouse | PULSE | 200vh | Scrubbed blur reveal; the rose shrinks to true scale |
| S02 Origin of the Data | Where the numbers come from | SOURCE | 300vh | Story-card deck |
| S03a Mechanism I | A day of demand | DEMAND | 250vh | Scrubbed hour, 00 to 23; the window city |
| S03b Mechanism II | The sun bites the day | NET LOAD | 250vh | Scrubbed month, then 5 stepped years |
| S04 Transformation | Tomorrow, unrolled | FORECAST | 300vh | The rose opens into a week; 3 stepped models |
| S05 Experiment | Fill the day | DISPATCH | 300vh | Radial merit-order fill, then a live battery lab |
| S06 Consequences | Stress the machine | STRESS | 250vh | 5 stepped scenarios over the baseline ghost |
| S07 Evidence | How we know | EVIDENCE | 250vh | Argument card stack, 7 exchanges |
| CTRL | The control room | CONTROL ROOM | 100dvh minimum, **not pinned**, normal flow | Free live simulation |
| S08 Conclusion | The day closes (echoes S00) | (none; the nav keeps CONTROL ROOM active) | 200vh | The rose returns to giant, drains and re-blooms |

The total is about 2,300vh. If the QA scroll recording shows fatigue, cut S04 to 250vh first, then S02 to 250vh.

### 3.2 Global layout constants

- **Viewports:** D = 1440x900, T = 768x1024, M = 390x844.
- **Grid:**
  - D: 12 columns, 96px side margins, text column x 96-560.
  - T: 8 columns, 48px margins.
  - M: 4 columns, 16px margins.
- **Nav:** a bottom bar 12px from the bottom on D. On T/M, a 160x32 MENU pill at the bottom centre, plus SKIP INTRO / REPLAY at the bottom right.
- **Safe zone:** nothing interactive within 64px of the bottom on D, or 72px on T/M.
- **One Canvas2D layer** (fixed, viewport-sized, DPR-capped) draws the rose, the skyline and the unrolled week from parameters (centre, `R100`, unroll t, skyline rect). The DOM holds all text and controls. The S07 network is SVG inside its card.
- **Rose path.** Each band of each petal is one annular-sector path. Spokes are constant-width gaps: the edges are offset in parallel, as in d3's `padRadius` semantics. A Vitest check measures the gap at r = 40 and at r = 600 within 0.25px.
- **Bloom** (S00 and S08 only): an offscreen copy of the rose at quarter resolution, blurred 36px, drawn at 18% under the rose. It follows the petal silhouette, so it never reads as a disc.

### 3.3 Geometry states (exact)

`c` = rose centre in CSS px. `R100` = the radius of a 100,000 MW hour. A petal's tip is at `R100 × sqrt(MW / 100,000)`.

| State | D 1440x900 | T 768x1024 | M 390x844 | Notes |
|---|---|---|---|---|
| **G0 Giant** (S00, S01 start, S08 echo) | c (720, 400). The intro day's **peak petal r = 620** (diameter 138vh). `R100 = 620 / sqrt(peak / 100,000)` | c (384, 430), peak petal r 620 (121vh) | c (195, 360), peak petal r 530 (126vh) | Cropped at the top on all viewports and on all sides on M. Below the rose, a bottom scrim (D: black 0 to 90% over y 470-660, then 90%) carries the headline. **The peak petal's diameter is at least 1.2 × the frame height at every viewport** |
| G1 Aside (S01 end, S02 backdrop at 25%) | c (1030, 450), R100 380 | c (384, 700), R100 330 | c (195, 600), R100 230 | First state on the common 100 GW scale. The intro day (CISO spring, peak about 24 GW) shrinks to about r 186 on D: its true size |
| G2 City (S03a) | c (1040, 300), R100 300. Skyline x 96-1272, baseline y 812, window 9px, pitch 12, building gap 24 | c (384, 300), R100 260. Skyline x 52-716, baseline y 940, window 5, pitch 7, gap 12 | c (195, 215), R100 175. Skyline x 21-369, baseline y 700, window 3, pitch 4, gap 4 | Skyline per `design/window-city.json` (12 buildings of 80 windows; widths 4/5/8/10) |
| G3 Bite (S03b) | c (980, 450), R100 520 | c (384, 520), R100 380 | c (195, 400), R100 250 | Month-hour mean day (DERIVED) |
| L Week (S04) | Plot x 96-1344, y 260-700. Day width 178px. Height scale: 100,000 MW = 440px | x 48-720, y 380-760 | x 16-374, y 300-600. M shows **one day at a time** with a 7-square day picker | The unroll target |
| G4 Fill (S05) and G5 Stress (S06) | c (980, 450), R100 470 | c (384, 470), R100 360 | c (195, 330), R100 240 | Identical geometry, so S05 to S06 has no camera move: only data changes |
| G6 Control (CTRL) | c (560, 470), R100 400 | c (384, 400), R100 320 | c (195, 300), R100 220 | |
| W Wires (S07 answer 4) | Inside the answer card, 420x300 | 360x260 | 326x240 | SVG, `design/ieee14-layout.json` coordinates scaled to the card |

Between states, the centre interpolates linearly and `R100` interpolates in **log space**, so shrinking and growing feel even. These are camera moves on the whole rose: they never animate one petal's data.

### 3.4 Scenes

Each scene lists: track, compositions (D/T/M), data, insight, honesty tags, interactions, transition out, and states.

**Shared state UI** (every data-backed scene):

- **Initial:** the rose's demand outline (OBSERVED, white 1px, at 50%) if `demand_profile` or `dispatch_model` is loaded; otherwise nothing but the headline. Headings are sharp.
- **Loading:** the mono line `LOADING DISPATCH_MODEL · 42%`. The percentage is real (bytes read / Content-Length). With no length it reads `LOADING DISPATCH_MODEL` with no %.
- **Error:** `COULD NOT LOAD DISPATCH_RESULTS (HTTP 404)` plus a `RETRY` square button that re-runs the same fetch. Schema-guard failure reads `DISPATCH_RESULTS FAILED ITS CHECKS`, also with RETRY.
- **Empty:** scene-specific copy (below), never a blank canvas.
- **Ready:** normal render.
- **Disabled:** a control that cannot apply (for example HYDRO for a day with none) is `aria-disabled` and 50% white, with a tooltip giving the reason.
- **Reset:** scene-specific (below).

There are no spinners and no artificial delays.

#### S00 Opening: the invisible machine (overlay, 4.6s or less)

- **Composition.** Pure black. Timeline in MOTION_SYSTEM 5.1:
  1. The corner labels appear.
  2. The giant rose **outline** fades in at full G0 size.
  3. Bands fill radially in merit order, all 24 petals at once.
  4. The rim beats once.
  5. The scrim rises, the headline sharpens, and the nav enters.
- **The day.** One CISO day with a deep solar fan (DR-2 rule; the sketch uses 2024-04-14, peak 24,094 MW, OBSERVED). Bands follow the OBSERVED order.
- **Per viewport.**
  - **D:** the headline is left-aligned at x 96, 2 lines at 88px (y 650-820) over the bottom scrim. The rose is at 100%, never dimmed behind text, because the scrim does the contrast work.
  - **T:** 64px, 3 lines, at y 760-940.
  - **M:** 40px, 3 lines, at y 600-760 over a scrim from y 520. The rose is cropped on all four sides; the solar fan fills the upper frame.
- **Corner labels.** Top-left: the mono wordmark `PULSE ENERGY GRID` (13px). Top-right: `{{ba}} · {{date}} · PEAK {{peak}} MW`. As each band lands, a second line steps through the fuel names (`SUN`, `WIND`, ..., `GAS`). This is original, not the reference's spread wordmark.
- **Bottom-right chip:** `OBSERVED · EIA-930 · 1 PETAL = 1 HOUR`, with the note `AREA = MW · NOON AT TOP · CLEANEST AT THE CENTRE`.
- **LCP rule.** `h1[data-hero]` is in the DOM from first paint as ghost text (opacity 0.55, blur 12px), never at opacity 0.
- **Data:** DR-1 (observed generation by fuel for the reference days) and DR-2 (the intro day). The fallback is in States.
- **Insight.** Every hour is a stack of real sources that exactly meets demand. Some of it is free, and the rim is burned.
- **Interactions.**
  - SKIP INTRO is visible from 0ms. Esc, or any wheel, touch or key scroll, completes the intro in 350ms.
  - It plays once per session (`sessionStorage`, in try/catch). REPLAY INTRO is in the nav and in S08.
- **Transition to S01.** None: the S00 end state is the S01 start state.
- **States.**
  - If DR-1 is missing, S00 uses the April month-hour mean day from `fuel_mix.month_hour_mean_mw` and `demand_profile.month_hour_mean_mw`. The chip then reads `DERIVED · APRIL AVERAGE DAY, {{years}}`.
  - If both are missing by 1.2s, the outline is skipped, the headline sharpens alone, and the rose fades in (350ms) when data arrives.

#### S01 Big Idea: no warehouse (200vh)

| p | Change |
|---|---|
| 0-0.4 | Scrubbed. The headline scales from 88px to 44px and moves to y 96 (D). The rose moves **G0 to G1** (`R100` in log space; the first time it gets smaller, under the visitor's scroll), and the scrim fades out. The hour labels `00 06 12 18` fade in at the petal tips |
| 0.35-0.75 | Statement 2 blur-reveals: 64px in the left column (D), 48px (T), 36px (M) |
| 0.6-1 | Two notification cards type in |

- **Notification cards** (radius 8, padding 24; 13px mono header at 50%, 18px body):
  - **Card 1** (`#161616`): header `FROM: EIA-930 / CISO / {{facts.bas.CISO.peak_demand_local}}`, body `PEAK DEMAND {{facts.bas.CISO.peak_demand_mw}} MW. EVERY MEGAWATT WAS MADE OR IMPORTED IN THAT SAME HOUR.` Tag OBSERVED.
  - **Card 2** (`#192CE4` fill, white text): header `FROM: EIA-930 / ERCO / {{facts.bas.ERCO.peak_demand_local}}`, body `ERCOT PEAKED AT {{facts.bas.ERCO.peak_demand_mw}} MW, WITH NET INTERCHANGE AVERAGING {{facts.bas.ERCO.interchange_abs_mean_pct_of_demand}}% OF DEMAND.` (DR-9). Tag OBSERVED.
- **Placement.**
  - D: the cards sit at x 96-456, y 560-780, left of the rose and never over it.
  - T: full width minus 96, under the statement.
  - M: stacked above the rose, one-line bodies.
- **Data:** `facts.json`.
- **Insight.** No storage at scale means every hour is solved fresh. Two grids, two very different peaks.
- **Interactions.** Scroll only. Cards are not buttons.
- **Transition to S02.** The rose dims to 25% and holds at G1 as the deck's backdrop.
- **States.** If facts are missing, the cards do not render (no placeholder cards). If DR-9 is missing, card 2's second clause is dropped.

#### S02 Origin of the Data: the ledger (300vh)

- **Composition.** A horizontal story deck driven by vertical scroll (shared component).
  - D: cards 360x620, 8px gap, the active card centred at x 720.
  - T: cards 320x600, neighbours peeking 24px.
  - M: cards 300x560, neighbours peeking 12px.
- **Card anatomy:**
  - radius 8, padding 24
  - a chip (`SOURCE 0n · ...`)
  - a 4-segment progress bar
  - the serif title (40 / 32 / 28px)
  - a visual zone
  - a mono body (18 / 15 / 14px)
  - the tag at the bottom-left

| # | Fill | Visual zone | Data | Tag |
|---|---|---|---|---|
| 1 "One hour, one petal." | `#161616` | The intro day's 18:00 petal, drawn alone at 240px, with each band labelled by fuel and MW, and beside it the EIA-930 fields lighting in sequence: `BA · HOUR (UTC) · DEMAND · DAY-AHEAD FORECAST · NET GENERATION · INTERCHANGE · GENERATION BY FUEL ×8` | DR-1 day, `meta.sources` | OBSERVED |
| 2 "Two grids, two weathers." | `#192CE4`, white text | Two small roses at the same `R100` (the annual mean day of each BA: the mean of `demand_profile.month_hour_mean_mw` over months), with `SOLAR {{solar_share_pct}}% · WIND {{wind_share_pct}}% · GAS {{gas_share_pct}}%` under each | `fuel_mix`, `demand_profile`, `facts.bas.*` | DERIVED |
| 3 "Heat leans on the load." | `#161616` | `weather_relation.binned`: temperature bins as white 3px squares (mean) with a vertical P10-P90 tick each, a `#58B8E1` line for the fitted cooling slope above `cool_base_c`, and the readout `+{{pct_demand_per_c_above_base}}% DEMAND PER °C ABOVE {{cool_base_c}} °C (95% CI {{pct_ci}})`. Stations from `meta.bas[ba].stations` | `weather_relation`, `meta` | DERIVED |
| 4 "Every row is counted." | `#F2F2F2` fill, black text (the one light card) | The reconciliation ledger as mono rows per series: `SLOTS = RAW + MISSING`, `RAW = KEPT + NULL + FLAGGED`, each with a ✓ computed in the client, plus `DST DAYS {{n}}` | `reconciliation`, `quality`, `facts.global.*` | OBSERVED |

- **Footer** of card 4: `PIPELINE v{{meta.pipeline_version}} · GENERATED {{meta.generated_at}}`.
- **Insight.** What one hour is, that the two grids differ, that heat drives load, and that nothing was silently dropped.
- **Interactions.** The progress segments are a `role="tablist"`. Arrow keys jump to that card's band.
- **Transition to S03a.** The last card slides off left while the rose moves from G1 to G2 and brightens from 25% to 100% (scrubbed over the final 15%). The skyline rises from the bottom edge (unlit).
- **States.** A missing artifact shows `UNAVAILABLE` plus RETRY on its card only.

#### S03a Mechanism I: the city (250vh)

- **Composition.**
  - **D:**
    - Rose at G2, with the selected hour's petal lifted.
    - Skyline across the bottom (x 96-1272).
    - Left column x 96-560:
      - the serif statement (64px)
      - the mono kicker
      - a GRID segmented control: CISO / ERCO
      - a DAY control: the reference days of `dispatch_model.bas[ba].days` by `label`
    - **Readout** at y 290-470:
      - `{{hh}}:00` (mono 56px tabular)
      - `{{mw}} MW SERVED`
      - `{{lit}} OF 960 WINDOWS LIT`
      - `{{temp}} °C · POP.-WEIGHTED`
      - `{{±Δ}} MW SINCE {{hh−1}}:00`
    - The stack legend: the fuels centre-first with MW at this hour.
    - The chip.
  - **T:** statement and controls at the top (y 72-260), rose at G2-T, readout as a 2-column block (y 560-780), skyline at the bottom.
  - **M:**
    - Statement (32px) at the top.
    - Rose at G2-M.
    - Readout as 3 lines (y 420-520).
    - Skyline (y 620-700).
    - Controls in one bottom row above the MENU pill: `CISO|ERCO` and `DAY ▾` (opens upward).
- **Behaviour.**
  - Scroll p 0.06-0.94 maps to hours 00-23. **The displayed state is always an integer hour.** A change crossfades the lifted petal and window states over 200ms. No fractional-hour state is held.
  - **Windows light building by building:** `lit = round(demand_mw / 100)`. Buildings fill in `window-city.json` `lighting_order` (centre out), each completely, bottom row first, before the next starts.
- **Data:**
  - `dispatch_model.bas[ba].days[k]` (`demand_mw`, `temp_c`, `date`, `label`)
  - DR-1 (`observed_gen_mw` for the stack)
  - `facts.bas[ba].peak_demand_mw`
- **Insight.** Demand is a shape, not a number. It has a morning shoulder, a midday plateau and an evening climb, and the stack under it changes hour by hour.
- **Tags.**
  - Rose: OBSERVED.
  - Windows: DERIVED (`1 WINDOW = 100 MW OF OBSERVED DEMAND`).
  - Temperature: OBSERVED (NOAA ISD, population-weighted: DERIVED weighting, so the chip reads `OBSERVED · NOAA ISD · DERIVED WEIGHTS`).
- **Interactions** (visitor-set parameters, interaction 2):
  - **GRID:** 2 values. Switching keeps the hour and loads the first day of that BA.
  - **DAY:** the BA's reference days.
  - Arrow Left/Right on the focused rose step the hour by scrolling the track.
  - Click a petal: the Hour Inspector (interaction 9).
- **Stepped note** (p 0.80, at about 19:00): a 13px line, `TYPICAL EVENING RAMP IN {{ba}}: {{fuel_mix.bas[ba].evening_ramp.mean_mw_per_h}} MW PER HOUR ({{evening_ramp.definition}}).` Tagged DERIVED.
- **Transition to S03b.** p 0.94-1: the skyline sinks below the frame, and the rose moves G2 to G3 while morphing from this day to the month-hour mean day of the same month (a 600ms data transition when crossing 0.95).
- **States.**
  - **Empty:** if DR-1 is missing, the petals are demand outlines only, with the note `FUEL BREAKDOWN NOT PUBLISHED FOR THIS DAY` (the city still works).
  - **Reset:** a `RESET` text button when GRID or DAY differ from the defaults (CISO, first day).

#### S03b Mechanism II: the sun bites the day (250vh)

- **Composition.**
  - **D:** rose at G3 (c 980, 450, R100 520). Left column:
    - the statement (64px)
    - a **LAYER** control: DEMAND / NET LOAD
    - **GRID**
    - a month readout `{{MON}}` (mono 56px)
    - a **YEAR** row of 5 square chips (2021 to 2025; 2025 is marked `PARTIAL · {{months}} MONTHS`)
    - the **bite ledger:**
      - `MIDDAY NET LOAD MIN {{mw}} MW AT {{hh}}:00`
      - `EVENING NET LOAD MAX {{mw}} MW AT {{hh}}:00`
      - `RAMP {{mw}} MW IN {{h}} H`
  - **T:** statement and controls on top, rose below (c 384, 520).
  - **M:** statement at the top, rose at G3-M, ledger as 3 lines, and controls in a bottom row: `DEMAND|NET`, `CISO|ERCO`, `YEAR ▾`.
- **Behaviour.**

| p | What happens |
|---|---|
| 0.05-0.55 | Scrubbed **integer month**, January to December, of the month-hour mean day (all years). Petals change shape by 200ms crossfades between real months |
| 0.55 | Stepped: LAYER switches to **NET LOAD**. Each petal's solar and wind bands slide out of the stack (600ms). The petal shrinks to `demand − solar − wind`, and the removed area stays as a dotted `#FFC23D` / `#8FD9FF` outline. **The rose is visibly bitten at the top** (noon) in spring months |
| 0.62-0.92 | Stepped **years**, 2021 to 2025 (5 states, hysteresis ±0.02), at the month of the deepest bite (`facts` DR-9, else April). The bite deepens. The ledger tweens |
| 0.92-1 | Holds the latest year |

- **Data:** `demand_profile.month_hour_mean_mw`, `fuel_mix.month_hour_mean_mw` (SUN, WND), and DR-3 (by year).
- **Insight.** Solar has eaten the middle of California's day. The evening ramp that follows is the problem storage exists to solve.
- **Tags.** DERIVED (month-hour means of OBSERVED data). Net load is DERIVED.
- **Interactions** (interaction 3): LAYER, GRID, YEAR (chips), MONTH (scroll, or Arrow Up/Down on the focused rose). All are visitor-set.
- **Transition to S04.** p 0.96-1: the rose switches to the first day of the default test week (`forecast_samples.bas[ba].weeks[0]`, OBSERVED actual) as **hollow white petal outlines**, ready to unroll.
- **States.**
  - If DR-3 is missing, the YEAR row is `aria-disabled` with the tooltip `PER-YEAR PROFILES NOT PUBLISHED`, and the stepped-year phase holds the all-years mean (the copy changes to the all-years version).
  - **Reset:** returns to DEMAND, CISO, latest year.

#### S04 Transformation: tomorrow, unrolled (300vh)

- **Composition.**

| p | What happens |
|---|---|
| 0-0.08 | The hollow OBSERVED rose of the week's first day at G3 |
| 0.08-0.40 | **The unroll** (scrubbed, symmetric). The rose opens at midnight (the bottom) and each petal travels to a bar on the week axis: angle becomes x and area becomes height. Bars keep their hour key. The encoding label crossfades from `AREA = MW` to `HEIGHT = MW` at t 0.5. Day 1 occupies the first seventh of L |
| 0.40-0.52 | Days 2-7 arrive from the right as bars (keyed hours 24-167, 4ms stagger). The bar tops then connect into a **2px solid white line** (OBSERVED actual) as the bar bodies fade to 0 |
| 0.55 / 0.68 / 0.80 | **Three stepped states** (hysteresis ±0.02). (1) **Seasonal naive**, dotted, plus its MAPE. (2) **EIA day-ahead**, dashed, plus its MAPE. (3) **Our model**: P50 `#8FA2FF` line plus the P10-P90 hatch, with MAPE, MAE and the interval coverage `{{covered}} OF {{hours}} HOURS INSIDE THE BAND ({{pct}}% · NOMINAL {{nominal}}%)` |
| 0.86-1 | **The verdict** card (bottom-left) plus the **test calendar**: one 10px square per test day (`forecast_samples.daily_test`), `#8FA2FF` filled where our MAPE was lower than EIA's, a white 1px outline where EIA's was lower. Caption `OURS LOWER ON {{k}} OF {{n}} TEST DAYS` |

  - **D:** the week L, with the legend above it as a direct mono row (`ACTUAL ━ · EIA DAY-AHEAD ╌ · SEASONAL NAIVE ┈ · OURS P50 ━ / P10-P90 ▨`). Controls top-right: GRID, WEEK (the 3 `weeks[].label`, with `reason` as the tooltip), INTERVAL RAW / CONFORMAL, and MODEL visibility toggles. The verdict card is at x 96-560, y 720-820.
  - **T:** L-T, with controls as chip rows above it.
  - **M:** the unroll targets **one day** (24 bars), and a 7-square day picker under it steps days. Controls are in a bottom sheet.
- **Data:**
  - `forecast_samples.bas[ba].weeks[]` (`actual_mw`, `eia_mw`, `naive_mw`, `gbm_mw`, `gbm_p10_mw`, `gbm_p90_mw`, `ts_local`, `label`, `reason`)
  - `forecast_eval.bas[ba].models.*` (`mape_pct`, `mae_mw`, `mape_peak5_pct`)
  - `forecast_eval.bas[ba].intervals.gbm` (`raw_coverage_pct`, `cqr_coverage_pct`, `nominal_pct`)
  - `forecast_eval.bas[ba].comparison_vs_eia` (`beats_eia`, `mape_diff_pp`, `mape_diff_ci95`, `statement`)
  - `forecast_eval.bas[ba].comparisons[]` (`model`, `baseline`, `mape_diff_pp`, `ci95`, `significant`, `statement`). This was in the data agent's working tree, uncommitted, at handoff. The verdict uses the row where `model = best_model` and `baseline = eia_day_ahead`
  - DR-8 (CQR band arrays and the best model's samples)
- **MODEL toggles** list every id in `forecast_eval.models` except `gbm_perfect_weather` (S07 only). That includes `eia_debiased` if published (working tree), drawn as a white 1px dash-dot line labelled `EIA, BIAS-CORRECTED (PREDICTED)`.
- **Week-level numbers** (MAPE in this week, hours covered) are computed in the client from the sample arrays and labelled `THIS WEEK`. Test-period numbers come from `forecast_eval` and are labelled `WHOLE TEST PERIOD ({{n_test}} H)`. The two are never mixed.
- **Insight.** Tomorrow's demand is predictable to within a few percent, and we say exactly how often our band is wrong. Whether we beat the BA is a measured result, either way.
- **Tags.** Actual: OBSERVED. All three forecasts: PREDICTED (the EIA one `PUBLISHED BY THE BA`). Calendar and verdict: DERIVED.
- **Interactions** (interaction 5): GRID, WEEK, INTERVAL, MODEL toggles, and hover/tap on the week for a crosshair readout of all series at that hour.
- **Transition to S05.** p 0.94-1: the line re-forms bars for the day matching S05's default reference day if it is in the week; otherwise the line fades and the rose for that day **re-rolls** from bars (the unroll in reverse) into G4 as a hollow demand outline.
- **States.**
  - **Empty:** a week with missing actual hours draws **gaps** (the line is broken, never joined), with the note `{{n}} HOURS WITHOUT A CLEAN ACTUAL (EXCLUDED FROM METRICS)`.
  - If DR-8 is missing, INTERVAL is disabled at the published variant, with a tooltip naming it.
  - **Reset:** default week, all models, CONFORMAL.

#### S05 Experiment: fill the day (300vh), the signature

- **Composition.**
  - **D:** rose at G4 (c 980, 450). Left column x 96-560:
    - the statement (64px, swaps once)
    - the **dispatch ledger:** one row per class in display order: swatch, label, `{{MWh}} MWH`, `MODEL ${{cost}}`
    - the total `MODEL COST ${{objective}} = SOLVER OBJECTIVE ✓`
    - `CO2 {{t}} T`
    - the SoC trace: 25 points, x 96-460, y 760-820, a 1.5px `#9B5CFF` line between dotted `soc_min` and capacity guides
  - **T:** rose on top, ledger in 2 columns below.
  - **M:** rose at G4-M, a 3-line ledger summary (cost, CO2, battery MWh shifted), and the full ledger in a bottom sheet.

| p | What happens |
|---|---|
| 0-0.08 | Hollow demand outline of the reference day (OBSERVED), chip OBSERVED |
| 0.08-0.60 | **The fill** (scrubbed, symmetric). Classes enter **radially, in display order, all 24 petals at once**, each over an equal share of p. Each band grows from its inner radius to its outer radius in `r²`. Its ledger row fades in with its MWh tweening. The chip switches to SIMULATED when the first dispatched class appears. Charging caps and curtailment outlines appear with their class |
| 0.60 | Stepped: **the rim beat.** Each petal's outermost dispatched band (the price-setting class, DR-4 `marginal_class`) brightens and settles once (600ms) |
| 0.62-0.70 | Scrubbed: the SoC trace draws. Statement 2 replaces statement 1 |
| 0.70-1 | **The lab is live.** `BATTERY POWER` (MW) and `BATTERY HOURS` sliders (DR-6 ranges), plus `RENEWABLES ×`. Every change re-solves (CTRL machinery). The rose re-fills from the first changed band outward (the pulse). The ledger tweens, and `Δ VS BASELINE` lines appear: `EVENING GAS 17-22H {{±}} MWH`, `CURTAILED {{±}} MWH`, `COST {{±}}`, `CO2 {{±}}` |

- **Data:**
  - `dispatch_model.bas[ba]` (`classes`, `battery`, `days`, `display_order` DR-5)
  - `dispatch_results.bas[ba].days[day].baseline`
  - `dispatch_test_vectors` (the parity badge)
  - the worker solver (MOTION_SYSTEM 9.1)
- **Insight.** The cheapest power goes in first, and the rim is what is left to burn. A battery moves midday sun into the evening and visibly **thins the rim**.
- **Tags.** The outline is OBSERVED. Everything filled is SIMULATED (`MODEL` prefixes, the attached chip). Live results show `SOLVED IN BROWSER · HiGHS`, and presets show `PRECOMPUTED · PYTHON HiGHS`.
- **Interactions** (interaction 6): the three sliders, DAY, GRID, and a petal click (the Hour Inspector).
- **Transition to S06.** None in geometry (G4 = G5). The sliders reset to baseline (600ms data transition), and the baseline demand outline becomes the dashed ghost.
- **States.**
  - **Solver loading:** sliders are enabled but snap to **preset values only** (`baseline`, `battery_big`) using `dispatch_results`, with the line `LIVE SOLVER LOADING · {{pct}}%`.
  - **Solver error:** `LIVE SOLVER UNAVAILABLE: SHOWING PRECOMPUTED PYTHON RESULTS` plus RETRY.
  - **Reset:** baseline values.

#### S06 Consequences: stress the machine (250vh, 5 stepped scenarios)

- **Composition.** Rose at G5 (= G4). The **baseline ghost** is each petal's baseline demand arc as a 1px dashed white line (4/3) at 60%, and the scenario is filled.
  - **D:** left column with the scenario title (serif 44px, from `scenarios[].label`), the description (mono 18px, `scenarios[].description`) and the **scenario ledger**. Each row reads `BASELINE → SCENARIO (Δ)`:
    - cost
    - CO2
    - unserved MWh
    - curtailed MWh
    - max price
    - renewable share

    Controls top-right: GRID, DAY, LAYER STACK / PRICE.
  - **T:** controls as a chip row, ledger in 2 columns.
  - **M:** the scenario title and 3 ledger lines under the rose. A 5-square scenario stepper sits above the MENU pill.

| p | Scenario (`scenarios[].id`) | What the rose shows |
|---|---|---|
| 0.10 | `renewables_up` | The solar fan swells. Midday petals overrun demand, so curtailment outlines appear, and the evening rim thins slightly |
| 0.28 | `demand_growth` | Every petal grows past its ghost. The rim thickens, and the price layer brightens in the evening |
| 0.46 | `battery_big` | A thick violet discharge band in the evening. The charging cap grows at midday. The rim thins |
| 0.64 | `heat_wave` | Hot hours (the dusk side) swell past the ghost. The rim widens, and unserved hatch appears if the data says so |
| 0.82 | `outage` | One class's band vanishes (its colour leaves the legend with the reason `OFFLINE IN THIS SCENARIO`). Peakers or unserved fill the gap |

  - Steps are 1.2s smooth settles of the data (keyed bands), never camera moves. Within a step, GRID, DAY and LAYER are live.
- **Data:** `dispatch_results.bas[ba].days[day][scenario]`, `dispatch_model.scenarios`.
- **Insight.** The machine bends in predictable ways. Heat and outages cost the most, and storage and renewables trade cost for curtailment.
- **Tags.** SIMULATED throughout. The ghost is SIMULATED baseline (demand arc only: OBSERVED demand, plus the scenario's own adjustments).
- **Interactions** (interaction 7): GRID, DAY, LAYER, the stepper (keyboard: the 5 squares are a `tablist`), and petal click.
- **Transition to S07.** The rose dims to 15% and moves to G1 behind the argument stack.
- **States.**
  - **Empty:** a scenario with no change in some petals shows no ghost difference (that is honest).
  - **Missing scenario:** `SCENARIO NOT PUBLISHED FOR THIS DAY` with that step skipped.

#### S07 Evidence: how we know (250vh, 7 stepped exchanges)

The argument stack (shared component, P01/P03 grammar): a grey objection card, then an orange answer card with a mini-visual. Older cards recede by palette and scale.

| # | Objection (`#292929`) | Answer (orange `#FF4C25` card, black text) | Mini-visual | Tag |
|---|---|---|---|---|
| 1 | "ISN'T YOUR FORECAST JUST EIA'S?" | Two branches by `comparison_vs_eia.beats_eia` (5 S07). The MAPE difference with its 95% bootstrap CI | A CI bar with 0 marked (white tick) | DERIVED |
| 2 | "DO YOUR INTERVALS MEAN ANYTHING?" | Raw versus conformal coverage against nominal, counted in hours | Three horizontal bars (raw, CQR, nominal) | DERIVED |
| 3 | "DID YOU PEEK AT THE WEATHER?" | Features are known at forecast time. The perfect-weather variant is an upper bound | MAPE: ours versus `gbm_perfect_weather`, labelled `UPPER BOUND · NOT AVAILABLE AT FORECAST TIME` | PREDICTED |
| 4 | "WHERE ARE THE WIRES?" | Our dispatch treats each grid as one copper plate. Real networks have limits. **The Wires** card: the IEEE 14-bus test system, illustrative | Interaction 10 (SVG) | artifact tag + ILLUSTRATIVE |
| 5 | "ARE THESE REAL COSTS?" | No: assumed heat rates, fuel prices, wear and VOLL, listed with their basis | The `dispatch_model.assumptions` table (id, value, unit, basis) | SIMULATED |
| 6 | "DOES YOUR BROWSER REALLY SOLVE IT?" | The same LP text, the same solver, and parity vectors checked on this build | `{{passed}} / {{n}} VECTORS ✓ · TOLERANCE {{tolerance_rel}}` plus the `reference_lp` objective | SIMULATED |
| 7 | "IS EVERY HOUR ACCOUNTED FOR?" | Raw rows equal kept plus excluded, per series | The S02 card 4 ledger, condensed | OBSERVED |

- **Per viewport.** D: the objection is offset left and the answer offset (+24, +16). M shows only the latest exchange, with older ones collapsed to slivers.
- **The Wires** (answer 4):
  - 14 buses as 14px `#192CE4` squares, with white bus-id labels inside on D and outside on M.
  - 20 branches as 1px `#5B6BFF` lines at 60%.
  - The 5 generator buses carry a small white `G`.
  - When the card enters: **energization by graph distance from bus 1.** Each branch thickens to 3px, flashes `#FF4C25` for 200ms, then settles to 2px `#5B6BFF`, in BFS order with a 90ms stagger per hop. Each load bus fills white when reached. **No dot moves along any branch, and no MW, arrow or flow number appears.**
  - Caption: `IEEE 14-BUS TEST SYSTEM · pglib-opf v23.07 · CC BY 4.0 · ILLUSTRATIVE: NOT THE CAISO OR ERCOT NETWORK. OUR DISPATCH IGNORES NETWORK LIMITS.`
- **Data:** `forecast_eval`, `dispatch_model.assumptions`, `dispatch_test_vectors`, `reference_lp`, `reconciliation`, `grid_topology` plus `design/ieee14-layout.json`.
- **States.** A missing artifact drops that exchange's mini-visual and shows `UNAVAILABLE` in its place.

#### CTRL: The Control Room (100dvh minimum, normal flow, not pinned)

- **Composition (D).**
  - **Top-left:** `THE CONTROL ROOM` (mono 13px), the serif 44px line "Run tomorrow yourself.", and the **solver status line**:
    - `SOLVED IN BROWSER · HiGHS {{version}} · {{ms}} MS · PARITY ✓ {{passed}}/{{n}}`
    - or `PRECOMPUTED · PYTHON HiGHS` (preset, solver not ready)
    - or `LOADING SOLVER · {{pct}}%`
    - or `SOLVER ERROR · RETRY`
  - **The rose** at G6 (c 560, 470). Click a petal for the Hour Inspector.
  - **Control rail** (x 1000-1344, square mono controls in `--surface-glass` with blur 16; active parameter blocks are **`#192CE4` with white text**):
    - GRID: CISO / ERCO
    - DAY: the reference days
    - PRESETS: the 6 scenario chips. A preset sets the sliders to the scenario's params
    - RENEWABLES ×
    - DEMAND +%
    - HEAT WAVE +°C
    - BATTERY MW
    - BATTERY HOURS
    - OUTAGE: NONE, or one dispatchable class
    - LAYER: STACK / PRICE
    - RESET
    - All ranges, steps and defaults come from DR-6, never from this document.
  - **Ledger** under the rail: cost (with `= SOLVER OBJECTIVE ✓`), CO2, unserved MWh, curtailed MWh, renewable share, max price, each with `Δ VS BASELINE`. Each Δ is computed against `dispatch_results` baseline for the same GRID and DAY.
  - **Bottom-left:** the SoC trace (as S05) and the price legend when LAYER = PRICE.
  - **Hour Inspector** (story-card anatomy, 360x520), entering from the right on a petal click:
    - chip `HOUR {{hh}}:00 · {{ba}} · {{date}}`
    - the serif title `{{hh}}:00`
    - the stack list with MW
    - `PRICE ${{p}}/MWH (SHADOW, MODEL)`
    - `SET BY {{marginal_class}}`
    - `SOC {{start}} → {{end}} MWH`
    - curtailed and unserved MW
    - the tag row
- **T.** The rose is on top (c 384, 400). The rail becomes horizontal scrollable chip rows plus a slider block under the rose. The inspector is a bottom sheet (50%).
- **M.**
  - Rose at G6-M.
  - Ledger as 3 lines (cost, CO2, unserved).
  - A single `CONTROLS` square opens a bottom sheet with every control in 44px rows. **Sliders solve on release** on M (on input, with coalescing, on D/T).
  - The inspector is a bottom sheet (peek 160 / full 80%).
  - Slider tracks set `touch-action: pan-y`, so vertical page scroll is never captured.
- **Cross-filter contract.**
  - One store holds `{ba, dayId, params, layer, hour, result, baseline, solver: {state, version, ms}, parity}`.
  - The rose, ledger, SoC trace, inspector and status line all derive from it through pure selectors.
  - **The ledger cost equals `result.objective_usd`, and `Σ cost_breakdown_usd` equals it to 1e-6 relative** (Vitest on every result, live or preset).
  - SoC stays within `[soc_min_frac × E, E]` (Vitest).
  - For preset params, the live result equals `dispatch_results` within the `dispatch_test_vectors` tolerances (Playwright).
- **Data:** `dispatch_model`, `dispatch_results`, `dispatch_test_vectors`, and the solver.
- **Insight.** The visitor's own question, answered by the same LP the pipeline solves.
- **States.**
  - **Loading:** per artifact, plus the solver line.
  - **Error:** per artifact RETRY. A solver error keeps the last good result on screen with the status `SOLVER ERROR: SHOWING LAST RESULT` plus RETRY.
  - **Disabled:** OUTAGE options exclude classes with zero capacity that day. HEAT WAVE is disabled with a tooltip if `heat_wave` coefficients are absent.
  - **Empty:** none possible: the LP has an unserved variable at VOLL, so every input is feasible. A non-optimal solver status is an error, not an empty state.
  - **Reset:** `RESET` returns the store to CISO, the first day, baseline params, STACK, no hour.

#### S08 Conclusion: the day closes (200vh)

| p | What happens |
|---|---|
| 0-0.35 | Scrubbed. The CTRL rose (the visitor's last result, or the S00 day if CTRL was never touched) moves to the centre and grows in log space to **G0**. The scrim rises |
| 0.35-0.65 | A serif paragraph blur-reveals over the bottom scrim (D 44px at x 96-900, y 620-800; T 36px; M 28px) |
| 0.70 | **The echo** (stepped, once per down-crossing). The S00 corner labels reappear. The rose **drains band by band from the rim inward** (150ms per band), then **re-fills band by band from the centre outward** in the S00 order and cadence, at constant G0 size. The rim beats once. The caption then appears: `{{date}} · {{ba}} · {{served}} MWH SERVED · {{tag}}` |
| 0.80-1 | Links fade in: `→ OPEN THE CONTROL ROOM`, `→ REPLAY THE INTRO`, `→ READ THE METHODOLOGY`, `→ SOURCE CODE` |

- **The echo is the opening's own choreography:** the same giant rose, the same corner labels and the same radial fill. It is never a glow that regrows (P02), never a push into a surface (P03) and never a rising horizon arc (P01). The rose never shrinks below G0 during S08.
- **Tags.** If CTRL was untouched, the S00 OBSERVED day and chip. Otherwise the visitor's result with `SIMULATED · YOUR SCENARIO`.
- **Footer** (12px mono, 50% white): `Source: U.S. Energy Information Administration (EIA-930, retrieved {{meta.generated_at}})`, NOAA ISD, the pglib-opf CC BY 4.0 credit, and the author.
- **States.** If the solver result is gone (a reload), the S00 day is used.

---

## 4. Signature interactions

There are eleven interactions. Six are driven by visitor-set analytical parameters (marked P).

| # | Name | Category | P |
|---|---|---|---|
| 1 | The Bloom | Cinematic intro transformation | |
| 2 | Window City | Scroll-driven hour scene | P |
| 3 | The Bite | Scroll-driven month/year scene | P |
| 4 | Ledger Deck | Animated story-card sequence | |
| 5 | Tomorrow, Unrolled | Major data-driven visual transformation | P |
| 6 | Fill the Day | The signature: radial merit-order fill plus a live battery lab | P |
| 7 | Stress Lab | Scenario comparison against a ghost | P |
| 8 | The Control Room | The live in-browser LP simulator | P |
| 9 | Hour Inspector | Contextual inspection (S03a, S05, S06, CTRL) | |
| 10 | The Wires | Illustrative network energization (S07) | |
| 11 | The Day Closes | Memorable closing | |

### 1. The Bloom (S00)

- **Inputs:** time, plus Skip, Esc and any scroll.
- **State:** `intro: 'playing' | 'done'`, `t` in ms.
- **Permitted values:** t 0..4600.
- **Data:** DR-1 and DR-2 (the intro day), `facts`.
- **Visual output:** the giant outline, then 6-9 bands filling radially, then the rim beat, scrim and headline.
- **Keyboard:** Esc, or Enter on SKIP, finishes. Focus starts on SKIP INTRO.
- **Mobile:** a tap on SKIP, or any touch-scroll, completes it in 350ms.
- **Reduced motion:** the end state at once.
- **Text alternative:** a visually hidden paragraph: "Animated introduction: one day of California's grid drawn as 24 petals, one per hour, noon at the top. Each petal's area is the electricity used in that hour. It fills from the centre with solar, wind, nuclear, hydro, imports and other sources, and gas burns at the rim."
- **Test:**
  - SKIP is visible at 100ms, and the nav appears within 400ms of the click.
  - The LCP element is `h1[data-hero]`.
  - A debug hook reports the peak petal radius at or above the G0 value from the first outline frame on, and never decreasing during S00.

### 2. Window City (S03a) [P]

- **Inputs:** scroll progress, GRID, DAY, petal click.
- **State:** `{hour 0..23 (integer), ba, dayId}`.
- **Permitted values:** hour 0-23; BA 2; the day list from `dispatch_model.bas[ba].days`.
- **Data:** `dispatch_model.days`, DR-1, `facts`.
- **Visual output:** the lifted petal, `round(MW/100)` windows lit building by building, and the readout.
- **Keyboard:** the segmented controls are radio groups. Left/Right on the focused rose step the hour.
- **Mobile:** a bottom control row; the day list opens upward.
- **Reduced motion:** the track becomes normal flow with 4 static frames (03:00, 09:00, 15:00, 19:00): a row on D, 2x2 on T, stacked on M. The controls redraw all 4.
- **Test:**
  - Vitest: the lit count equals `round(demand/100)`, and buildings fill in `lighting_order`, each to 80 before the next starts.
  - Playwright: scrubbing to p 0.5 shows an integer hour whose readout MW equals `demand_mw[hour]`.

### 3. The Bite (S03b) [P]

- **Inputs:** scroll progress (month, then year steps), LAYER, GRID, YEAR chips.
- **State:** `{month 1..12, year | 'all', layer, ba}`.
- **Data:** `demand_profile`, `fuel_mix`, DR-3.
- **Visual output:** month-shape crossfades, net-load carving with dotted removed areas, and the bite ledger.
- **Keyboard:** Up/Down on the focused rose step the month. The YEAR chips are a radio group.
- **Reduced motion:** a static row of 4 roses (Jan, Apr, Jul, Oct) in NET LOAD, plus the year chips live on a fifth.
- **Test:** Vitest: the ledger's midday minimum and evening maximum equal those computed from the arrays at the stated hours, and net load equals demand minus SUN minus WND per hour.

### 4. Ledger Deck (S02)

- **Inputs:** scroll, plus tablist keys.
- **State:** active card 0..3.
- **Visual output:** the card row translation, the active progress segment and the card visuals.
- **Reduced motion:** 4 cards stacked vertically.
- **Test:** each ledger ✓ is recomputed from `reconciliation` and fails visibly (✗ in `--state-error`) if the identity does not hold.

### 5. Tomorrow, Unrolled (S04) [P]

- **Inputs:** scroll (the unroll and the 3 steps), GRID, WEEK, INTERVAL, MODEL toggles, pointer or tap on the week.
- **State:** `{ba, weekIdx 0..2, interval: 'raw' | 'cqr', visible: Set<model>, hoverHour | null}`.
- **Data:** `forecast_samples`, `forecast_eval`, DR-8.
- **Visual output:** the radial-to-linear morph (keyed hours), the series in the honesty grammar, the readouts and the test calendar.
- **Keyboard:** Left/Right move the crosshair hour on the focused plot.
- **Mobile:** one day at a time with a 7-square picker; controls in a sheet.
- **Reduced motion:** the end state (the week, all series, the calendar) with no unroll. A static 3-frame strip shows the unroll (rose, half-open, line).
- **Text alternative:** a data table of the week (actual, EIA, naive, P50, P10, P90 per hour), reachable by `→ DATA TABLE FOR THIS WEEK`.
- **Test:**
  - Debug hook: at unroll t = 0, 3 bar vertices are within 1px of their polar positions; at t = 1, within 1px of their linear positions.
  - The covered-hours count equals the count of `p10 ≤ actual ≤ p90` on non-null hours.

### 6. Fill the Day (S05) [P]

- **Inputs:** scroll (the fill), BATTERY POWER, BATTERY HOURS, RENEWABLES ×, DAY, GRID.
- **State:** `{params, result, fillProgress}`.
- **Data:** `dispatch_model`, `dispatch_results`, the solver.
- **Visual output:** radial band fill in display order, the rim beat, the SoC trace, and the live re-solve pulse with Δ lines.
- **Keyboard:** sliders are native `input[type=range]` with `aria-valuetext` (`600 MW`), and arrow keys step by the DR-6 step.
- **Mobile:** solve on release.
- **Reduced motion:** the filled rose at once, with instant updates.
- **Test:**
  - The cost equals the objective (Vitest).
  - At p 0.34, the drawn band set equals the first k classes of `display_order` (debug hook).
  - No fill frame has a petal whose band set differs from another petal's (the fill is radial, not angular).

### 7. Stress Lab (S06) [P]

- **Inputs:** scroll steps, the stepper, GRID, DAY, LAYER.
- **State:** `{scenarioIdx 0..4, ba, dayId, layer}`.
- **Data:** `dispatch_results`, `dispatch_model.scenarios`.
- **Visual output:** the scenario rose over the dashed baseline ghost, and the ledger with Δ.
- **Reduced motion:** a vertical list of 5 roses with ledgers.
- **Test:** every ledger number equals the artifact value for that `(ba, day, scenario)`, and the Δ equals scenario minus baseline.

### 8. The Control Room (CTRL) [P]

- **Inputs:** all CTRL controls, petal click, RESET.
- **State:** the store in 3.4 CTRL.
- **Permitted values:** DR-6 ranges only. Out-of-range values are impossible (native min/max/step).
- **Data:** `dispatch_model`, `dispatch_results`, `dispatch_test_vectors`, the solver.
- **Visual output:** the live rose, ledger, SoC trace, status line, price layer and inspector.
- **Keyboard:** full tab order (rail top to bottom, then the rose). Enter on a focused petal opens the inspector, and Esc closes it.
- **Mobile:** a bottom sheet; solve on release.
- **Reduced motion:** fully functional with instant updates.
- **Test:**
  - Playwright: for every preset, the live objective equals `dispatch_results` within tolerance.
  - The CPLEX LP text built for `reference_lp` is byte-identical to `reference_lp.cplex_lp` (Vitest, in Node with the same builder).
  - RESET restores the defaults.
  - A forced worker failure shows the error state and keeps the last result.

### 9. Hour Inspector (S03a, S05, S06, CTRL)

- **Inputs:** petal click or Enter.
- **State:** `hour | null`.
- **Visual output:** a story-card inspector (D right, T/M bottom sheet) listing the stack, price, marginal class, SoC and curtailment (SIMULATED scenes), or the observed stack and temperature (S03a).
- **Keyboard:** focus moves into the card, and Esc returns focus to the petal.
- **Test:** the listed MW sum (positive bands minus sinks) equals the demand served within 0.5 MW.

### 10. The Wires (S07)

- **Inputs:** the exchange entering view.
- **Visual output:** BFS energization from bus 1 by whole segments; buses fill.
- **Reduced motion:** the energized end state.
- **Text alternative:** "An illustrative 14-bus test network. Lines light up outward from bus 1 to show the idea of a network. Our dispatch model does not use it."
- **Test:**
  - The SVG contains no `<text>` with a number followed by MW, and no element animates along a path (no `offset-path`, no `animateMotion`).
  - Every bus and branch in `grid_topology.json` has a layout coordinate (Vitest).

### 11. The Day Closes (S08)

- **Inputs:** scroll.
- **Visual output:** the return to G0, the paragraph, the drain and re-bloom, the caption and the links.
- **Reduced motion:** the static giant rose with the caption and links.
- **Test:**
  - At S08 p 0.75, the debug hook reports a peak petal radius at or above G0 and the band order identical to S00.
  - The QA contact sheet compares the S00 and S08 frames.

---

## 5. Copy deck

Rules:
- Serif statements in sentence case.
- Mono copy in uppercase.
- Every number comes from section 6.
- No U+2014 or U+2015 dashes.
- "Model", "simulated" or "predicted" appears next to any non-observed number.

### S00
- H1: "The invisible machine that powers everything."
- Hidden alternative: see interaction 1.

### S01
- Statement: "A grid keeps no stock. Every hour, supply has to meet demand exactly."
- Cards: section 3.4 S01.

### S02
- Kicker: `SOURCE · WHERE EVERY NUMBER COMES FROM`
- Card 1: "One hour, one petal." / `EIA-930 REPORTS, FOR EVERY HOUR AND EVERY BALANCING AUTHORITY, HOW MUCH POWER WAS USED, WHAT THE OPERATOR EXPECTED, AND WHAT EACH FUEL MADE.`
- Card 2: "Two grids, two weathers." / `CALIFORNIA RUNS ON SUN AND IMPORTS. TEXAS RUNS ON GAS AND WIND AND BARELY TRADES WITH ITS NEIGHBOURS.` The "barely trades" clause needs DR-9.
- Card 3: "Heat leans on the load." / `ABOVE {{cool_base_c}} °C, EVERY EXTRA DEGREE ADDS ABOUT {{pct}}% TO DEMAND. AN ASSOCIATION FITTED ON {{n}} HOURS, NOT A FORECAST.`
- Card 4: "Every row is counted." / `RAW ROWS = KEPT + EXCLUDED, FOR EVERY SERIES. NOTHING IS SILENTLY DROPPED.`

### S03a
- Statement: "Every window is a hundred megawatts."
- Kicker: `DEMAND · {{BA}} · ONE REAL DAY, HOUR BY HOUR`
- Note: `BUILDINGS ARE GROUPS OF 80 WINDOWS (8,000 MW), NOT PLACES.`

### S03b
- Statement (DEMAND): "Every month draws a different day."
- Statement (NET LOAD): "The sun takes a bite out of noon."
- Year caption: `{{year}}: MIDDAY NET LOAD FELL TO {{mw}} MW IN {{MON}}.` Partial years add `PARTIAL YEAR`.

### S04
- Statement: "Tomorrow, unrolled."
- Verdict, when `beats_eia` is true: "Our model beat the operator's own forecast." / `MAPE {{ours}}% VS {{eia}}% OVER {{n}} TEST HOURS. DIFFERENCE {{mape_diff_pp}} PP (95% CI {{lo}} TO {{hi}}).`
- Verdict, when `beats_eia` is false: "The operator's own forecast is still better." / `MAPE {{ours}}% VS {{eia}}% OVER {{n}} TEST HOURS. WE SAY SO.`
- The verdict's mono line must match `comparison_vs_eia.statement` in substance. If the matching `comparisons[]` row has `significant: false` (its 95% CI crosses 0), the serif line becomes "No clear winner over the operator's forecast." regardless of `beats_eia` (Vitest, all three branches).

### S05
- Statement 1: "The cheapest power goes first."
- Statement 2: "A battery moves noon into the evening."
- Ledger footer: `MODEL OF {{n}} GENERATOR CLASSES. COSTS ARE ASSUMPTIONS, NOT MARKET PRICES.`

### S06
- Kicker: `STRESS · FIVE WAYS TO PUSH THE MACHINE`
- Titles and descriptions come from `dispatch_model.scenarios[].label` and `.description`.

### S07 Evidence (objection, then answer)

| # | Objection | Answer (first line) |
|---|---|---|
| 1 | ISN'T YOUR FORECAST JUST EIA'S? | Per `beats_eia` (as S04) |
| 2 | DO YOUR INTERVALS MEAN ANYTHING? | `THE RAW BAND HELD {{raw}}% OF HOURS; CALIBRATED, {{cqr}}%. WE PROMISED {{nominal}}%.` |
| 3 | DID YOU PEEK AT THE WEATHER? | `NO. EVERY FEATURE IS KNOWN AT FORECAST TIME. A VERSION THAT CHEATS WITH TOMORROW'S REAL WEATHER SCORES {{mape}}%: AN UPPER BOUND, NOT A MODEL.` |
| 4 | WHERE ARE THE WIRES? | `NOT IN OUR MODEL. EACH GRID IS TREATED AS ONE COPPER PLATE. THIS IS WHAT A NETWORK LOOKS LIKE: A 14-BUS TEST SYSTEM, NOT CALIFORNIA OR TEXAS.` |
| 5 | ARE THESE REAL COSTS? | `NO. THEY ARE STATED ASSUMPTIONS. CHANGE THEM AND THE ANSWER CHANGES.` |
| 6 | DOES YOUR BROWSER REALLY SOLVE IT? | `YES. SAME LP, SAME SOLVER. {{passed}} OF {{n}} TEST VECTORS MATCH THE PYTHON RESULT ON THIS BUILD.` |
| 7 | IS EVERY HOUR ACCOUNTED FOR? | `{{raw_rows_total}} ROWS IN, {{kept_rows_total}} KEPT, {{flagged_rows_total}} FLAGGED. EVERY ONE COUNTED.` |

### CTRL
- Line: "Run tomorrow yourself."
- Note under the rail: `A SINGLE-NODE, 24-HOUR LINEAR PROGRAM. NO NETWORK LIMITS, NO START-UP DECISIONS, NO RESERVES. SEE LIMITATIONS.`

### S08
- Paragraph: "Tonight it will happen again: twenty-four times, someone will decide what to burn so the lights stay on. The cheapest answer is known in milliseconds. The cleanest one is a choice."
- Links: section 3.4 S08.

---

## 6. Placeholder bindings and data requests

### 6.1 Bindings

EXISTS means the value is in a contracted artifact today. DR means a data request is needed.

| Placeholder | Source | Status |
|---|---|---|
| Peaks, means, shares, ramp, slope, test metrics, dispatch baseline cost | `facts.bas[ba].{peak_demand_mw, peak_demand_local, mean_demand_mw, min_demand_mw, solar_share_pct, wind_share_pct, gas_share_pct, clean_share_pct, evening_ramp_mw_per_h, demand_temp_slope_pct_per_c, test_mape, test_mae_mw, skill_vs_eia_pct, beats_eia, best_model, interval_coverage_cqr_pct, interval_nominal_pct, test_hours, demand_coverage_pct, demand_hours_kept, hours_expected, dispatch_baseline_cost_usd, dispatch_reference_days}` | EXISTS |
| Row totals, buses, window | `facts.global.{raw_rows_total, kept_rows_total, flagged_rows_total, topology_buses, window_days}` | EXISTS |
| Window, split, stations, attribution, versions | `meta.{window_utc, split, bas[ba].stations, attribution, pipeline_version, generated_at, artifact_tags}` | EXISTS |
| Month-hour and annual demand | `demand_profile.bas[ba].{month_hour_mean_mw, how_mean_mw, annual, daily}` | EXISTS |
| Fuel month-hour means, shares, ramp | `fuel_mix.bas[ba].{month_hour_mean_mw, annual_share_pct, annual_share_by_year, evening_ramp}` | EXISTS |
| Temperature response | `weather_relation.bas[ba].{binned, cool_base_c, pct_demand_per_c_above_base, pct_ci, n, r2}` | EXISTS |
| Forecast metrics, intervals, verdict, perfect-weather bound | `forecast_eval.bas[ba].{models.*, intervals.*, comparison_vs_eia, features, n_test}` | EXISTS |
| Forecast weeks, daily test errors | `forecast_samples.bas[ba].{weeks[], daily_test}` | EXISTS (interval variant: DR-8) |
| Reference days: demand, renewables available, imports, temperature | `dispatch_model.bas[ba].days[]` | EXISTS |
| Classes, battery, VOLL, heat-wave coefficients, assumptions, scenarios, formulation, reference LP | `dispatch_model` | EXISTS |
| Dispatch, battery, prices, curtailment, unserved, cost, CO2 | `dispatch_results.bas[ba].days[day][scenario]` | EXISTS (keys typed: DR-4) |
| Parity vectors | `dispatch_test_vectors` | EXISTS (coverage: DR-7) |
| Topology | `grid_topology` plus `design/ieee14-layout.json` | EXISTS (tag: DR-10) |
| Ledger identities, DST | `reconciliation`, `quality` | EXISTS |
| Observed stack for reference days | **DR-1** | DR |
| Intro day | **DR-2** | DR |
| Net load by year | **DR-3** | DR |
| `marginal_class`, typed keys | **DR-4** | DR |
| `display_order`, `classes[].group` | **DR-5** | DR |
| Slider ranges | **DR-6** | DR |

### 6.2 Data requests

| ID | Request | Why the design needs it | Size |
|---|---|---|---|
| DR-1 | For every `dispatch_model.bas[ba].days[k]`: `observed_gen_mw` = {EIA fuel code: [24]} and `observed_interchange_mw` [24], on the same local-hour index as `demand_mw`, tagged OBSERVED | S00, S02 card 1, S03a and the S08 untouched echo draw the **real** stack of a real day. Without it they fall back to month-hour means (DERIVED), and S03a loses its stack | about 2 BA x 6 days x 9 x 24 numbers, under 15 KB gz |
| DR-2 | Confirm that the `days[]` arrays are local hours 0-23 in the BA's zone, and that DST transition days are excluded or flagged (`days[].dst_transition: bool`). Mark one CISO day `intro: true`, chosen by a stated rule: the day in the latest complete year with the highest share of demand met by solar | The sky orientation depends on true local hours. S00 needs one deterministic day with a deep solar fan | tiny |
| DR-3 | `fuel_mix.bas[ba].month_hour_mean_mw_by_year` = {year: {demand: [288], SUN: [288], WND: [288], months_present: n}} for 2021 onward (index as `month_hour_mean_mw`) | S03b year steps: the bite deepening year by year (EIA reference #3). If declined, the YEAR row is disabled | about 25 KB gz |
| DR-4 | Type `dispatch_results...dispatch_mw` keys as `classes[].id` (plus `battery_discharge`). Type `cost_breakdown_usd` keys: one per class id, `battery_wear`, `unserved_voll`, summing to `objective_usd` (test). Add `marginal_class` [24] (class id, `"unserved"` or `"surplus"`) computed in Python | The ledger, the rim beat (which band set the price) and the inspector's `SET BY`. The browser computes the same from its own solve, and a Vitest test checks it against the presets | small |
| DR-5 | `dispatch_model.bas[ba].display_order` (ids centre outward: renewables used, fixed inflows, hydro, nuclear, battery discharge, dispatchables by marginal cost), `classes[].group` in {solar, wind, nuclear, hydro, gas_cc, gas_ct, coal, oil, imports, other}, and the treatment of negative `fixed_other_mw` / `net_imports_mw` (sinks) | Band order and colour mapping must be identical in Python, the client and the legend. The sink rule (section 0) needs a sign convention | tiny |
| DR-6 | `dispatch_model.controls[]` = {id, label, unit, min, max, step, default, param_path} for `renewables_scale`, `demand_growth_pct`, `heat_wave_c`, `battery_power_mw`, `battery_hours`, `outage_class` (enum of class ids or `none`), with every `scenarios[].params` expressed in the same ids | The live sliders must only allow tested ranges, and presets must be plain control values | tiny |
| DR-7 | The working tree (uncommitted at handoff) already requires at least 24 vectors and adds `parity_keys`. Remaining asks: compose the vectors as each BA x at least 2 days x {6 presets, at least 4 interior seeded random control combinations, 1 case with unserved > 0, 1 case with curtailment > 0}; add `price_usd_mwh` [24] to `expected` with its own tolerance (or a stated reason why duals are not compared); and add `lp_text_sha256` per vector | Parity must cover what the sliders can reach, not only presets. The hash checks the browser's LP builder text for text | under 60 KB gz |
| DR-8 | In `forecast_samples.weeks[]`, publish the interval variant explicitly: `gbm_p10_cqr_mw` / `gbm_p90_cqr_mw` beside the raw ones (or rename them), and the P50 of `best_model` if that is not `gbm` (for example `gbm_stacked_mw`) | S04 INTERVAL RAW / CONFORMAL, and showing the model that the verdict is about | about 2 x 3 x 168 x 2 numbers |
| DR-9 | `facts.bas[ba].interchange_abs_mean_pct_of_demand`, `facts.bas[ba].deepest_bite_month`, and `facts.bas.CISO.midday_net_load_min_mw_{first_year,latest_year}` | The S01 card 2 claim and the S03b year caption, without client lookups | tiny |
| DR-10 | Confirm `grid_topology.tags` and `illustrative: true`. The UI chip shows the artifact tag plus `ILLUSTRATIVE`. Layout coordinates live in `design/ieee14-layout.json` (no data change) | The honest label of the only non-BA network on the site | n/a |
| DR-11 | Confirm the sign and unit of `price_usd_mwh` (the dual of the hourly balance row, USD/MWh) and the HiGHS versions used (highspy versus highs-js 1.15.3's bundled HiGHS) | The PRICE layer bins, and whether price parity is expected or only objective parity | n/a |

---

## 7. Hard rejection criteria

I fail the build on review if any of these is true:

1. **Any section reads as a dashboard.** That means a KPI tile row, a framed chart with gridlines and a default legend box, a full-height sidebar, or a gradient legend. CTRL fails if its rail is a solid panel instead of floating glass controls.
2. **The rose becomes someone else's form.** That means a stroked circle at constant radius, an outer circle or guide ring, concentric gridlines, a tick ring, marks or nodes on any circumference, chords, rotation, a stepped angle, a sweep hand, or an **angular (clockwise) fill**. Any of these is an automatic redesign (P01, P06, P08, P09 identities).
3. **The rose lies.** That means the radius is linear in MW, tweens interpolate `r` instead of `r²`, a band is not keyed by class across hours, the stack order differs between petals, a sink is stacked inside demand, or an observed residual is filled with a colour.
4. **Anything orb-like at S00 or S08:** a smooth radial glow disc, a contraction to a marker or growth from a point, a cell surface, or a camera push into a surface. The P01/P02/P03 confusion check (MOTION_SYSTEM test 15) fails.
5. **Network dishonesty:** MW, arrows, flow numbers or moving dots on any 14-bus branch, the network shown without `ILLUSTRATIVE`, or any copy implying the LP uses it.
6. **Forecast dishonesty:** a PREDICTED series drawn like the actual (solid white), an interval drawn as a solid fill, `gbm_perfect_weather` presented as deployable, week-level numbers mixed with test-period numbers, or a verdict that does not match `beats_eia` and its CI.
7. **Dispatch dishonesty:**
   - the reported cost differs from `objective_usd` (or from Σ `cost_breakdown_usd`) by more than 1e-6 relative
   - SoC is out of bounds
   - a browser result is shown without `SOLVED IN BROWSER`, or a preset without `PRECOMPUTED`
   - a parity badge is shown that was not computed on this build
   - the solver runs on the main thread
8. **Any number on screen is not bound** to a contracted field or a DR (section 6).
9. **The headline LCP is later than 2.5s,** the hero text starts at opacity 0, or `highs.wasm`, `dispatch_results` or `forecast_samples` sits on the LCP path.
10. **Any pinned scene traps the visitor:** reverse or rapid scroll stalls, a nav jump lands on a half-filled rose, or a slider captures vertical scroll on touch.
11. **Mobile is a reflow of desktop.** The M S00 crop, the M skyline band, the one-day S04 with its picker, the CTRL bottom sheet and solve-on-release must be visibly different compositions, and T must differ from both.
12. **Two consecutive scenes look the same** in the contact sheet:
    - S03a versus S03b: a day plus the city, versus month means plus the bite and year chips.
    - S05 versus S06: the fill plus the SoC lab, versus the ghost overlay plus the scenario ledger.
13. **A control does nothing** or changes unrelated values: RETRY doesn't refetch, RESET doesn't restore, or a disabled control is silently applied.
14. **Text or graphic contrast fails:** `#192CE4` used as text or a line, network lines in anything but `#5B6BFF`, or 50% white under 13px.
15. **Any reference asset is used:** Blink fonts, wordmark styling, copy, images or video.
16. **No visible tag** on a data visual, a SIMULATED rose without its attached chip, or an OBSERVED rose labelled SIMULATED (or the reverse).
17. **The closing doesn't echo the opening.** It must be the same giant G0 rose, the same corner labels and the same radial drain and re-fill choreography.
18. **A U+2014 or U+2015 dash appears** in the site copy.
19. **The giant circular composition is missing or undersized:** a peak petal diameter under 1.2 x the frame height at the S00 end state or at S08 p 0.75 on any viewport, or the rose fully inside the frame on D.
20. **The window city implies geography** (a map, street or district names, landmarks), or a window is not exactly 100 MW of OBSERVED demand.
