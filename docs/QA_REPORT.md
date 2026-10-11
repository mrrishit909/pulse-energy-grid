# QA report: P04 Pulse Energy Grid (task P04-QA-001)

Independent visual, analytical, UX and performance QA. Reviewer: qa-reviewer (built none of this site; Claude Opus 5.5).
Date: 2026-10-11, 07:37 to about 08:40 EDT. Product code audited at `main` HEAD `4e98266` (code identical to
`944db09`; the later commit only touches `docs/BUILD_STATUS.md`). Build: `npx vite build` (vite 8.3.4) produced the same
hashed bundle as the served `dist/` (`index-BCO3i0X_.js`). It was served by `site/tests/serve.mjs` (vite preview on 4331,
restarted in a loop). The dev server was never used, and no product code was changed.

**Verdict: FAILED.** I found 11 major defects and no blocker. The suites are green, the solver is real and honest, and
the numbers match their sources (34 of 34 on-screen checks, the parity badge tied to a real in-browser run, CTRL cost equal
to the solver objective to the cent). Lighthouse passes even at load 21-48. The site fails the gate on two hard rejection
criteria and on layout and state defects that the builder's L-tests cannot see:

- **Criterion 21 (chart-library look).** The PRICE layer still reads as a pie chart: wedges meet at a hub, the P0 wedge has
  a flat fill, and a VOLL wedge is a grey slice (D-001). The S04 pre-unroll and unroll frames are a plain grey disc, then a
  near-black disc with a slot, then a grey fan of spokes converging on a hub (D-002). **Ruling on ED #52's open question:**
  the S04 pre-unroll fails. It reads as a flat grey disc at 1440, 1920, 1024, 768 and 390.
- **Reduced motion on phones.** S07 overflows to 525 px at 360/375/390, so the whole page gets a 525 px layout viewport.
  The builder's L5 test cannot fail, because with `isMobile` the value of `innerWidth` grows with the overflow (D-003).
  Under reduced motion, axe reports serious colour contrast (1.27:1) on the receded S07 cards in every scan (D-004).
- **Hour Inspector.** On desktop it persists into every other scene: S03a's OBSERVED 18:00 panel sits over S05's SIMULATED
  rose, and CTRL's panel sits over the S08 echo (D-005). On phones it opens off-screen in S03a and S05 (y = 4256 and 11008),
  so a tap shows nothing (D-006).
- **Silent failure.** With `dispatch_test_vectors.json` missing, S05, S07 and CTRL show "PARITY CHECK RUNNING ON THIS BUILD"
  forever, with no alert and no RETRY. The builder's L4 list omits that file (D-007).
- **Data timing.** OBSERVED solar appears after sunset. CISO 2025-08-06 shows 7.1 GW in the 20:00-21:00 petal, and the
  solar centroid sits +1.6 to +2.0 h after solar noon in CISO and +0.7 to +1.4 h in ERCO (D-008).
- **ED #25 on phones.** Both S04 verdict cards drop their MAPE difference and CI. The ERCO card shrinks to one line, while
  the CISO card keeps a full drift paragraph (D-009).
- **Collisions the L2/L11 tests cannot see.** These are canvas labels or the skyline against DOM text, and the week axis
  through the verdict titles (D-010). Separately, the S08 corner labels at 390 are white on `#FFF3A6` (D-011).

Machine: Mac15,6 (Apple M3 Pro, 120 Hz), Chromium 156.0.8078.4 (Playwright). Load averages ran 12 to 48 throughout (other
agents' builds). `uptime` is recorded with every performance number.

## 1. Release gate

| Row | Result | Measured evidence |
|---|---|---|
| Visual design | **FAIL** | The core identity is strong and original. The luminous Day Rose is a clean solar and white-blue core with a dim ember rim (S00, S03a, S05, CTRL, S08 frames). The serif and mono system holds, and the scenes are distinct (S03a city vs S03b bite; S05 fill + lab vs S06 ghost + ledger). It fails on hard criteria: D-001 (PRICE pie), D-002 (S04 grey disc and spokes), D-011 (S08 labels at 390), and D-012 transition slicing. |
| Motion UI (6 layers) | PASS (with defects) | **Intro:** silhouette, radial fill in merit order, rim beat, headline sharpen (`screenshots/1440x900/00-s00-t*`; `introStats` minR = G0 = 620, monotonic). **Nav:** instant jump plus stage-enter. **Scroll storytelling:** S01 shrink, S02 deck, S03a hours, S03b months/years, S04 unroll, S05 fill (`contact-sheets/1440x900.jpg` frames 0-110). **Component:** sliders re-solve, petal lift, stepper. **Data transitions:** keyed band tweens, scenario settles. **Micro:** RESET, chips. Defects: D-002 (unroll), D-012. **Frame pacing** (§6): headed Metal, desktop p95 10.1 ms. |
| UX | **FAIL** | Keyboard journey, 21 of 23 checks pass (§4). These worked: radios with arrows, rose Enter opens the inspector and Esc returns focus, the S04 toggles, slider re-solve, the S06 tablist, every CTRL control, TIME LIMIT, RESET, and the S04 phone day picker (09.05 selected). Open: D-005, D-006, D-016, D-017. |
| Functionality and states | **FAIL** | I blocked each JSON artifact singly for every consuming scene at 1440 and 390, and 68 of 68 cases pass: a visible alert, a RETRY in view, exactly one re-fetch, and the alert clears (`routeblock/results.json`). For highs.wasm and the worker in S05 and CTRL at 1440 and 390, 8 of 8 show the labelled PRECOMPUTED fallback with RETRY, and RETRY brings the solver back with parity 108/108 (`logs/solver-retry.txt`). The time limit is handled ("TIME LIMIT REACHED: SHOWING THE LAST OPTIMAL RESULT"). Open: D-007 (dispatch_test_vectors silent in 6 of 6 cases), D-013, D-014. |
| AI / analytical | **FAIL** | 34 on-screen values match facts.json and the artifacts (§3). The parity badge equals the session report (`n 108, objective 108, price 85/85, hash 108`). In CTRL, a keyboard-set non-preset (renewables 1.25, demand +7, battery 2,800 MW) shows `$7,104,392`, `data-objective` equals the solver objective, and Σ breakdown is within 1e-6. With the worker blocked, the result is labelled PRECOMPUTED, with no SOLVED IN BROWSER and no parity. SIMULATED appears on every dispatch view, the 14-bus card says ILLUSTRATIVE with no MW, there are no "live" claims, and there is no U+2014/2015. Open: D-008 (hour alignment), D-009 (phone verdict), D-015. |
| Performance | PASS (local; re-measure on Pages) | Lighthouse x3 at load 21-48, so load-confounded, yet all pass. Mobile: perf 0.99/0.99/0.99, LCP 1832/1816/1821 ms, CLS 0, TBT 0, a11y 1.00. Desktop: perf 1.00 x3, LCP 517/503/449 ms, CLS 0.00005. Frame pacing (headed, ANGLE Metal M3 Pro, load 32): desktop p95 10.1 ms, 3.3% of frames over 16.7 ms; 1440 at 4x CPU p95 13.1 ms; 390 at 4x CPU p95 36.1 ms (6.6% over 33 ms). Minor: D-014, D-018. |
| Responsiveness | **FAIL** | D, T and M are deliberate compositions: a left text column with the rose right; a stacked tablet; phone grids with a MENU pill, the S04 one-day picker, a CTRL CONTROLS sheet, and the S05 FULL LEDGER sheet. L1 holds with classic scrollbars at 1024 and 768 (js = css = layout class in 38 + 38 shots). Fails: D-003, D-010, D-011, D-021. |
| Professional quality | PASS (with defects) | `uv run pytest -q` 68 passed. `npm run typecheck` clean. `npm run lint` clean. `npm test` 70 passed (9 files). `npm run e2e --workers 1`: 111 passed, 33 skipped, 0 failed, 0 retried (13.6 min). Every skip is a project-gated duplicate (qa.spec is desktop-project only; mobile-only specs skip on desktop). All 8 required docs plus README are present, but 4 are stale (D-020). |
| GitHub | BLOCKED | No public repo yet (`github.com/mrrishit909/pulse-energy-grid` is 404). Not in QA scope. |
| Deployment | BLOCKED | Not deployed (Pages URL 404). The S08 links in `site/src/config.ts` 404 until release. LCP must be re-measured on Pages. |
| Portfolio | BLOCKED | Not in QA scope. |

Hard-rejection checks that **pass**: #3 (area truth in the drawn rose, e2e), #4 (no orb at S00/S08; P01-P03 check), #5
(Wires ILLUSTRATIVE, no MW, no moving dots), #6 (PREDICTED dashed and hatched; verdicts match `beats_eia` and CI at
D/T), #7 (cost = objective, SOLVED IN BROWSER or PRECOMPUTED always attached, parity computed on this build, worker
only), #9 (LCP well under 2.5 s, h1 ghost not opacity 0, no wasm or results on the LCP path; e2e load schedule), #15,
#16 (tags visible; L3 e2e), #17 (S08 echo drains and refills at G0), #18, #19 (G0 = 620 at 1440, 138 vh), #20.

**P04 vs P05 (DESIGN_AUDIT watch item): distinct.** I read the 240 px greyscale pair sheet
(`screens/p04-vs-p05-greyscale-240.png`; P05 frames from `05-economic-atlas/artifacts/evidence/stage-b/`, read only).
P04 shows solid petal masses with band steps and a dark ember rim. P05 shows a dotted grain lattice with no solid mass.
They separate at 240 px in greyscale for the opening, the S05 lab against P05's S04 disc, and the closing. One watch
note: both closings put a lower-left serif paragraph over a giant disc (the template DESIGN_AUDIT row 48 warns about).

## 2. Defect register

Severity: blocker (cannot ship, data loss or broken core), major (fails a gate row or a hard criterion), minor.
Evidence paths are relative to `artifacts/evidence/qa/`.

| ID | Sev | File / area | Viewport | Repro | Expected | Actual | Evidence | Verification test |
|---|---|---|---|---|---|---|---|---|
| P04-D-001 | major | `site/src/graphics/rose.ts` `drawPriceRose`; S06, CTRL | all | S06, LAYER PRICE, step 4 (heat wave) or 5 (outage); CTRL heat-wave preset, PRICE | Never readable as a polar or pie chart (criterion 21, ED #51/#52). P0 has no fill, only a dotted `#FFB26B` tip | Heat wave: a pink three-quarter disc, a grey VOLL quarter-slice and orange slices whose edges meet at the hub. Concentric band seams read as axis rings. Renewables: the P0 hours merge into one flat `#101010` black wedge (sampled 16,16,16) with a pale dotted rim. CTRL 1-bin day: a monochrome pink disc | `screenshots/1440x900/s06-06-price-heat.jpg`, `s06-05-price-renew.jpg`, `screenshots/768x1024/s06-06-price-heat.jpg`, `screens/ctrl-price-heatwave-{1440,390}.jpg`, `contact-sheets/1920x1080.jpg` frames 77-87 | Greyscale 240 px reviewer read of S06 steps 1-5 + CTRL in PRICE; a pixel test that the P0 interior equals the background |
| P04-D-002 | major | `site/src/scenes/S04Forecast.tsx`, `site/src/graphics/week.ts` | all | Jump to `forecast` p 0.03, 0.15, 0.25 | The pre-unroll silhouette must not read as a plain grey disc (ED #51/#52). No radial lines or hub (criterion 21) | p0.03: a grey disc with a radial grey gradient (`#1A1A1A` to `#5A5A5A`); the week's petals are near-equal, so there is no petal form and the "lit leading edge" is not visible. p0.15: a near-black disc with a black slot. p0.25: a grey fan whose petal edges are visible light spokes converging on a hub, with white tip strokes and a black rounded rectangle notch at the centre | `screenshots/1440x900/s04-00-p03-preunroll.jpg`, `s04-01-p15-unroll.jpg`, `s04-02-p25-unroll.jpg`, `screenshots/390x844/s04-0{0,2}-*`, `screenshots/768x1024/s04-00-*` | Reviewer read of p 0.03/0.15/0.25 at 1440/768/390; `rose.test`-style assert that the unroll renderer never strokes a radial segment |
| P04-D-003 | major | S07 `.ev-bars` / `.chip__detail` under reduced motion; `e2e/qa.spec.ts` L5 | 360, 375, 390 (reduced motion) | `reducedMotion: reduce`, `isMobile`, load | `scrollWidth <= viewport width` (L5) | S07 `ul.ev-bars` reaches x 433 and the PREDICTED chip detail "UPPER BOUND · NOT AVAILABLE AT FORECAST TIME" reaches x 525. `innerWidth` becomes 525 at 360/375/390 (visual viewport 390). The page scrolls sideways, the MENU pill sits at y 1089 (off-screen at load) and nav clicks fail, and REPLAY INTRO ends at x 509. The builder's L5 compares `scrollWidth` to `innerWidth`, which grows with the overflow under `isMobile`, so it cannot fail | `logs/a11y.txt` ("NAV CLICK FAILED"), `screens/reduced-390-s07-overflow.jpg`, `probes/wide.mjs`, `probes/wide2.mjs`, `logs/extra.txt` (zoom lines) | L5 must assert `scrollWidth <= visualViewport.width` (or the configured viewport width), not `innerWidth` |
| P04-D-004 | major | S07 receded answer cards, `.chip--on-light` under reduced motion | 1440, 390 (reduced) | axe wcag2aa, reduced motion, any scroll position (S07 renders in flow) | Text contrast ≥ 4.5:1 | 8 nodes (7 at 390): black chip text on `#341710`, 1.27:1. Exchanges 1, 2, 3 and 4 (DERIVED, PREDICTED, SYNTHETIC chips). It is one defect reported in every scan | `a11y.json`, `logs/a11y.txt`, `probes/cc.mjs` | axe with `reducedMotion: reduce` at S07 (the builder's axe runs only in normal motion) |
| P04-D-005 | major | `site/src/components/HourInspector.tsx` / `state/inspector.ts` | 1440, 1024, 1920 | Real click on the CTRL rose (or S03a), then nav to another scene | The inspector closes, or stays scoped, when its scene leaves | It stays open over every scene. CTRL's 19:00 SIMULATED panel covers the S08 echo; S03a's OBSERVED 18:00 panel sits over S04 and S05 (SIMULATED summer rose), mixing honesty tags | `honesty.json` (check "Hour Inspector closes when its scene leaves": FAIL), `screens/inspector-persists-s08-1440.jpg`, `../evidence/qa/screenshots/1024x768/s04-*` in the core run (S03a panel over S04/S05) | Playwright: click a petal, `jumpTo` another scene, expect no visible `.inspector` |
| P04-D-006 | major | Inspector sheet on phones, S03a and S05 (and other pinned scenes) | 390 | Tap the S03a or S05 rose | A bottom sheet (peek or full) on screen | The hour changes (readout 12:00), but the `.sheet.inspector` renders at y 4256 (S03a) / 11008 (S05): `position: fixed` resolves against a transformed ancestor. Nothing visible. CTRL works (y 380) | `screens/inspector-tap-{demand,dispatch,control}-390.jpg`, `probes/insm.mjs` | Tap each rose at 390; assert the sheet's box intersects the viewport |
| P04-D-007 | major | `site/src/state/solver.ts`, S05/S07/CTRL | 1440, 390 | Block `dispatch_test_vectors.json` | Visible error + RETRY (L4), and copy that does not claim a check is running | S05: "PARITY CHECK RUNNING ON THIS BUILD" forever. CTRL: no parity line and no alert. S07 ex6: no parity numbers and no alert. No RETRY anywhere. The builder's `CONSUMES` omits this file | `routeblock/1440-dispatch-dispatch_test_vectors.jpg`, `routeblock/1440-control-dispatch_test_vectors.jpg`, `routeblock/results.json` (6 rows ok=false) | Add the file to `CONSUMES` for dispatch, evidence and control |
| P04-D-008 | major | Pipeline hour labelling (`pipelines/ingestion/eia.py`, `ts_utc` treated as hour start, DATA_CONTRACTS) | data | Read `dispatch_model.days[].observed_gen_mw.SUN` | OBSERVED petals carry the right local hour (noon at top is the design's premise) | Solar after sunset: CISO 2025-08-06 20:00-21:00 = 7.1 GW (LA sunset about 19:55 PDT); 2025-01-02 17:00-18:00 = 8.4 GW (sunset 16:55 PST). Generation-weighted solar centroid minus local solar noon: CISO +1.88, +1.61, +1.80, +1.65, +1.99 h; ERCO +1.41, +1.40, +0.72, +0.97 h. Visible in S00 (the solar fan leans to 14-15 h) and S03a (1,477 MW solar at 18:00 in January). The shifts are not one clean offset, so I report the measurement, not a root cause. EIA's docs pages were not retrievable to confirm hour-ending. Matching facts.json does not validate hour labels | `probes` (centroid script inline in this report §3), `screenshots/1440x900/s03a-01-p74-landing.jpg` | pytest: for every reference day, the solar centroid is within ±0.75 h of local solar noon |
| P04-D-009 | major | S04 verdict cards, phone layout (`S04Forecast.tsx`) | 390, 375, 360 | `forecast` p 0.9 | Both verdicts state the MAPE difference and its CI, with CISO and ERCO equally prominent (ED #25, criterion 6) | Phones drop the "CISO: MAPE … DIFFERENCE −4.47 PP (95% CI …)" and "ERCO: … +1.83 PP (95% CI +1.50 TO +2.20). WE SAY SO." lines. The CISO card keeps a 9-line orange drift paragraph, while ERCO shows only "OURS LOWER ON 68 OF 359 TEST DAYS". At 1440 and 768 both are complete and equal (616x216) | `logs/extra.txt` ("verdict" lines), `screenshots/390x844/s04-08-p90-verdict.jpg` | Text-parity test of both cards at 360/375/390: both contain `PP (95% CI` |
| P04-D-010 | major | Canvas hour labels, skyline, week axis and stack key vs DOM text (L2/L11 blind spot: the collision helper only boxes DOM text) | 768, 1024, 1440, 360 | See the actual column | No text struck or overlapped (L2, L7, L11) | 768 S03a: hour label "12" over the SPRING button, and lit skyline windows over "3,059 MW". 768 S06 PRICE: "00" over the legend edge "100-500". 768 S04: the week axis line and dates pass through both verdict titles. 768/1024/360 CTRL: the stack key overlaps the lower petals, and "00" touches NUCLEAR/WIND. 1440 S05 lab: the RESET underline strikes the SOLAR row | `screenshots/768x1024/s03a-01-p74-landing.jpg`, `s06-06-price-heat.jpg`, `s04-08-p90-verdict.jpg`, `ctrl-00-landing.jpg`; `screenshots/1440x900/s05-06-lab-battery.jpg`; `screenshots/360x800/ctrl-00-landing.jpg` | Add `__peg.debug().labels` boxes, skyline rect, week axis and the rose disc to `collisions()` |
| P04-D-011 | major | S08 corner labels (no top scrim in the echo) | 390 (phones) | `closing` p 0.76 | Text ≥ 4.5:1 (criterion 14). S00 has a top scrim | "PULSE ENERGY GRID / CISO · 2025-01-02" in white on `#FFF3A6`/`#FDEDA0` solar, about 1.1:1, unreadable. axe misses it because the background is canvas | `screenshots/390x844/s08-03-p76-echo.jpg` | Pixel-sample contrast of the corner-label box at S08 p 0.76 on phones |
| P04-D-012 | minor | Pinned-scene hand-offs | 1440, 768, 1920 | Scroll S03a→S03b and S05→S06 | Outgoing text never slices the rose | Black caption backings cross the rose (S03a footer band, the S05 status block), and the S06 controls arrive over it, for about 1-2 scroll steps | `screens/scroll-1440-f33.jpg`, `scroll-1440-f73.jpg`, `contact-sheets/1440x900.jpg` frames 33, 72-73 | Reviewer read of hand-off frames |
| P04-D-013 | minor | Inline `.state-error` in S04 and S03b stages | 1440, 390 | Block forecast_eval (S04) or fuel_mix (S03b) | One styled alert placed in the grid | A second, unstyled error line is absolutely positioned at (0, 0). It overlaps the S04 h2 and sits outside the 96 px margin, beside the styled fixed banner (which also overlaps the h2) | `routeblock/1440-forecast-forecast_eval.jpg`, `1440-netload-fuel_mix.jpg`, `probes/dup.mjs` | Collision test in the error state |
| P04-D-014 | minor | `site/src/workers/solver.worker.ts` + Emscripten loader | all | Normal load into S05; RETRY after a wasm block | One highs.wasm GET (3.53 MB, 1.23 MB gz) | Two GETs per solver start, also on a normal load (the second may be a cache hit on Pages; check there) | `logs/extra.txt` ("wasm GETs normal load 2"), `probes/wasmcount.mjs` | Count wasm requests on the Pages URL |
| P04-D-015 | minor | `site/src/model/solve.ts` parity report | all | Read `__peg.solver().parity` | Every sub-check disclosed | `keys: 107/108`: one vector's CO2, unserved or cost breakdown is outside 1e-6, but the badge shows only objective, prices and hash. I did not identify which vector | `honesty.json` (solver.parity) | Name the vector, or show KEYS n/n in the S07 answer |
| P04-D-016 | minor | Tab order | 1440 | Load and press Tab during the intro | First stop SKIP INTRO; sequential Tab reaches every scene's controls | The first Tab lands on "Card 1 of 4" in the off-screen S02 deck. Tabbing from S03b skips S04 and S05 controls (it goes to S06) | `logs/a11y.txt` (first two kb lines, Tab walk) | Keyboard walk assertion |
| P04-D-017 | minor | CTRL at 1440x900 | 1440 | Nav to CONTROL ROOM | Cost = objective visible on landing | The ledger starts at y 880, under the nav bar; it needs a scroll (fine at 1920) | `screenshots/1440x900/ctrl-00-landing.jpg` | Ledger top < innerHeight − 64 at landing |
| P04-D-018 | minor | `site/index.html` | all | Load | No console errors | `/favicon.ico` 404 (only Lighthouse best-practices deduction, 0.96) | `lighthouse/mobile-1.report.json` (errors-in-console) | Lighthouse BP = 1 |
| P04-D-019 | minor | `site/src/styles/tokens.css` | all | Read | Own accent pair from P04 on (ED #43) | `--accent-primary/secondary` still the shared light blue / orange | `tokens.css:26-27` | Grep |
| P04-D-020 | minor | `docs/LIMITATIONS.md` #21, `docs/ARCHITECTURE.md`, `docs/TESTING.md`, `docs/DEPLOYMENT.md` | docs | Read | Docs match the shipped site | LIMITATIONS #21 says S02/S03b/S04/S07/S08 are pending. ARCHITECTURE marks scenes "pending". TESTING says e2e "TBD (pending QA)". DEPLOYMENT steps say TBD | files | Doc review |
| P04-D-021 | minor | S02 card 3 chip | 360 | `source` p 0.58 | Honesty tag readable in full (L3) | "DERIVED · FITTED, NOT A FORECAS" clipped at the card edge | `screenshots/360x800/s02-01-p58-card3.jpg` | L3 test with full-text check |
| P04-D-022 | minor | S04 MODEL toggles | all | CISO, forecast | Every `forecast_eval.models` id except perfect weather (VISUAL_DESIGN S04) | CISO shows NAIVE/EIA/OURS only. ERCO adds "EIA BIAS-CORRECTED". `eia_debiased` (7.20%) exists for CISO and is quoted in the drift text, but cannot be drawn | `screenshots/1440x900/s04-07-p82-ours.jpg` vs `s04-09-erco-verdict.jpg` | Toggle-list test per BA |
| P04-D-023 | minor (judgement) | S03b NET LOAD | all | `netload` p 0.6-0.95 | No guide ring (criterion 2) | The dotted removed-area outline sits at an almost constant radius in month means, so it reads as a dotted guide ring | `screenshots/1440x900/s03b-03-p80-years.jpg` | Reviewer read |
| P04-D-024 | minor | Reduced-motion static frames for S05 and S06 | 1440, 390 (reduced) | `reducedMotion: reduce`, scroll S05/S06 | Each static scenario rose stays readable | The scenario roses render as a grid of small multiples, about 110 px at 1440 and about 70 px of visual width at 390 (D-003 adds a 0.74 zoom). Band structure and the price or ghost cannot be read on phones. The harness log for 390-reduced also records `scrollW` 524 > `clientW` 390 from the first shot, which corroborates D-003 | `contact-sheets/390x844-reduced.jpg` frames 78-93, `screenshots/390x844-reduced/s06-0*`, `screenshots/390x844-reduced.json` | Minimum rendered rose diameter (for example ≥ 240 px) in reduced motion |

Not filed (probe artifacts, retracted): the nav pill "covered" at the top in normal motion (my Escape fired before the
key handler existed, so the intro was still playing); routeblock WASM/WORKER rows (selector mismatch; superseded by
`logs/solver-retry.txt`, 8/8 pass); "Escape does not close the CTRL inspector" (a synthetic event; the real-key journey
passes); the CTRL OUTAGE `<select>` ArrowDown (macOS opens the popup instead of stepping). CANCEL SOLVE could not be
exercised through the UI: solves take 2-8 ms even at 20x CPU throttle, under the 150 ms threshold that shows the button.
It is covered by the e2e hook test (stageb "cancel terminates an in-flight solve").

## 3. Honesty and correctness spot checks (1440 unless noted)

All from `probes/honesty.mjs` → `honesty.json`, against `site/public/data/*.json`:

| # | On screen | Source | Match |
|---|---|---|---|
| 1-2 | CISO peak 51,104 MW, 2022-09-06 18:00 | facts.bas.CISO.peak_demand_mw / _local | yes |
| 3-4 | ERCOT peak 85,544 MW, 2024-08-20 18:00 | facts.bas.ERCO | yes |
| 5 | ERCO interchange 0.46% of demand | facts…interchange_abs_mean_pct_of_demand | yes |
| 6-7 | +5.49% demand per °C above 16 °C (95% CI 5.32 to 5.69) | weather_relation.bas.CISO | yes |
| 8 | "about 5.5%" body copy | facts demand_temp_slope 5.49 | yes |
| 9-11 | CISO solar 21.8 · wind 10.2 · gas 45.0%; ERCO 7.9 / 24.4 / 43.0% | facts.bas.*.share | yes |
| 12-13 | 937,020 rows in, 936,905 kept | facts.global | yes |
| 14 | Evening ramp 3,059 MW/h | facts.bas.CISO.evening_ramp_mw_per_h | yes |
| 15 | 24,862 MW served → 249 of 960 windows | round(MW/100) | yes |
| 16 | 2025* marked partial | meta | yes |
| 17-20 | CISO MAPE 3.35 vs 7.82; ERCO 4.06 vs 2.23 | facts.test_mape | yes |
| 21-22 | CISO −4.47 pp (95% CI −4.89 to −4.02); ERCO +1.83 pp (+1.50 to +2.20) | forecast_eval comparison_vs_eia | yes (U+2212 minus) |
| 23 | EIA CISO drift −6.36% in 2025 | facts.eia_ciso_dayahead_bias_pct | yes |
| 24 | CISO interval 83.4% vs nominal 80% | facts interval_coverage_cqr_pct | yes |
| 25-26 | Parity 108/108, prices 85/85, hash 108/108 | live `__peg.solver().parity` this session | yes (keys 107/108 not shown, D-015) |
| 27 | S05 baseline objective 11,145,697.99995 vs Python 11,145,698 | dispatch_results CISO summer baseline | within 1e-6 |
| 28 | S05 "MODEL COST $11,145,698 = SOLVER OBJECTIVE ✓" | live objective | yes |
| 29-30 | CTRL non-preset: $7,104,392; data-objective 7104391.717459554 = solver; Σ breakdown 7104391.717459555 | live | yes |
| 31 | S07 parity answer 108/108 | session report | yes |
| 32 | Wires: ILLUSTRATIVE, no "MW" in the SVG | grid_topology | yes |
| 33 | No "live" in rendered copy; no U+2014/2015 | body text | yes |
| 34 | Worker blocked: S05 and CTRL read "IN-BROWSER SOLVER UNAVAILABLE: SHOWING PRECOMPUTED PYTHON RESULTS" + RETRY, chip "SIMULATED · MODEL · PRECOMPUTED", no PARITY | route abort | yes |

The S07 claim "every feature is known at forecast time" holds. `analytics/forecast.py` gives `gbm` CAL + LAGS + OBS_WX
(weather before the origin). Only `gbm_perfect_weather` uses target-day weather, and it is labelled an upper bound.

Solar timing measurement (D-008), from `dispatch_model.json`: generation-weighted centroid of positive `SUN` per
reference day, against local solar noon (CISO at Los Angeles, ERCO at Austin): CISO 2025-01-02 13.95 vs 12.07; 2025-04-15
14.61 vs 13.00; 2025-08-06 14.90 vs 13.10; 2024-09-17 14.50 vs 12.85; 2024-05-27 14.89 vs 12.90. ERCO 2024-12-16 13.81
vs 12.40; 2025-04-30 14.90 vs 13.50; 2025-08-19 14.32 vs 13.60; 2024-09-06 14.52 vs 13.55.

## 4. Accessibility and keyboard

- **axe** (wcag2a/aa/21a/aa) on S00/S01 top, every scene reached by a **real nav click** (MENU pill on phones), and S08:
  - 1440 normal: 11 scans, 0 violations.
  - 390 normal: 11 scans, 0 violations.
  - 1440 reduced: 11 scans, each with color-contrast serious (8 nodes, D-004).
  - 390 reduced: 11 scans, each with color-contrast serious (7 nodes); nav clicks fail from PULSE on (D-003).
  - Results in `a11y.json`.
- **Keyboard journey** at 1440 (`logs/a11y.txt`):
  - Pass: the Tab walk has a focus ring on all 14 stops; S03a GRID and DAY step with arrows; Enter on the S03a rose opens
    the inspector with focus inside, and Esc returns focus to the rose; S03b LAYER and YEAR; S04 NAIVE toggles
    `aria-pressed`; S04 WEEK; the S05 battery slider re-solves in the browser (1,800 MW); every slider has a name; the S06
    tablist ArrowRight steps the scenario; CTRL GRID, the HEAT WAVE preset, LAYER PRICE, TIME LIMIT (handled, last optimal
    kept), RESET (CISO / winter / baseline / STACK), and inspector Enter/Esc returns focus.
  - Fail: the first Tab (D-016).
  - Phone: the S04 day picker tap selects 09.05 (`screens/s04-daypicker-0905-390.jpg`).
  - Mobile menu Esc and focus return pass in e2e (shell.spec 62).

## 5. QA_LESSONS L1-L11

| # | Result | Evidence |
|---|---|---|
| L1 viewport class | PASS | Classic 15 px scrollbars: 1024x768 clientWidth 1009 → js D = css D = layout D in 38/38 shots; 768x1024 clientWidth 753 → T = T = T in 38/38 (`screenshots/*-classic.json`). Code: `currentClass()` uses `matchMedia`; clientWidth only measures canvases. e2e L1 pass |
| L2 1024-1279 composition | **FAIL** | 1024 is a deliberate compact composition (right-anchored rose, 48-400 text column), and e2e L2 passes. But the CTRL stack key overlaps the petals at 1024, and the 768 collisions above (D-010) are invisible to the DOM-only helper |
| L3 tags never hidden | PASS (one minor) | Every visual has a visible tag at 360/375/390/768 (e2e L3; harness `shots[].chips`). D-021 clips one chip's detail at 360 |
| L4 silent artifact failure | **FAIL** | 68/68 single-file blocks recover with one re-fetch, and the solver 8/8. `dispatch_test_vectors.json` is silent (D-007) |
| L5 no sideways scroll | **FAIL** | D-003: 525 px under reduced motion at 360/375/390; the e2e check is structurally blind |
| L6 font weight / mobile LCP | PASS | Fonts 34.8 KB + 5.1 KB woff2; mobile LCP 1816-1832 ms x3 at load 21-48 |
| L7 11 px floor / struck labels | **FAIL** | The e2e floor holds in CSS px, but labels are struck by marks: the RESET underline over SOLAR (1440), the week axis through the verdict titles (768), windows over "3,059 MW" (768) (D-010). Under the D-003 zoom, 11 px renders at about 8 px |
| L8 corner buttons vs pill | PASS | e2e L8 ≥ 8 px at 768/390/375/360; harness frames show REPLAY INTRO clear of the pill. Exception: under D-003 the button sits at x 509 |
| L9 canvas over controls | PASS | e2e L9 at 1440/390. In my probes every control was clickable, except the D-003 case |
| L10 overclaiming copy | PASS | No "live"; "computed in your browser"; S07 forecast-time claim verified against `forecast.py`; ERCO "WE SAY SO" |
| L11 phone flow | **FAIL** | Phones flow (grids, sheets) and e2e L11 passes, but: 360 CTRL "00" over WIND and the stack key over the petals (D-010), the S08 labels (D-011), and the inspector off-screen (D-006) |

## 6. Evidence, method and measurements

- **Harness**: `site/tests/evidence-harness.mjs` is a copy of the shared v2 via P03's QA copy. It uses `window.__peg`, adds
  a `--reduced` mode, and uses JPEG shots. Its config is `site/tests/evidence.config.json`: 10 scene sequences, 7 intro
  clocks, and 110 scroll steps at 220 ms. The final runs use the corrected config, which closes the inspector with its
  CLOSE button. The earlier sheets were polluted by an inspector that stayed open; that pollution is itself evidence for
  D-005.
- **Viewports and runs:**
  - Normal motion: 1920x1080, 1440x900, 1024x768, 768x1024, 390x844, 375x812, 360x800.
  - Reduced motion: 1440x900 and 390x844.
  - Classic scrollbars: 1024x768 and 768x1024.
  - Each run writes `screenshots/<vp>/` with per-shot geometry, chips and class in `<vp>.json`, and
    `contact-sheets/<vp>.jpg`. Recordings are `.webm` under `artifacts/evidence/recordings/` (gitignored).
- **Committed size**: about 37 MB. The JPEGs were re-encoded at q40-50. For the classic-scrollbar runs only `<vp>.json` and the contact sheets are kept. Lighthouse keeps run 1 per preset as full JSON, plus all 6 runs in `summary.jsonl`.
- **Renderer**: headed Chromium, `ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro)` (real GPU, not SwiftShader).
- **Frame pacing** (`frame-pacing.json`): the heavy interaction is a rapid scrub across forecast..stress (S04 unroll and S05
  fill), and the state changed in all three runs. Uptime was 32.6 at the start.
  - 1440 unthrottled: p50 8.3 ms, p95 10.1 ms, 3.3% of frames over 16.7 ms.
  - 1440 at 4x CPU: p95 13.1 ms.
  - 390 at 4x CPU: p95 36.1 ms, 6.6% over 33 ms.
- **Lighthouse** (`site/tests/run-lighthouse.sh`, `lighthouse/summary.jsonl`): 3 mobile + 3 desktop runs at load averages
  21.4-48.5, so they are load-confounded. All pass anyway.
- **Probes** (`probes/`):
  - `routeblock.mjs`: L4, 82 cases.
  - `solver-retry.mjs`
  - `honesty.mjs`
  - `a11y.mjs`
  - `extra.mjs`: zoom, verdict text, CTRL PRICE, day picker, cancel, wasm count.
  - `insm.mjs`: inspector tap.
  - `wide*.mjs`, `dup.mjs`, `cc.mjs`, `fr.mjs` (transition frames), `pill*.mjs`, `wasmcount.mjs`, `esc.mjs`, `dp.mjs`.
- **Frames read**:
  - All 11 final contact sheets (7 normal, 2 reduced, 2 classic), plus the first 1440 and 1024 sheets from the earlier pass. Those two were polluted by the stuck inspector and have since been overwritten.
  - 47 frames at full resolution or at least 90% scale:
    - Single frames: S00 end, S04 p03, S06 price-heat and price-renew, S08 p97 and p50, S03b p30, S07 ex5, S02 card 2 (1440);
      CTRL (1920); S06 price, S04 verdict (768).
    - Native-size crops: the P0 wedge, the hub, unroll p25, RESET, three 768 collisions, the S08 labels.
    - About 24 phone frames at 90-100%.
    - Transition frames f32/f33/f45/f73.
    - Route-block and solver-block frames.
  - About 40 more were read in 50% 2x2 grids, used only to find candidates.

## 7. What must change before a re-test (owner: frontend)

1. D-001, PRICE layer. Keep the class-stack core lit under the price light (for example, price only on the outer band or
   rim), give P0 no fill, and break the hub.
2. D-002, S04. A luminous silhouette with visible petal form for the pre-unroll, no spokes or hub in the unroll, and
   remove the centre notch.
3. D-003 and D-004, reduced motion at S07: wrap the bars and chips, and fix the receded-card chip ink. Fix the L5 test.
4. D-005 and D-006, inspector: close it on scene leave, and make the phone sheet escape its transformed ancestor (portal to body).
5. D-007: put `dispatch_test_vectors` in L4 with an alert, RETRY and honest copy.
6. D-008 (data agent): check the EIA-930 timestamp convention and re-label hours, then add the solar-centroid test.
7. D-009: give phones the same verdict facts (difference and CI) for both BAs.
8. D-010 and D-011: include canvas labels, the skyline and the axis in the collision helper; add the S08 phone scrim.

A limited QA pass 2 should then re-run `routeblock`, `a11y` (both motions), `extra`, `insm` and the harness at 1440, 768 and 390.
