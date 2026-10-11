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

---

# Pass 2 (task P04-QA-002)

Independent re-test after the data fix `2284833` (EIA-930 hour-ending timestamps) and the frontend fix batch `7041ca5`.
Reviewer: qa-reviewer (Claude Opus 5.5). I built none of the site and changed no product code. Date: 2026-10-11, 10:21 to
about 11:40 EDT. Code audited at `main` HEAD `ddb8a5c` (code identical to `7041ca5`; the later commit only touches
`docs/BUILD_STATUS.md`). `npm run build` reproduced the served bundle (`index-DosCcKBf.js`), served by
`site/tests/serve.mjs` (vite preview, port 4331, restart loop). Machine: Mac15,6 (Apple M3 Pro), Chromium 156.0.8078.4.
Load averages ran 8 to 40 throughout, and `uptime` is recorded with every performance number. Evidence is in
`artifacts/evidence/qa-2/` (probes in `qa-2/probes/`, logs in `qa-2/logs/`). Recordings are `.webm` files under
`artifacts/evidence/recordings/` (gitignored).

**Verdict: FAILED.** 8 major defects are open and there is no blocker.

- **Closed:** 16 of the 24 pass-1 defects, including 8 majors (D-003, D-004, D-005, D-006, D-007, D-009, D-010, D-011).
  The inspector, route-blocking, phone verdict and collision work is solid:
  - 86 of 86 single-artifact blocks recover through a real-pointer RETRY.
  - The inspector closes on every scene change in 15 of 15 cases.
  - 38 of 38 numbers match their sources.
  - Lighthouse passes even at load 28-35.
- **Still open:**
  - D-001: the PRICE layer reads as a pie on surplus days.
  - D-002: the S04 unroll still has flat grey wedges meeting at a hub.
  - D-008: CISO solar timing is still about one hour late in every on-screen CISO day. The data fix shifted every
    hour by one, but CISO's timestamps change convention twice inside the window.
- **Escalated:** D-023, the dotted ring that S04 now opens on.
- **New majors:**
  - D-025: the CISO EIA comparison is computed on a misaligned pair.
  - D-026 and D-027: two contrast failures under reduced motion.
  - D-028: sideways scroll at 1024 and 1280 in CTRL PRICE.

## P2.1 Release gate

| Row | Result | Measured evidence |
|---|---|---|
| Visual design | **FAIL** | The identity remains strong and distinct, with the luminous rose, the serif and mono system, and distinct scenes in every sheet. It fails hard criteria 2 and 21. **D-001:** Renewables +50% in PRICE drops whole petals and leaves an empty sector whose straight edges meet at the centre. It reads as a pie with a slice removed, in greyscale at 240 px, at 1920/1440/1024/768/390/375/360 and in the scroll story (`screens/price-greyscale-240.png`, `screens/grid-s06-price-phone-tablet.jpg`, `contact-sheets/1920x1080.jpg` f76-77). **D-002:** the S04 unroll uses flat `#6B6B6B` wedges (pixel samples 105-107 grey) that converge on the rose centre with a black slot (`screens/grid-s04-{768,390}.jpg`, `screenshots/1440x900/s04-03..05`). **D-023:** S04 opens on a constant-radius dotted ring. D-012 (minor): hand-offs still slice the rose. |
| Motion UI (6 layers) | PASS (with defects) | All six layers are present in every sheet: the intro (7 frozen clocks per viewport), the nav jump, scroll storytelling (S01 to S08, 111 frames per viewport), component interaction (sliders re-solve, the stepper, the inspector), data transitions (STACK to PRICE; L18 is clean), and microinteractions (RESET ✓, radio crossfade). **Frame pacing** (headed, `ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro)`, load 35.07 at the start; S04 unroll and S05 fill scrub, state changed in all 3 runs): 1440 unthrottled p50 8.3 / p95 10.2 ms, 3.6% of frames over 16.7 ms; 1440 at 4x CPU p95 13.1 ms; 390 at 4x CPU p50 8.4 / p95 35.0 ms, 6.2% over 33 ms (`frame-pacing.json`). Defects: D-002 and D-012. |
| UX | **FAIL** | Keyboard journey (`logs/a11y.txt`): 19 of 22 checks pass, and every functional step passes (the 3 fails are explained in §P2.4). That covers GRID/DAY arrows; the S03a inspector, where Enter moves focus in and Esc returns it to the rose; S03b LAYER and YEAR; the S04 toggles and week; the S05 slider re-solving in the browser; slider names; the S06 tablist; CTRL GRID, preset, LAYER, TIME LIMIT (handled, last optimum kept) and RESET (including LAYER back to STACK); and the CTRL inspector, where Enter/Esc returns focus. The Hour Inspector closes on scene change (15/15; L17). Fails: D-028 (CTRL sideways scroll at 1024/1280) and D-026 (nav illegible over S07 under reduced motion). |
| Functionality and states | PASS | **Route-block** (`routeblock/results.json`): each artifact blocked singly for every consuming scene (read from the `SceneErrors` specs in `src/scenes/*.tsx`), plus `highs.wasm` and the worker, at 1440 and 390. 86 of 86 pass. Each case shows a visible scoped alert. `elementFromPoint` at the RETRY centre returns RETRY, and a real `mouse.click` or `touchscreen.tap` gives exactly one re-fetch and clears the alert. In the solver cases, RETRY brings the solver back with parity 108/108. `dispatch_test_vectors.json` now shows the alert and RETRY plus "PARITY NOT CHECKED: THE TEST VECTORS DID NOT LOAD" in S05 and CTRL, with the alert in S07 (6/6; D-007 closed). The time limit is handled, RESET restores, and there is one wasm GET per start (D-014 closed). |
| AI / analytical | **FAIL** | 38 of 38 on-screen values match the regenerated artifacts (§P2.3). CTRL non-preset (renewables ×1.15, demand +9%, battery 2,600 MW) shows `$7,953,464`; `data-objective` 7953463.649207755 equals the solver objective, and Σ breakdown is within 1e-6. The parity report is n 108, objective 108, prices 82/82, keys 108, hash 108; the badge and the S07 answer match it. Worker blocked: PRECOMPUTED is labelled, with no parity. Fails: **D-008** (CISO hours still about +1 h from Nov 2023 on, which covers every CISO day on screen) and **D-025** (the CISO GBM vs EIA margin is inflated by about 1.3 pp through misalignment). The honesty facts the task named still hold: the CISO 2025 bias is −6.35%, ERCO EIA beats GBM (+1.89 pp, CI +1.55 to +2.28), and the phone verdict cards are equal (§P2.3). |
| Performance | PASS (local, load-confounded; re-measure LCP on Pages per ED #58) | Lighthouse 13, 3 runs per preset (`lighthouse/summary.jsonl`), load averages 28.3 to 34.3. **Mobile:** perf 0.99 / 0.99 / 0.99, LCP 1,815 / 1,804 / 1,813 ms, CLS 0, TBT 0, a11y 1.00, BP 1.00 (favicon fixed). **Desktop:** perf 1.00 ×3, LCP 490 / 491 / 451 ms, CLS 0.00004. Fonts 34.8 KB + 5.1 KB woff2. Pacing as above: desktop is about 60 fps at p95; the mobile emulation p95 of 35 ms sits at about the 30 fps target. |
| Responsiveness | **FAIL** | D, T and M remain deliberate compositions in all 7 viewports plus 1280. L1 holds with classic scrollbars (1024 → D/D/D and 768 → T/T/T in 47 + 47 shots). Fails: **D-028**, where CTRL PRICE widens the page to 1,096 px at 1024 and 1,352 px at 1280 (`scrollWidth` > width in 6 harness shots each; `screens/ctrl-wide-legend-1024.jpg` shows the rose and its 06 label cut off at scrollX 72). **D-027**, reduced motion. |
| Professional quality | **FAIL** | `uv run pytest -q`: 74 passed. `npm run typecheck`: clean. `npm run lint`: clean. `npm test`: 73 passed (10 files). `npx playwright test --workers 1`: 117 passed, 40 skipped, 1 flaky, 0 failed (14.8 min, load 13 at the start). The flaky test ("L4 1440: dispatch", alert not found in 20 s) passed on its retry and again in a serial `--retries 0` rerun at load 10, so I classify it as load. All 40 skips are project-gated duplicates. **axe** is not clean: under reduced motion, S07 has color-contrast serious on 10 nav nodes (D-026). D-020 docs are still stale (minor). |
| GitHub | BLOCKED | Not in QA scope (no public repo yet). |
| Deployment | BLOCKED | Not deployed. The LCP row is re-measured on Pages (ED #58). S08 links are verified at release. |
| Portfolio | BLOCKED | Not in QA scope. |

## P2.2 Defect register (pass 1 IDs re-adjudicated, new IDs from D-025)

Evidence paths are relative to `artifacts/evidence/qa-2/`.

| ID | Sev | Status | Evidence and ruling |
|---|---|---|---|
| D-001 | major | **OPEN (narrowed)** | Heat wave, outage, demand and battery in PRICE now read as the STACK rose with a price-tinted outer band and rim. Criterion 21 passes for those frames at every viewport (`screens/s06-price-heat-*`, `screenshots/1440x900/ctrl-02-price-heatwave.jpg`). Surplus hours (price ≤ 0) fail. "Surplus hours keep only their tip" deletes the whole petal, so Renewables +50% shows an empty top sector. Its two straight edges meet at the hub, the remaining solar petals form wedges, and a dotted arc closes it. In the 240 px greyscale strip it reads as a pie with a slice cut out. It also breaks ED #61 ("keeps STACK geometry"). It appears in the 1920, 1280, 1024, 768-classic, 375 and 360 scroll sheets (f75-77), not just one frame. Fix direction: keep the surplus petals' STACK bands lit and mark surplus on the rim only. Test: the core pixels of every petal in PRICE equal those in STACK. |
| D-002 | major | **OPEN** | p0.00 to p0.08 now open on the S03b rose (the silhouette is gone), which is good. From p0.10 to p0.20, at 1440, 768 and 390 and in the reduced-motion statics, the departing petals are flat `#6B6B6B` wedges. Pixel samples read 105-107 grey; the grey-pixel standard deviation is 4.3 and comes only from edges. Their inner tips meet at the rose centre with a black wedge or slot (`screenshots/1440x900/s04-03-p12-unroll.jpg`, `s04-04-p15-unroll.jpg`, `screens/grid-s04-768.jpg`, `grid-s04-390.jpg`). p0.20 shows a rose with a quarter removed and straight edges at the hub. p0.25 is a radial sunburst of slivers. This meets criterion 21 on three counts: a flat swatch, a hub where edges converge, and a wedge. Fix direction: the departing petals keep their own band gradients, and no geometry is anchored at the centre once a petal leaves. |
| D-003 | major | CLOSED | Reduced motion at 360/375/390: `scrollWidth` equals the configured width in every shot (`screenshots/390x844-reduced.json`) and in 141 reduced walk rows (`logs/lchecks-reduced.json`). |
| D-004 | major | CLOSED | axe under reduced motion at 1440 and 390 no longer reports the receded-card chips (`a11y.json`). See D-026 for the new reduced-motion finding. |
| D-005 | major | CLOSED | Opened by a real click in S03a, S05 and CTRL at 1440 and 1024, then jumped to all 9 other scenes. The panel was gone each time, and the destination's first control passed `elementFromPoint` (`logs/inspector.json`, 6/6). |
| D-006 | major | CLOSED | Phone taps (`touchscreen.tap`) at 390 and 360 open the sheet in view (y 336-416, bottom = viewport). At 768 the sheet is in view at y 576-612 (`screens/insp-open-*`, 9/9). |
| D-007 | major | CLOSED | See Functionality (6/6 test-vector cases, real-pointer RETRY). |
| D-008 | major | **OPEN (partly fixed)** | ERCO is fixed: its solar centroid sits between −0.09 and +0.45 h of solar noon in every year and month, and the EIA day-ahead aligns best at lag 0 in every year. **CISO is not fixed.** Its solar timing changes convention twice: about −0.8 h until 2022-06-15, about −0.1 to −0.3 h until 2023-10-31, then about +0.9 h from 2023-11-01 to the end. The single −1 h shift cannot correct all three. The builder's tests miss this by construction. The monthly test pools all five years, so the −0.8 and +0.9 periods cancel (pooled CISO months −0.08 to +0.44). The day-level test allows ±1.0 h, and its comment blames the +0.95 h offset on fog. Every CISO day on screen falls in the +0.9 h period: intro 2024-04-20 (+1.00 h), winter 2025-01-02 (+1.00 h), spring, summer and fall (+0.73 to +0.92 h). **On screen:** S03a CISO winter, the OBSERVED Hour Inspector "17:00 · SOLAR 1,477 MW" after a 16:55 PST sunset, and 16:00-17:00 at 8,402 MW, 64% of peak, in the hour that ends 5 minutes after sunset (`screens/s03a-winter-insp-17-1440.jpg`, `logs/visual.json`). On all five CISO days the asymmetry is the same: the hour containing sunrise (06:00-07:00) reads 0-1% of peak, while the hour containing sunset reads 19-64% (winter 16:00-17:00 64%, spring/intro 19:00-20:00 19% and 34%, summer 19:00-20:00 40%, fall 18:00-19:00 53%; `logs/solar_timing.txt` §5). S03b May 2025 "MIDDAY NET LOAD MIN 5,457 MW AT 15:00", where solar is 0% at 06:00-07:00 (sunrise about 05:50) and 41% at 19:00-20:00. Root cause **UNVERIFIED**: I measured it but cannot say which publisher convention changed or why. Verification: a per-year-month solar centroid test (±0.5 h of solar noon) for every BA, run on years separately (`probes/solar_timing.py`, `logs/solar_timing.txt`). Route to the data agent. |
| D-009 | major | CLOSED | At 390, 375 and 360, both verdict cards state MAPE, the difference and the 95% CI. The two cards sit side by side at equal width and height in the frames (the probe measured their shared container: 358x259 at 390, 343x273 at 375, 328x273 at 360), and the drift note spans both (`screens/phone-defect-sites.jpg`, `honesty.json` verdict390/375/360). |
| D-010 | major | CLOSED | My own walker (not the builder's helper) compared `__peg.marks()` against every visible DOM text run. It found 0 collisions in 225 normal and 141 reduced rows across 8 viewports, with marks present (S03a 80, S04 up to 9, S06 and CTRL 4) (`logs/lchecks*.json`). Full-size reads of the pass-1 sites at 768, 1024 and 360 are clean (`screens/tablet-defect-sites.jpg`, `ctrl-1024-key-crop.jpg`). |
| D-011 | major | CLOSED | The S08 corner labels at 390 sit on an opaque backing (`screens/phone-defect-sites.jpg`). The pixel contrast probe raised no S08 failure at 1440, 768, 390 or 360. |
| D-012 | minor | OPEN | Real-step hand-offs still drag black text backings and the S06 control slab across the rose for about 2 steps. Examples: S05 status block and S06 GRID/DAY/LAYER over the rose (`screens/trans/1440-dispatch-stress-05.jpg`, `screens/handoff-1440.jpg`), and the S03a footer band (`screens/trans/1440-demand-netload-04.jpg`, `-05.jpg`). |
| D-013 | minor | OPEN (residual) | The duplicate unstyled line is gone. The fixed error banner still covers the S04 h2 at 1440 (`routeblock/1440-forecast-forecast_eval.jpg`). |
| D-014 | minor | CLOSED | 1 wasm GET on a normal load into S05 (`probes/wasm.mjs`). Route-block RETRY also re-fetches once. |
| D-015 | minor | CLOSED | The parity line shows "CO2, UNSERVED, COST LINES 108/108" (keys 108/108). |
| D-016 | minor | CLOSED (note) | The first Tab now lands on the nav, then the corner buttons. SKIP INTRO is the 12th stop, and the walk then continues into S02 and S03a. The order is logical. A keyboard user needs 12 Tabs to skip a 4.4 s intro, which is acceptable. |
| D-017 | minor | CLOSED | The CTRL cost line is in view at landing at 1024 and 1440. |
| D-018 | minor | CLOSED | Built favicon is `/pulse-energy-grid/favicon.svg`. No 4xx in any harness run. BP 1.00. |
| D-019 | minor | CLOSED | `--accent-primary #192ce4 / --accent-secondary #ff4c25` is P04's own pair. |
| D-020 | minor | OPEN | Still stale: `ARCHITECTURE.md` lines 44-52 ("pending"), `TESTING.md` lines 26/37/41 ("TBD (pending QA)"), `DEPLOYMENT.md` line 31, and `LIMITATIONS.md` #21 ("Scenes pending"). |
| D-021 | minor | CLOSED | The 360 S02 card 3 tag wraps in full. |
| D-022 | minor | OPEN | S04 MODELS for CISO: NAIVE, EIA, OURS. ERCO adds EIA BIAS-CORRECTED, but CISO's `eia_debiased` (7.20%) cannot be drawn (`probes/wasm.mjs` output). |
| D-023 | **major** (escalated) | OPEN | S04 now opens on the S03b rose, so the removed-area outline is the first S04 image: a near-complete dotted circle at nearly constant radius around the rose, from p0.00 to p0.15 at 1440, 768 and 390 (`screenshots/1440x900/s04-00-p00-open.jpg`, `screens/grid-s04-*.jpg`). Criterion 2 names "an outer circle or guide ring" as automatic, and criterion 21 "any concentric axis or guide ring". It is honest data, but in month means it draws as a ring. Fix direction: draw the outline only where the removed area is non-zero (daylight petals), or as each petal's own tip. |
| D-024 | minor | CLOSED | The reduced S06 roses fill their squares at 390 (`contact-sheets/390x844-reduced.jpg` f77-91). |
| **D-025** | **major** | NEW | **CISO EIA comparison computed on a misaligned pair** (follow-on of D-008, data and analytics). On the CISO test split (2024-08-31 to 2025-08-26), the EIA day-ahead MAPE is 7.82% at the published alignment and **6.50%** with DF delayed one hour. The best lag is clearly +1 h in CISO 2023, 2024 and 2025 (2022 is a tie, 3.56 vs 3.55; 2021 is 0) and 0 in every ERCO year (`logs/solar_timing.txt` §3-4). **Still holds:** GBM 3.35% beats EIA at either alignment. The −6.35% 2025 bias (a yearly mean) barely moves. ERCO EIA beats GBM. **Computed on a misaligned pair:** the CISO "−4.46 PP (95% CI −4.89 TO −4.01)", "OURS LOWER ON 339 OF 356 TEST DAYS", skill 57.2%, and the drift note "part of our CISO margin is that drift" (part of it is timing). Root cause UNVERIFIED (in 2023, solar was near-centred while DF still aligned best at +1, so it is not established which series moved). Verification: a per-year best-lag = 0 check on DF vs D for every BA before any comparison is published. |
| **D-026** | **major** | NEW | **Reduced motion: the fixed nav bar and corner buttons have no opaque backing over flowing content.** At 1440, S07's orange answer cards scroll under the translucent nav track (`rgba(242,242,242,0.1)`): white 13 px nav text on `#FE5D3A` at 3.06:1, axe color-contrast serious on 10 nodes (`a11y.json`, `screens/reduced-1440-s07-nav.jpg`). Over the blue rose in S03b and S06 the nav measures 3.5-4.4:1. At 390, REPLAY INTRO has no backing and tangles with S07 card text (3.33:1, `screens/cc-s07-corner-reduced-390.png`). Normal motion is clean because pinned scenes keep content clear of the bar. |
| **D-027** | **major** | NEW | **Reduced motion: the S00/S01 headline over the bright rose.** As S00 flows into S01 (`pulse` p0.78), the white h1 "The invisible machine that powers everything." sits over the near-white nuclear and wind bands. Pixel-sampled contrast is 1.08-2.85:1 at 390 and 1.13-2.85:1 at 1440 (needs 3:1; `screens/cc-s01-reduced-{390,1440}.png`, `contact-sheets/1440x900-reduced.jpg` f1-3, `390x844-reduced.jpg` f1-3). It is the hero text, and criterion 14 applies. |
| **D-028** | **major** | NEW | **CTRL PRICE legend widens the page at 1024 and 1280.** After HEAT WAVE + LAYER PRICE (real clicks), `.price-legend` with its VOLL (UNSERVED) edge ends at x 1,096 (1024) and 1,352 (1280), so `scrollWidth` grows to 1,096 / 1,352 and the page scrolls sideways. The rose and its 06 label are cut off at scrollX 72 (`screens/ctrl-wide-legend-1024.jpg`, `probes/ctrlwide*.mjs`, harness `screenshots/1024x768.json` and `1280x720.json`, 6 shots each). 1440 is clean. This is an L5 failure at gate viewports; the builder's L5 e2e (`qa.spec.ts:104`) runs only at 360/375/390/768, as QA_LESSONS L5 specifies. |
| D-029 | minor | NEW | The S08 data-source credit ("Source: U.S. Energy Information Administration (EIA-930 ...) ... RETRIEVED 2026-10-10T05:04:09Z") is cut by `text-overflow: ellipsis` at about a third of its length on D and T, and `display:none` on phones (`scenes.css:550,558`, `screens/s08-credit-crop-1440.jpg`). The attribution is never readable in full. |
| D-030 | minor | NEW | Pixel contrast below 4.5:1 on small text: the hatched SIMULATED chips (`#FF4C25` on the ember hatch) at 4.2-4.4:1 at 768, 390 and 360; the S07 "SIMULATED · PARITY ON THIS BUILD" chip on orange at 3.42:1; and the S00 corner wordmark at 768 at 4.1:1 (`logs/contrast.json`, `screens/cc-grid.png`). All are legible on screen, which is why this is minor. |
| D-031 | minor | NEW | `fuel_mix.json bas.*.annual_share_by_year` starts with a "2020" stub (CISO SUN 0.0%, NG 72.18%), made by the −1 h shift of the first stamp. The UI does not read it, but it is a published artifact. |
| D-032 | minor (watch) | NEW | S05 p0.04 opens on a flat `#191919` disc with petal steps at the edge (`screenshots/1440x900/s05-00-p04-silhouette.jpg`). It is the same family as the S04 silhouette that ED #61 rejected. It is darker and shows petal form, so I do not rule it a criterion 21 failure, but the next design review should look at it. |

Retracted or not filed:

- axe at 390 on load flagged the S03a-S05 h2 at `#303030` (1.59:1). In 5 follow-up states (load and four scene jumps) the titles are white at opacity 1 (`probes/axeprobe.mjs`). This was a transient mid-reveal sample.
- Contrast "fails" on the Wires node labels (SVG `fill` text survives the colour-transparent backdrop pass) and on boxes whose backdrop equals the text colour (the frame moved between measuring and capture) are probe artifacts.
- The pill covering an S02 chip at 390 under reduced motion is normal flow under a fixed control.
- The CTRL OUTAGE `<select>` ArrowDown failure is the macOS popup, as in pass 1.
- The S06 dashed baseline circle is the design's ghost overlay (ED #51), not a guide ring.

## P2.3 Honesty and numbers (1440 unless noted; `probes/honesty.mjs` → `honesty.json`, values read from `site/public/data/*.json`)

38 checks, and every value matches. The probe reported 2 fails, and both were my own formatting errors, verified by hand:

- **S06 max price:** the screen shows "$1,000.0" and the probe expected "$1000.0".
- **S03b:** at p0.9 the screen shows the month-mean figures "MAY MIDDAY NET LOAD MIN 5,457 MW AT 15:00 / EVENING NET LOAD MAX 24,564 MW AT 21:00". These equal `fuel_mix.month_hour_mean_mw_by_year.2025` (demand − SUN − WND; min 5,457 at index 15, max 24,564 at index 21).

| # | On screen | Source | Match |
|---|---|---|---|
| 1 | S00 corner `CISO · 2024-04-20 · PEAK 23,774 MW` | dispatch_model CISO days[intro] (date moved by the data fix) | yes |
| 2-3 | CISO peak 51,104 MW 2022-09-06 **17:00**; ERCO 85,544 MW 2024-08-20 **17:00**; no stale "18:00" anywhere | facts.bas.*.peak_demand_* | yes |
| 4 | ERCO interchange 0.46% | facts | yes |
| 5 | +6.23% demand per °C above 17 °C (95% CI 6.02 TO 6.51); no stale 5.49 | facts / weather_relation (changed by the data fix) | yes |
| 6-8 | CISO SOLAR 21.8% · WIND 10.2% · GAS 45.0%; ERCO 7.9 / 24.4 / 43.0 | facts shares | yes |
| 9-10 | 937,020 rows in, 936,905 kept | facts.global | yes |
| 11 | Evening ramp 2,691 MW per hour | facts.bas.CISO.evening_ramp_mw_per_h | yes |
| 12 | 26,682 MW served → 267 of 960 windows (CISO winter 18:00) | dispatch_model demand_mw[18], round(MW/100) | yes |
| 13 | 2025* partial | meta | yes |
| 14-15 | S03b 5,457 MW at 15:00 and 24,564 MW at 21:00 (May 2025) | fuel_mix by-year month-hour means | yes (hand check) |
| 16-17 | CISO MAPE 3.35% vs 7.82%; ERCO 4.12% vs 2.23% | facts.test_mape | yes |
| 18-19 | CISO −4.46 PP (95% CI −4.89 TO −4.01); ERCO +1.89 PP (+1.55 TO +2.28), beats_eia false | forecast_eval comparison_vs_eia | yes (see D-025) |
| 20 | CISO drift −6.35% in 2025 | facts.eia_ciso_dayahead_bias_pct | yes |
| 21 | CISO interval coverage 83.4% | facts | yes |
| 22-23 | Parity 108/108, prices 82/82 where unique, CO2/unserved/cost lines 108/108, LP SHA-256 108/108 | live `__peg.solver().parity` this session | yes |
| 24-25 | S05 baseline objective 11,214,939.49995 vs Python 11,214,939.5; "MODEL COST $11,214,939" | dispatch_results CISO summer baseline | within 1e-6 |
| 26-28 | S06 heat wave: $11,214,940 → $38,311,237; 115,283 T → 186,801 T; unserved 20,435 MWH | dispatch_results | yes |
| 29 | S06 max price $52.3 → $1,000.0 | max(price_usd_mwh) | yes (hand check) |
| 30-33 | CTRL non-preset $7,953,464; data-objective = solver objective; Σ breakdown within 1e-6; SOLVED IN BROWSER + parity | live | yes |
| 34-35 | Wires ILLUSTRATIVE, no MW in the SVG; S07 parity answer = session report | grid_topology / live | yes |
| 36 | No "live" claims; no U+2014/U+2015 in rendered text | body text | yes |
| 37-38 | Worker blocked: S05 and CTRL PRECOMPUTED, with no SOLVED IN BROWSER and no parity | route abort | yes |

ED #25 on phones: the 390, 375 and 360 verdict text contains both differences and both CIs, and the cards are equal (D-009 closed).
The data fix did not break the three honesty facts: CISO bias −6.35%, ERCO EIA beats GBM, and equal verdict prominence.
Solar timing (D-008) is fixed for ERCO only.

## P2.4 Accessibility and keyboard

- **axe** (wcag2a/aa/21a/aa), on S00/S01 top, then every scene reached by a **real nav click** (MENU pill on phones), then S08 (`a11y.json`):
  - 1440 normal: 11 of 11 clean.
  - 390 normal: 10 of 11 clean, plus 1 transient (retracted).
  - 1440 reduced: 10 of 11 clean, plus S07 color-contrast serious on 10 nodes (D-026).
  - 390 reduced: 11 of 11 clean. No nav click failed (D-003 closed).
- **Keyboard:** 19 of 22 checks pass. The 3 fails are explained: the first Tab lands on the nav by design (D-016 note), "Enter on SKIP" depends on that first Tab, and the OUTAGE select fails because of the macOS popup.
- **Pixel contrast** (L16; `probes/contrast.mjs`, `logs/contrast.json`): 3,893 text elements at 120 scene points, across 1440/768/390/360 normal and 1440/390 reduced. The backdrop comes from a frame with every text node made transparent, and the worst-case pixel (p95 for light text, p5 for dark) is used. Real failures are D-026, D-027 and D-030; the rest are the artifacts listed above.

## P2.5 QA_LESSONS L1-L18 (my own probes)

| # | Result | Evidence |
|---|---|---|
| L1 | PASS | Classic 15 px scrollbars: 1024x768 → D/D/D and 768x1024 → T/T/T in 47 + 47 harness shots. The walk gives js = css = layout in all 366 rows. |
| L2 | PASS | 1024 and 1280 compositions are clean in the walk and in full-size reads (`screens/tablet-defect-sites.jpg`, `ctrl-1024-key-crop.jpg`). |
| L3 | PASS | Tags are visible at 360/375/390/768 (harness `shots[].chips`). The S02 card 3 tag wraps in full. The S08 source credit is hidden on phones, but it is not an honesty tag (D-029). |
| L4 | PASS | 86/86 route-block cases, including `dispatch_test_vectors` in S05/S07/CTRL and wasm/worker in S05/CTRL at 1440 and 390. |
| L5 | **FAIL** | Phones and the reduced walk are clean, but CTRL PRICE overflows at 1024 and 1280 (D-028). |
| L6 | PASS | Fonts 34.8 + 5.1 KB. Mobile LCP 1,804-1,815 ms x3, measured at load 28-34, so load-confounded. |
| L7 | PASS | 0 visible text nodes under 11 px in 366 walk rows (8 viewports, both motions). |
| L8 | PASS | REPLAY INTRO is clear of the pill at 768/390/375/360 in every harness frame and in e2e L8. Under reduced motion it lacks a backing over content (D-026), which is a contrast issue, not a pill overlap. |
| L9 | PASS | `elementFromPoint` returned the control in 86 RETRY cases and in 135 destination-control checks (15 inspector runs × 9 scenes). |
| L10 | PASS | No "live". The parity copy is bound to the session report. The S07 forecast-time claim stands. |
| L11 | PASS | The 360/375/390 sheets and the walk are clean. The D-010 sites are fixed. |
| L12 | PASS | Real `mouse.click` / `touchscreen.tap` everywhere: RETRY 86/86 and the inspector 15/15. |
| L13 | PASS | My walker compared `__peg.marks()` against DOM text: 0 hits, with marks present. |
| L14 | PASS (check) / FAIL (finding) | The fixed-width assertion catches the fixture: at 390 a 600 px fixture made `innerWidth` 604 while `visualViewport.width` stayed 390, and it was detected. The same check found D-028. |
| L15 | PASS | Every reduced-motion scene has a non-empty figure. The minimum non-black share per scene is 3.3% to 75% across 1440/768/390 reduced (`logs/`, computed from `screenshots/*-reduced`). |
| L16 | **FAIL** | D-026 and D-027 (major), D-030 (minor). |
| L17 | PASS | 15/15: the inspector is opened by real pointer or tap in S03a/S05/CTRL at 1440/1024/768/390/360 and is gone after every jump. |
| L18 | PASS | STACK↔PRICE in S06 and CTRL, 16 frames at about 40 ms after a real click (64 frames). The legend and its unit text swap in the first frame with the rose. Only the radio highlight crossfades, for about 100 ms, and it carries no unit (`screens/L18-grid.jpg`, `L18-radio.jpg`, `logs/transitions.json`). |

## P2.6 Method, evidence, frames read

- **Harness:** `site/tests/evidence-harness.mjs` is unchanged except that it now writes to `--out qa-2`. `evidence.config.json` adds the following steps:
  - S04 p0.00/0.03/0.08/0.12, with p0.15 and p0.35 promoted to core.
  - S06 price-outage.
  - CTRL HEAT WAVE + PRICE and STACK.
- **Runs:**
  - Normal motion at 1920x1080, 1440x900, 1280x720, 1024x768, 768x1024, 390x844, 375x812 and 360x800.
  - Reduced motion at 1440, 768 and 390.
  - Classic scrollbars at 1024 and 768.
  - The first chain lost its browser to another agent's cleanup, so I re-ran per viewport with retries. All runs finished with 0 page errors and 0 HTTP ≥ 400.
- **Committed evidence:** about 30 MB.
  - Full screenshot sets are kept for 1440, 768, 390, 1440-reduced and 390-reduced.
  - The other viewports keep their per-shot JSON, contact sheet and the cited frames.
  - Classic runs keep JSON and contact sheet only.
  - Lighthouse keeps run 1 per preset plus `summary.jsonl`.
  - JPEGs are re-encoded at q38-50.
- **Probes** (`qa-2/probes/`):
  - `routeblock.mjs`: L4 + L12.
  - `honesty.mjs`
  - `a11y.mjs`: unchanged copy of pass 1.
  - `inspector.mjs`: L17, D-005, D-006.
  - `lchecks.mjs`: L1, L5, L7, L13, L14, with the fixture.
  - `contrast.mjs` and `ccrop.mjs`: L16.
  - `transitions.mjs`: D-012 and L18.
  - `visual.mjs`: D-001, D-002, D-008 frames.
  - `ctrlwide*.mjs`: D-028.
  - `axeprobe.mjs`
  - `wasm.mjs`: D-014, D-022.
  - `s08src.mjs`: D-029.
  - `solar_timing.py`: D-008, D-025.
- **Frames read:**
  - All 13 contact sheets: 1920, 1440, 1280, 1024, 768, 390, 375, 360, 1440-reduced, 768-reduced, 390-reduced, 1024-classic, 768-classic.
  - More than 60 frames at full resolution:
    - 1440: S04 p00/p08/p12/p15/p25/p35, S06 price-heat, price-renew and stack-renew, CTRL price-heatwave, S05 silhouette, the S03a 17:00 inspector, the S07 reduced nav, the S04 error state, the S05→S06 hand-off, and CTRL at 1024 (two frames).
    - S04 p10/12/15/20 at 768 and 390 (8 frames).
    - S06 PRICE at 390 and 768 (5 frames).
    - Phone defect sites (5 frames) and tablet defect sites (5 frames).
    - The L18 swap frames (16).
    - 8 contrast crops.
    - The S08 credit crop.
- **Recordings:** `recordings/<vp>.webm` per harness viewport (gitignored).

## P2.7 What must change before pass 3

1. **Data agent: D-008 and D-025.**
   - Detect and correct CISO's per-period timestamp convention (step dates 2022-06-15 and 2023-11-01, measured), or document an evidence-backed per-period rule.
   - Add per-year-month centroid tests (±0.5 h) and per-year DF-vs-D best-lag = 0 tests for every BA.
   - Regenerate the forecast comparison, then re-check the S04/S07 CISO copy.
2. **Frontend:**
   - D-001: keep the surplus petals' STACK bands.
   - D-002: the departing petals keep their gradients, and nothing converges at the centre.
   - D-023: no constant-radius outline.
   - D-026: an opaque nav and corner backing, or a scrim, under reduced motion.
   - D-027: a headline backing or a frame change under reduced motion at S00/S01.
   - D-028: the CTRL price legend wraps or scales at 1024-1279.
   - Extend L5 to 1024 and 1280 in CTRL with PRICE on.
3. **Minors:** D-012, D-013, D-020, D-022, D-029, D-030, D-031, D-032.
4. **Lesson candidate for `QA_LESSONS.md`** (QA cannot edit it): "a data-convention test pooled over all years can pass while individual years are off by ±1 h in opposite directions. Run timing tests per year (and per BA) and check forecast-vs-actual best lag = 0 per year."

---

# Pass 3 (task P04-QA-003)

This is an independent re-test after the data fix `c1f6277` (per-series, per-period CISO timing correction) and the
frontend fix batch `be35020` (FIXF-001).

- **Reviewer:** qa-reviewer (Claude Opus 5.5). I built none of the site and changed no product code.
- **When:** 2026-10-11, 12:46 to about 13:40 EDT.
- **Code audited:** `main` HEAD `be35020`. A fresh `npm run build` produced `index-CiMgvhxF.js`, and the `site/tests/serve.mjs` server (port 4331, restart loop) served that same bundle.
- **Machine:** Mac15,6 (Apple M3 Pro), Chromium 156.0.8078.4. Load averages ran 4 to 16, and `uptime` is recorded with every measurement.
- **Evidence:** `artifacts/evidence/qa-3/`, with probes in `qa-3/probes/` and logs in `qa-3/logs/`.

**Verdict: FAILED.** 3 new majors are open and there is no blocker. Two are regressions from pass-2 fixes (D-034, D-037). The third, D-038, already existed and pass 2 missed it.

All 8 pass-2 majors are closed, and the data correction is good:
- Every CISO and ERCO year-month solar centroid is within −0.28 to +0.45 h.
- The EIA day-ahead best lag is 0 in every year for both BAs.
- The EIA comparison and its copy are re-derived and bound to the new data.

The new majors:
- **D-034 (regression):** on phones the S08 echo rose is reduced to a featureless yellow band. The cause is the full-length source credit (D-029 fix) and its scrim.
- **D-037 (regression):** at 1024 and 1280 the S06 PRICE colour key is hidden under the SIMULATED chip, and at 768 it overlaps the rose. This came from the D-028 legend resize.
- **D-038 (pre-existing, missed in pass 2):** under reduced motion on phones, S07 bar labels overprint the "perfect weather" upper-bound values. It is visible in pass 2's own frame `qa-2/screenshots/390x844-reduced/s07-02-p35-ex3.jpg` (over 3.11% / 3.85%), so the fix-f diff is not its cause.

The new DOM-generated collision probe (L19, which includes fixed elements and runs at 1280) found D-037 and D-038. Neither appears in the builder's own L2/L11/L19 e2e tests, which all pass.

## P3.1 Release gate

| Row | Result | Measured evidence |
|---|---|---|
| Visual design | **FAIL** | D-001, D-002 and D-023 are closed: PRICE keeps the full STACK rose (the 240 px greyscale forms match STACK, `screens/price-greyscale-240.png`), the S04 unroll keeps band gradients with the core intact (`screens/s04-grid-1440.jpg`, `grid-s04-tm.jpg`), and S04 opens without the ring. It fails on **D-034** (the S08 phone echo is no longer a recognisable rose; criteria 17/19) and **D-037** (the PRICE colour key is covered). Minors: D-033 (a blank scroll run between S04 and S05) and D-035 (legend words broken mid-word). |
| Motion UI (6 layers) | PASS (with defects) | All six layers are present in every sheet. D-012 is closed: pinned panels fade and no longer slice the rose (`screens/handoff-1440.jpg`). L18 is clean. **Frame pacing** (headed, `ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro)`, load 8.58 at the start; S04 unroll + S05 fill scrub, state changed in all runs): 1440 p50 8.3 / p95 10.4 ms, 3.3% of frames over 16.7 ms; 1440 at 4x CPU p95 13.4 ms; 390 at 4x CPU p95 33.3 ms, 5.1% over 33 ms. Defect: D-033. |
| UX | **FAIL** | Keyboard 19 of 22: every functional step passes, and the 3 fails are the explained D-016/macOS-select items. The inspector opens in view and closes on every jump (15/15, L17). Fails: D-037 (price key unreadable at 1024/1280) and D-038. |
| Functionality and states | PASS | Route-block: 86 of 86 pass at 1440 and 390, including `dispatch_test_vectors`, wasm and the worker. Each case has a scoped alert, RETRY passes `elementFromPoint`, and a real `mouse.click` / `touchscreen.tap` gives exactly one re-fetch and clears the alert (`routeblock/results.json`). D-013 is closed: the banner sits above the nav, clear of headings. |
| AI / analytical | PASS | **D-008** is closed (§P3.3). **D-025** is closed: CISO MAPE is 3.30% vs EIA 6.50%, difference −3.19 pp (95% CI −3.58 to −2.78); the bias-corrected EIA is 6.74%, and the copy now says "removing that bias does not help EIA on the test split (6.74% vs 6.50%)". The drift line is bound to `biasLine()`. 41 of 41 numbers match the regenerated artifacts (`honesty.json`). The CTRL non-preset cost $7,999,909 equals the solver objective, Σ breakdown is within 1e-6, and parity is 108/108 this session. Worker blocked → PRECOMPUTED. The honesty facts hold: CISO 2025 bias −6.36% (the regenerated value), ERCO EIA beats GBM (+1.89 pp, CI +1.55 to +2.28), and the phone verdict cards are equally prominent per card (390: both 176x170 px, title 13 px, mono 11 px; 375 and 360 equal too). |
| Performance | PASS (local; re-measure LCP on Pages per ED #58) | Lighthouse 13, 3 runs per preset at load 9.8 to 12.9 (`lighthouse/summary.jsonl`). **Mobile:** perf 0.99 ×3, LCP 1,803 / 1,813 / 1,813 ms, CLS 0, TBT 0, a11y 1.00, BP 1.00. **Desktop:** perf 1.00 ×3, LCP 490 / 485 / 486 ms, CLS 0.00004. Pacing as above. |
| Responsiveness | **FAIL** | D/T/M remain deliberate compositions at all 7 viewports plus 1280. L1 holds with classic scrollbars (1024 → D/D/D and 768 → T/T/T in 47 + 47 shots, and in all 366 walk rows). D-028 is closed: no `scrollWidth` above the configured width in any harness shot or walk row, and CTRL PRICE stays at 1024 / 1280 / 1440 / 1920. Fails: D-034 (phones), D-037 (1024/1280/768) and D-038 (phones, reduced). |
| Professional quality | PASS | `uv run pytest -q`: 81 passed, including the slow per-year timing tests. `npm run typecheck`: clean. `npm run lint`: clean. `npm test`: 74 passed (10 files). `npx playwright test --workers 1`: 121 passed, 44 skipped (project-gated), 1 flaky, 0 failed (19.4 min, load 6 to 15). The flaky test ("L4 390: evidence", a facts.json alert count) passed on retry and in a serial `--retries 0` rerun at load 10, and my own route-block covers that case, so I class it as load. axe is clean 44 of 44 (normal and reduced, 1440 and 390, after real nav clicks). D-020 docs are deferred by the orchestrator. |
| GitHub / Deployment / Portfolio | BLOCKED | Not in QA scope. |

## P3.2 Defect register

| ID | Sev | Status | Evidence and ruling |
|---|---|---|---|
| D-001 | major | CLOSED | Renewables +50% in PRICE keeps all 24 STACK petals, with surplus shown as a violet outer band and rim. Heat wave, outage and CTRL PRICE match. In the greyscale strip at 240 px, PRICE and STACK share one form (`screenshots/1440x900/s06-05-price-renew.jpg`, `contact-sheets/1920x1080.jpg` f76-77). |
| D-002 | major | CLOSED | At p0.08-0.35, at 1440, 768 and 390, the leaving petals keep their own band gradients, the white core stays in place, and no edge reaches the centre point (`screens/s04-grid-1440.jpg`, `grid-s04-tm.jpg`). Watch: at p0.20 the vacated quarter, bounded at the core edge, reads briefly as a cut-out, but it is clearly an unroll in progress. |
| D-008 | major | CLOSED | `qa-3/probes/solar_timing.py` → `logs/solar_timing.txt`. Per-year, per-month solar centroid is CISO −0.28 to +0.38 h and ERCO −0.09 to +0.45 h. EIA DF best lag is 0 in every year for both BAs. The corrections are per series and per period, documented in `data/manifests/timing_corrections.json` with before/after DF MAPE and identity residuals. On screen, CISO 2025-01-02 16:00-17:00 (the hour containing the 16:55 sunset) shows SOLAR 1,477 MW, and 17:00 shows 70 MW (`logs/visual.json`, `screens/s03a-winter-insp-*`). Every reference day is now symmetric about noon: the sunrise and sunset hours read 0-7% and 1-11%. |
| D-011 | major | CLOSED | The S08 corner labels are backed in every phone frame (`screens/s08-compare.jpg`), and the contrast probe raised no S08 failures. |
| D-012 | minor | CLOSED | Panels fade during pinned hand-offs, and no frame slices the rose (`screens/handoff-1440.jpg`). |
| D-013 | minor | CLOSED | The banner sits above the nav, clear of the h2 (`routeblock/1440-forecast-forecast_eval.jpg`). |
| D-020 | minor | DEFERRED | Not re-tested (the orchestrator deferred it). |
| D-022 | minor | DEFERRED | Not re-tested (the orchestrator deferred it). |
| D-023 | major | CLOSED | S04 opens without the outline (`screenshots/1440x900/s04-00-p00-open.jpg`). In S03b the dotted outline now spans only the daylight hours and tracks hourly demand (`s03b-03-p80-years.jpg`). That faint daylight half-arc is a watch item, not a failure. |
| D-025 | major | CLOSED | See AI row. |
| D-026 | major | CLOSED | Under reduced motion, the nav bar and REPLAY INTRO have opaque black backings over the S07 cards (`screens/cc-grid.png`). axe is clean under reduced motion. |
| D-027 | major | CLOSED | The reduced-motion headline sits on an opaque backing at 1440 and 390 (`screens/cc-s01-reduced-*.png`). |
| D-028 | major | CLOSED | No overflow in any shot or walk row. `probes/ctrlwide.mjs`: price-on `scrollWidth` equals the viewport width at 1024/1280/1440/1920. |
| D-029 | minor | CLOSED | The credit is shown in full on D, T and M. But on phones it causes D-034. |
| D-030 | minor | CLOSED | The hatched SIMULATED chips and the 768 wordmark no longer fall under 4.5:1 in the pixel probe (`logs/contrast.json`). |
| D-031 | minor | CLOSED | `annual_share_by_year` starts at 2021 for both BAs. |
| D-032 | minor | CLOSED | S05 opens with its first two merit-order bands lit over the dim silhouette (`screenshots/1440x900/s05-00-p04-silhouette.jpg`). |
| **D-033** | minor | NEW | **A blank scroll run between S04 and S05.** In 4 to 5 consecutive scroll steps of 0.15 viewport (about 0.6 viewport of scrolling) the frame is 1-2% non-black: only the nav remains, against 9-14% on either side (`screens/trans/1440-forecast-dispatch-03..06.jpg`). It appears at every viewport in the sheets (1440 f58-60, 1920 f58-60, 1280 f57-58, 1024 f57-59, 768 f57-59, 390/375/360 f60-61). This is a side effect of the D-012 fade: the S04 panels fade out before S05 enters. |
| **D-034** | **major** | NEW | **The S08 phone echo is no longer a rose.** At 390/375/360, p0.76, the full 12-line credit block (the D-029 fix) and its scrim start near y≈100. The echo shows only a yellow wash: lit colour is 22.4% / 17.2% / 15.9% of the frame against 46.2% in pass 2, and blue band pixels are **0.0%** against 9.2% in pass 2. No petal or band structure is visible (`screens/s08-compare.jpg`; contact sheets 390/375/360 f107-110). The rose is still drawn at G0 (`stageb.spec.ts` "S08: the echo keeps the rose at G0" passes), so criterion 19's literal diameter metric is met. The failure is that the scrim and credit hide the rose's band structure, so the echo no longer reads as the opening's rose (criterion 17). 768 and 1440 are fine (20.8% blue at 768). Fix direction: on phones, put the credit behind a disclosure, or below the fold after the echo, so the rose keeps the frame. |
| **D-035** | minor | NEW | **Price legend labels break mid-word** at every width: "0 OR BELOW (SURPLUS" with a lone ")" (4 lines), and "VOLL (UNSERVE" / "D)" (3 lines) (`probes/legend.mjs` output, `screens/legend-s06-*.png`, `screenshots/1440x900/s06-05-price-renew.jpg`). |
| **D-036** | minor | NEW | **Landing-position overlaps.** At the CTRL landing, the SIMULATED · YOUR SCENARIO chip sits 8% (1024) and 3% (1440) under the fixed nav, clearing after 120 px of scroll (`probes/ctrlchip.mjs`). At S04 p0 at 360, the canvas "12" label touches the bottom of the PREDICTED chip (`screens/collide-360x800-forecast-0.jpg`). |
| **D-037** | **major** | NEW | **The S06 PRICE colour key is covered.** At 1024x768 and 1280x720 the S06 "SIMULATED · MODEL · PRECOMPUTED · PYTHON HIGHS" chip sits directly on the price legend: the swatches and the 0-25 … 500 labels are hidden, and only "BELOW (SURPLUS )", "VOLL" and "(UNSERVE D)" show (`screens/collide-1024x768-price-stress-0.64.jpg`, `collide-1280x720-price-stress-*.jpg`, `price-legend-1280-crop.jpg`). At 768x1024 the legend overlaps the bottom of the rose, and "VOLL" strikes the canvas "00" label (`collide-768x1024-price-stress-0.64.jpg`). This affects steps 1, 4 and 5 (`logs/collide-price.json`). It violates L2/L3 and L13 (the key must stay readable and clear of marks). It is a regression from the D-028 legend resize: at 7041ca5 the chip sat just above a readable legend at 1024, and the legend sat below the rose at 768 (`screens/d037-before.jpg`, from the builder's `fix-e/after/1024x768/s06-price-heat.jpg` and pass 2's `screenshots/768x1024/s06-06-price-heat.jpg`). |
| **D-038** | **major** | NEW | **Reduced motion on phones: S07 bars overprint their values.** At 360, 375 and 390 under reduced motion (S07 p0.35 and 0.5), the wrapped "PERFECT WEATHER" label overprints the 3.05% (CISO) and 3.85% (ERCO) upper-bound values. The "PREDICTED · UPPER BOUND · NOT AVAILABLE AT FORECAST TIME" chip wraps out of reading order ("· UPPER BOUND · NOT / ◆ PREDICTED AVAILABLE AT FORECAST / TIME"), and "61.2%" runs into "RAW" (`screens/collide-390x844-reduced-evidence-0.35.jpg`, `pw-390-reduce.png`, `logs/collide-reduced.json`). These are honesty-relevant numbers (the not-deployable upper bound), struck by a label: L7/L11. **Pre-existing:** pass 2's frame `qa-2/screenshots/390x844-reduced/s07-02-p35-ex3.jpg` shows the same overprint over 3.11% / 3.85%; pass 2 missed it because its collision check did not cover reduced-motion phone S07. |

Not filed:
- The 1280 CTRL rail scrolls under the fixed nav and corner buttons at landing. That is normal flow, the nav has a dark backing, and the glyphs do not tangle (`screens/collide-1280x720-control-0.jpg`).
- The S04 1024 "legend row vs OBSERVED chip" box touch is a probe artifact: a clipped full-width row box with no visible overlap.
- L16 sub-threshold boxes come from text partly under the opaque nav or pill in flowing reduced pages, from frames where fg equals bg, and from SVG Wires labels whose `fill` survives the backdrop pass.
- The CTRL OUTAGE select ArrowDown is the macOS popup, as in passes 1-2.

## P3.3 Data timing (L20) and honesty

`qa-3/probes/solar_timing.py` (same probe as pass 2) → `logs/solar_timing.txt`:

- **Solar centroid minus solar noon, per year and month:** CISO 2021 +0.26 to +0.36, 2022 −0.25 to +0.38, 2023 −0.25 to −0.08, 2024 −0.28 to −0.04, 2025 −0.21 to −0.09. ERCO −0.09 to +0.45. Every value is within ±0.5 h, and the L20 bound is ±0.75 h.
- **EIA day-ahead MAPE vs demand with DF delayed by k hours:** the best k is 0 in every year 2021-2025 for CISO and ERCO. On the CISO test split, k=0 gives 6.50% and k=+1 gives 7.98%.
- **Reference days:** CISO 2025-01-02 hours 06-07 0%, 07-08 17%, 15-16 64%, 16-17 11%, 17-18 1%, symmetric about noon. The other four CISO days and the four ERCO days are symmetric in the same way.

`honesty.json`: 41 of 41 pass. The data-driven checks cover:
- S00 corner `CISO · 2024-04-20 · PEAK 23,774 MW`.
- Peaks 51,104 MW 2022-09-06 **16:00** and 85,544 MW 2024-08-20 17:00.
- Slope +6.24%/°C (CI 6.01 to 6.49) and shares.
- 937,020 rows in and 936,905 kept.
- Ramp 2,375 MW/h; 26,466 MW → 265 windows.
- S03b May 2025 net-load min 5,457 MW at 14:00, equal to the fuel_mix by-year means.
- S04 CISO 3.30 vs 6.50, −3.19 pp CI −3.58 to −2.78; ERCO 4.12 vs 2.23, +1.89 pp CI +1.55 to +2.28; drift −6.36%; coverage.
- Parity 108/108 with prices 82/82; S05 baseline objective 11,331,535.2499 vs Python 11,331,535.25.
- S06 heat wave $11,331,535 → $38,204,885, 116,492 → 187,537 T, 20,256 MWh unserved, max price $1,000.0.
- CTRL non-preset.
- Wires ILLUSTRATIVE.
- No "live" and no U+2014/U+2015.
- Worker-blocked PRECOMPUTED.
- Per-card phone verdict parity at 390, 375 and 360.

## P3.4 QA_LESSONS L1-L20

| # | Result | Evidence |
|---|---|---|
| L1 | PASS | Classic scrollbars: 1024 → D/D/D and 768 → T/T/T in 47 + 47 shots. js = css = layout in all 366 walk rows. |
| L2 | **FAIL** | D-037 at 1024 and 1280 (PRICE). STACK is clean at 1024 and 1280 in the walk. |
| L3 | **FAIL** | The S06 price colour key is hidden at 1024 and 1280 (D-037). The honesty tags are visible at 360/375/390/768. |
| L4 | PASS | 86/86 route-block cases. |
| L5 | PASS | 0 overflow in 366 walk rows and every harness shot. CTRL PRICE stays at the viewport width at 1024/1280/1440/1920. |
| L6 | PASS | Mobile LCP 1,803-1,813 ms x3 at load 10-13. |
| L7 | **FAIL** | No text under 11 px (366 rows), but labels strike values under reduced motion on phones (D-038). |
| L8 | PASS | The pill and corner buttons are clear at 768/390/375/360 in every frame. |
| L9 | PASS | `elementFromPoint` returns RETRY in all 86 cases, and the destination control in 135 inspector-jump checks. |
| L10 | PASS | The drift sentence is now conditional on the evaluation. No "live". |
| L11 | **FAIL** | D-038 (reduced, phones) and D-034 (phone S08 composition). Normal-motion phones are otherwise clean except the D-036 touch. |
| L12 | PASS | Real-pointer RETRY 86/86 and inspector taps 15/15. |
| L13 | **FAIL** | My own walker found 0 canvas-mark hits with STACK on. With PRICE on at 768, "VOLL" strikes the canvas "00" (D-037). |
| L14 | PASS | The fixed-width check is used, and the fixture is detected (`innerWidth` grows to 604 while `visualViewport` stays 390). |
| L15 | PASS | Every reduced scene has a non-empty figure: the minimum non-black share is 3.3% to 67% at 1440/768/390. |
| L16 | PASS | 3,894 text elements at 120 points; no real failures (artifacts listed above). |
| L17 | PASS | 15/15 at 1440/1024/768/390/360. |
| L18 | PASS | STACK↔PRICE in S06 and CTRL: the legend and rose agree in all 64 frames. |
| L19 | PASS (method) / findings filed | `probes/collide.mjs` builds boxes from the DOM: every visible text run, every interactive element and chip, the fixed nav, pill and corner buttons, and `__peg.marks()`, with no selector lists. Runs: 8 viewports (incl. 1280x720) normal (265 rows), PRICE on (232 rows), and reduced at 1440/768/390/375/360 (166 rows). A fixture with the unlisted class `qa-unlisted-zz` is caught in the normal and PRICE runs. In the reduced run at 1440 no text sat under the fallback point, so that run's self-test is not counted. It found D-037 and D-038, which the builder's L19 e2e misses. |
| L20 | PASS | Per year, per month and per BA, as in §P3.3. |

## P3.5 Method and frames read

- **Harness:** `site/tests/evidence-harness.mjs` with `--out qa-3` and the pass-2 config.
  - Normal runs: 1440, 768, 390, 1920, 1280, 1024, 375, 360. The 1280 run was repeated after the preview server restarted mid-run (4 connection-refused errors in the first run; 0 in the rerun).
  - Reduced runs: 1440, 768, 390.
  - Classic runs: 1024, 768.
  - All runs finished with 0 page errors.
- **Contact sheets read:** all 13 (1920, 1440, 1280, 1024, 768, 390, 375, 360, 1440-reduced, 768-reduced, 390-reduced, 1024-classic, 768-classic).
- **Full-resolution frames read:** more than 50:
  - 1440: S04 (6), S04 p35, S05 open, S06 PRICE renew, S03b, and the S03a 17:00 inspector.
  - Grids: S04 at 768/390 (8), the hand-offs (55 thumbnails), the S04→S05 frames, the L18 swaps, and the contrast crops (8).
  - S08 phone vs pass 2 (6).
  - The PRICE legend at 1024/1280/768 and the CTRL frames at 1024/1280.
  - The S07 reduced phone frame and the route-block S04 frame.
- **Committed evidence:** about 29 MB.
  - Full sets are kept for 1440, 768, 390 and 1440/390 reduced.
  - The other viewports keep their JSON, contact sheet and cited frames.
  - Lighthouse keeps run 1 per preset plus the summary.
  - Recordings are gitignored.

## P3.6 What must change before pass 4

1. **D-034:** on phones, keep the S08 echo rose readable (credit behind a disclosure or after the echo). Test the band-pixel share at p0.76 against pass 2.
2. **D-037:** keep the S06 price legend clear of the SIMULATED chip at 1024-1279 and clear of the rose at 768. Add the PRICE layer to the builder's L2/L13 collision walk.
3. **D-038:** stop the S07 bar labels from wrapping onto values under reduced motion at 360-390, and fix the chip wrap order.
4. **Minors:** D-033, D-035 and D-036; D-020 and D-022 remain deferred.
5. **Lesson candidate (QA cannot edit `QA_LESSONS.md`):** "a fix that changes a component's size (a legend, a credit) must re-run the collision and composition checks in every layer and state that shows it (PRICE on, reduced motion, phones). Both pass-3 regressions (D-034, D-037) came from fixes verified only in the default layer and width." A second candidate, from D-038: "run the collision walk under reduced motion at 360-390 as well; pass 2's normal-motion walk missed an overprint that its own reduced frames showed."
