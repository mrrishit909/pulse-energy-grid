# Motion system: Pulse Energy Grid

This is the phase 17 motion bible. It pairs with `VISUAL_DESIGN.md`, and all references point there:

- scene ids S00-S08 and CTRL
- geometry states G0 (giant rose), G1 (aside), G2 (city), G3 (bite), L (week), G4/G5 (fill, stress) and G6 (control)
- interaction numbers 1-11

Every value here is binding for the frontend engineer. A deviation needs a written reason in `docs/ENGINEERING_DECISIONS.md` (the orchestrator owns that file).

## Contents

1. [Global principles and the six motion layers](#1-global-principles-and-the-six-motion-layers)
2. [Hard rules](#2-hard-rules)
3. [Token mapping](#3-token-mapping)
4. [The scroll engine](#4-the-scroll-engine)
5. [Animation specifications](#5-animation-specifications)
6. [Navigation, chapter jumps, interruption](#6-navigation-chapter-jumps-interruption)
7. [Operational state motion](#7-operational-state-motion)
8. [Reduced motion](#8-reduced-motion)
9. [Performance budgets, rendering and the solver](#9-performance-budgets-rendering-and-the-solver)
10. [Technical stack recommendation](#10-technical-stack-recommendation)
11. [Motion test plan](#11-motion-test-plan)

---

## 1. Global principles and the six motion layers

1. **Motion performs the analysis. Nothing moves to decorate.**
   - Bands *fill* in merit order, because that is how dispatch works.
   - The rim *beats* where the price is set.
   - Solar *slides out* of the stack to reveal net load.
   - The day *unrolls* into a week to be compared with forecasts.
   - Windows *light* as megawatts are served.
   - A battery *thins* the evening rim.
2. **Radial, never angular.** Every fill and drain moves along the radius, **all 24 petals at once**. Nothing travels around the circumference: no sweep, no clockwise reveal, no hand, no rotation. Angular motion belongs to clocks, radars and dials (P01, P06).
3. **Two motion modes,** from the reference:
   - **Scrubbed.** A pure function of scroll progress, reversible and stateless: G-state camera moves, the fill, the unroll, card decks, word reveals.
   - **Stepped.** A threshold triggers a timed, retargetable transition: forecast models, net-load switch, year steps, scenarios, the rim beat, argument cards, the echo.
4. **Data is shown only at integer states.** The displayed hour (S03a), month and year (S03b), week, day and scenario are always real values. A change is a crossfade or keyed tween between two real states. No fractional hour or month is held on screen.
5. **Area is the tweened quantity.** Band edges interpolate in `r²` (energy), never `r`. A tween halfway between 20 GW and 40 GW shows 30 GW of area.
6. **One luminous form at a time:**
   - In S00 and S08 it is the giant rose (plus its silhouette bloom at 18%).
   - From S01 to CTRL it is the rose at its scene size. In S07 it dims to 15% behind the cards.
   - The window city is lit only in S03a, and the rose there is at full brightness: they are one composition, the day and its city.
7. **Slow structure, quick data.** Camera moves (G-states) take 800-1200ms or are scrubbed. Data changes (re-solves, scenario steps, month crossfades) take 200-600ms.
8. **Keyed continuity:**
   - every petal is keyed by local hour
   - every band by class id (or fuel code when OBSERVED)
   - every bar in the unroll by the hour index 0-167
   - every window by building and slot
   - every scenario by `scenarios[].id`

   Keyed things travel or re-fill in place. They never swap identity in a crossfade between different positions.
9. **Settle, don't bounce.** There is no overshoot on data marks. Springs (damping ratio 1.0 or more) are allowed only on bottom sheets.
10. **The visitor always wins.** Any input retargets or completes an animation immediately. Nothing queues, nothing blocks scroll, and solves are latest-wins.

### The six motion layers (directive requirement)

| Layer | Where it lives | Spec |
|---|---|---|
| 1. Intro | S00 The Bloom: the giant outline, radial merit-order fill, the rim beat, scrim, headline and nav | 5.1 |
| 2. Navigation transitions | Bottom bar active block, MENU pill, chapter jumps with a stage fade, focus moves | 6 |
| 3. Scroll storytelling | G-state moves, hour scrub and city lighting, month scrub and bite, the unroll, the fill, scenario steps, the echo | 4, 5.3-5.9, 5.13 |
| 4. Component interaction | Sliders, segmented controls, the week crosshair, the inspector, bottom sheets, the CTRL rail | 5.12, 5.14 |
| 5. Data transitions | The re-solve pulse, keyed band tweens in `r²`, ledger numerals, month and year crossfades, the PRICE layer swap | 5.8, 5.10 |
| 6. Microinteractions | Hover, press and focus on squares and chips, slider thumbs, tooltips, the parity ✓, the RESET confirmation | 5.14, 7 |

## 2. Hard rules

Each rule is checked in QA.

| Rule | Test |
|---|---|
| **LCP:** `h1[data-hero]` is in the HTML and painted from first paint as ghost text (opacity 0.55, `filter: blur(12px)`, ENGINEERING_DECISIONS #10), never at opacity 0. The display font is preloaded, with a metric-matched fallback. The rose canvas is created after first paint | Lighthouse: the LCP element is `h1[data-hero]`, LCP is 2.5s or less and CLS is 0.1 or less (mobile and desktop presets) |
| **Nothing heavy on the LCP path.** First paint needs only `facts.json`, `meta.json`, and `dispatch_model.json` (the intro day, DR-1/DR-2). `highs.wasm` (1.21 MB gz) is fetched by the worker **only from S04 entry** (or a CTRL deep link). `dispatch_results`, `forecast_samples` and `dispatch_test_vectors` load at idle after the intro | A Lighthouse waterfall shows no wasm and no `dispatch_results` request before FCP |
| **The solver never runs on the main thread.** It runs in one module worker with a latest-wins queue: at most 1 in flight and 1 pending | DevTools trace: no task over 50ms on the main thread during 20 rapid slider moves |
| **Radial only.** No frame of any fill or drain has petals at different band counts (a debug hook exposes per-petal band count) | Playwright samples 10 frames of S00 and S05 |
| **`r²` tweens.** Band radii are tweened as area | Vitest on the tween helper: the midpoint of 20 and 40 GW gives a radius of `R100 × sqrt(0.3)` |
| Animate only `transform`, `opacity`, and `filter` (at most 14 word spans at once) in the DOM. The canvas draws its own pixels. Never animate layout properties or `backdrop-filter` | A DevTools trace shows no Layout events inside scrubbed frames |
| **One `requestAnimationFrame` loop** owns everything: Lenis, progress, tweens and the canvas draw | Grep finds one `requestAnimationFrame` call site (`src/motion/loop.ts`) |
| **Integer display.** `mix` between two real states is non-zero only during a crossfade of 200ms or less | Vitest on the state controller: after 250ms with no input, `mix` is 0 or 1 |
| No artificial delays, no fake progress, no fake "solving" spinner. The status shows the real solve time | Code review: no `setTimeout` gates any data display |
| No drawing on hidden stages. The canvas redraws only when dirty (progress changed, a tween is active, the bloom is active) | Playwright: with S07 centred, the canvas frame counter is flat for 2s once the Wires card has settled |

## 3. Token mapping

| Token | Value | Used for |
|---|---|---|
| `--motion-fast` | 200ms | Nav hover (reference `0.2s ease-in-out`), tooltips, **hour / month / year crossfades**, pill label swap, the Wires per-branch flash |
| `--motion-standard` | 350ms | Argument card stack (reference `all .35s ease-in-out`), intro completion on input, chapter-jump stage fade, segmented active block, inspector exit |
| `--motion-panel` | 600ms | **The re-solve pulse**, scenario ledger tweens, numeral tweens, NET LOAD slide-out, the rim beat, PRICE/STACK swap, inspector enter |
| `--motion-card` | 800ms | Story-card settle, G-state moves on a jump or a non-scrubbed change, the S04 re-roll |
| `--motion-scene` | 1200ms | **Scenario steps** (reference `transform 1.2s cubic-bezier(.33,1,.68,1)`), intro headline span |
| `--ease-premium` `cubic-bezier(.5,0,0,1)` | | Entrances and departures: cards, nav enter, inspector, S00 outline |
| `--ease-symmetric` `cubic-bezier(.5,0,.5,1)` | | Every scrubbed interpolation (G-state camera, the fill, the unroll), so reverse scroll feels identical |
| `--ease-smooth` `cubic-bezier(.33,1,.68,1)` | | Stepped settles: scenario steps, the re-solve pulse, numeral tweens, word sharpening, S00 band fills |
| `linear` | | Story progress segments, SoC trace draw, the window lighting sweep |
| `ease-in-out` | | Nav hover only (matches the reference) |

These all fall inside the directive's ranges:

| Directive category | Directive range (ms) | Our value (ms) |
|---|---|---|
| Hover | 120-250 | 200 |
| Buttons | 150-300 | 200-350 |
| Panels | 250-600 | 350-600 |
| Charts | 400-1000 | 600-800 |
| Section transitions | 700-1800 | 800-1200 |
| Cinematic | 1000-3000 | 1200, plus the 4.6s composite intro |

## 4. The scroll engine

Reuse the app shell already ported through P01, P02 and P03 (`site/src/motion`, `scroll`, the loader and the nav). Do not rebuild it. The specifics:

- **Tracks.** A `<section>` with the track height from VISUAL_DESIGN 3.1, and a sticky `100dvh` stage inside it. Progress is `p = clamp((scrollY - trackTop) / (trackHeight - innerHeight), 0, 1)` from Lenis's value, with geometry cached and re-measured on resize.
- **Active set.** Only the scene at the viewport centre and the next scene receive `update(p, dt)`. The single canvas is shared by S00-S06, CTRL and S08. Each frame it draws only the active scene's state.
- **Scrubbed** functions take the form `s = ease((p - a) / (b - a))`, clamped. They hold no state.
- **Stepped** thresholds use **hysteresis ±0.02**.
- **Retargetable tweens.** `retarget(to)` restarts from the current value with the full duration. Band tweens retarget per band key in `r²`.
- **Lenis:** `lerp 0.1` on D, native touch scroll on T/M (`syncTouch: false`), and off under reduced motion.

## 5. Animation specifications

Format for each entry:

- **Trigger**
- **Initial → End**
- **Duration / Easing**
- **Sync** (scrubbed or stepped)
- **Interruption**
- **Input**
- **Reduced motion**
- **Performance**

### 5.1 S00 intro: "The Bloom" (4.6s total)

| Time (ms) | What happens | Duration / easing |
|---|---|---|
| 0 | Black. `h1[data-hero]` is painted as ghost text under a 100% black scrim layer (so it is the LCP element but is not seen yet). SKIP INTRO is visible (bottom right) | n/a |
| 200-500 | Corner labels fade in: `PULSE ENERGY GRID` top-left, `{{ba}} · {{date}} · PEAK {{peak}} MW` top-right | 300ms premium |
| 400-900 | **The giant outline:** all 24 petals' demand arcs and spokes, white 1px at 50%, fade in **at full G0 size** (opacity only; no growth from the centre). From this frame on, the rose's visible extent is already giant | 500ms premium |
| 900-3300 | **Radial fill in merit order.** For each band k in the OBSERVED order (SUN, WND, NUC, WAT, IMPORTS, OTH, NG, COL, OIL; empty bands skipped, and their time is redistributed), all 24 petals' band k grows from its inner edge to its outer edge **in `r²`** over 300ms (smooth), with the next band starting 0ms after. The top-right second line steps to the band's name at each start (`linear`, 200ms crossfade). Sink caps and residual outlines appear with the band that creates them | n × 300ms, n ≤ 8 |
| 3300-3800 | **The rim beat:** the outermost band of every petal brightens to +18% lightness and returns | 500ms (250 up smooth, 250 down smooth) |
| 3300-3700 | The bloom layer (blurred silhouette copy) fades from 0 to 18% | 400ms smooth |
| 3600-4300 | The bottom scrim rises (opacity 0 to 1 over the gradient defined in VISUAL_DESIGN 3.3 G0). The headline sharpens word by word (5.2, time-based, 80ms stagger) | 700ms premium |
| 4200-4600 | Nav enters (translateY 16px to 0, opacity). The chip appears bottom-right | 400ms premium |

- **Interruption.** Any wheel, touch-scroll, key or SKIP completes to the end state within 350ms (all remaining bands snap in `r²` together, and the rim beat is skipped). Re-entry within the session starts at the end state.
- **Reduced motion.** The end state renders at once. REPLAY plays the 0ms version.
- **Performance.** One canvas, about 24 x 9 paths per frame. The bloom is pre-rendered once at quarter resolution after the fill completes (not per frame) and composited. The DPR cap is in 9.2.

### 5.2 Word blur reveal (S00 headline, S01 statement, S08 paragraph, statement swaps)

As P01/P03 5.2: words go from ghost (0.55, blur 12px) to sharp (1, 0px), at most 14 spans animating `filter` at once.

- Scrubbed in S01 and S08: each word owns a p sub-range.
- Time-based in S00: 80ms stagger, 350ms per word, smooth.
- **Statement swaps** (S05, S03b): the old line exits (opacity to 0, y −8px, 350ms premium) and the new one reveals.

### 5.3 Rose camera moves (G0 → G1 → G2 → G3, L, G4/G5, G6, and back to G0)

- **Trigger:** scene progress windows (VISUAL_DESIGN 3.4), or a jump.
- **Interpolation.** The centre is linear. `R100` interpolates in **log space**. Hour-label positions follow the petal tips each frame.
- **Sync:** scrubbed, symmetric (S01 0-0.4, S02 final 15%, S03a 0.94-1, S08 0-0.35). On a chapter jump, the target state renders directly (6.2). A non-scrubbed change (resize) snaps.
- **Never:** rotation (the rose's angular frame is fixed in sky orientation forever), and non-uniform scale.
- **Performance:** geometry recomputed per frame is cheap (24 x 9 sectors).

### 5.4 Story-card choreography (S02)

Identical to P03 5.4 (the shared deck): the first card rises from below the fold, then the row translates left so each card centres. The progress segment fills `linear`. Settles are 800ms premium on jumps, otherwise scrubbed. Card 1's petal draws its bands radially (5.8 timing, scrubbed with the card's entry). Card 4's ✓ marks draw (200ms) in sequence.

### 5.5 Hour scrub and city lighting (S03a)

- **Trigger:** scroll p 0.06-0.94 maps to hours 0-23 (integer, `floor`).
- **Hour change:**
  - The previous lifted petal returns and the new one lifts (`translate` along the bisector, 200ms smooth).
  - The readout numerals tween (200ms; the hour text swaps instantly).
  - **The windows:**
    - Rising: newly lit windows switch on in lighting order, **one building at a time**, with a `linear` sweep across the added windows over 200ms. Each window goes from `#1A1A1A` to `#FFF3A6` in 80ms.
    - Falling: windows switch off in reverse order with the same timing.
- **Rapid scrub** (more than 6 hours/s): petals and windows hard-step with no sweep (0ms).
- **GRID / DAY change:** all petals re-fill as a keyed data transition (5.10, 600ms). Windows re-target in one 200ms sweep.
- **Reduced motion:** 4 static frames (VISUAL_DESIGN interaction 2).
- **Performance:** windows redraw only on hour change: 960 rects. Static unlit windows are cached in an offscreen canvas.

### 5.6 Month scrub, the bite, and year steps (S03b)

| p | Motion | Sync |
|---|---|---|
| 0.05-0.55 | Integer month from p. A month change is a **200ms crossfade between the two real month roses** (two cached paths, opacity). It is never a per-petal interpolation, because each month is a real state | scrubbed (month), time-based crossfade |
| 0.55 | **NET LOAD on.** The SUN and WND bands of every petal **slide out radially** (their inner and outer edges tween to the petal tip and fade, 600ms smooth). The remaining bands fall inward to close the gap (`r²` tween, 600ms smooth). Dotted outlines of the removed area draw (stroke-dashoffset, 600ms). Reverse crossing restores | stepped |
| 0.62-0.92 | **Year steps** (5 thresholds). Each step is a 600ms keyed `r²` tween of all bands to the new year's values. The ledger numerals tween 600ms | stepped, hysteresis ±0.02 |

- **Reduced motion:** static frames (VISUAL_DESIGN interaction 3). The LAYER toggle is instant.

### 5.7 Tomorrow, unrolled (S04), the transformation

| p | Motion | Sync |
|---|---|---|
| 0.08-0.40 | **The unroll.** Each petal is drawn as a 4-corner sector with its arcs sampled at 6 points. Every outline point blends from its polar position to its target: `P(t) = lerp(polar(θ, r(MW)), (x(hour), y(MW)), ease_symmetric(t))`, where `x(hour)` is the bar column and `y(MW)` is the bar top. The cut is at **00 (the bottom)**, so the rose opens like a ribbon with 00 on the left and 23 on the right of day 1. Sampled points keep their order, so no petal crosses another | scrubbed, symmetric |
| 0.40-0.52 | Days 2-7 bars rise from the axis (scaleY 0 to 1, origin at the axis, 4ms stagger by hour index). Then the **line forms**: a 2px white path draws through the bar tops (stroke-dashoffset), while the bar bodies fade to 0 | scrubbed |
| 0.55 / 0.68 / 0.80 | Models: (1) naive dotted path draws left to right over 800ms (`linear`) and its MAPE numeral tweens; (2) EIA dashed, the same; (3) our P50 line draws, then the P10-P90 hatch **wipes in left to right** behind it (clip-path 800ms), and the coverage numeral counts up (600ms) | stepped |
| 0.86 | The verdict card enters (translateY 24px to 0, 600ms premium). Calendar squares fill in date order (1ms stagger, 200ms each) | stepped |

- **Interactive** (p ≥ 0.55): WEEK and GRID changes crossfade the whole plot (200ms), and the y scale tweens (600ms). The INTERVAL swap tweens the band edges (600ms). MODEL toggles fade a series (200ms). The crosshair follows the pointer with no lag, snapping to integer hours.
- **Exit re-roll** (p 0.94-1): the inverse of the unroll for the S05 day (or a 350ms fade if that day is not in the week).
- **Reverse:** exact.
- **Reduced motion:** the end state, plus a 3-frame static strip of the unroll.
- **Performance:** 168 bars x 4 corners x 13 points at most during the morph: trivial for Canvas2D.

### 5.8 Fill the day and the re-solve pulse (S05, CTRL, S06 data)

- **The scrubbed fill** (S05 p 0.08-0.60): band k occupies `[0.08 + k·w, 0.08 + (k+1)·w]` with `w = 0.52 / nBands`. Within its window, **all 24 petals'** band k grows from its inner edge to its outer edge in `r²` (symmetric ease). Ledger row k fades in at its window start (opacity, 200ms time-based). Its MWh numeral is scrubbed with the band.
- **The rim beat** (S05 p 0.60, stepped): each petal's `marginal_class` band brightens +18% and returns (600ms smooth). Once per down-crossing.
- **The re-solve pulse** (on every new result: S05 lab, CTRL):
  1. Find the first band (in display order) whose values changed in any petal: k0.
  2. Bands below k0 hold still.
  3. Bands from k0 outward **re-fill radially**: each tweens from its old to its new inner and outer `r²` over 600ms smooth, with a **40ms stagger per band** outward (never per petal).
  4. The outermost band's leading edge carries a 2px `#FF4C25` line for the duration, then it fades (the "energy pulse").
  5. Ledger numerals tween 600ms. Δ lines crossfade 200ms. The SoC trace morphs (25 points, 600ms).
- **Interruption.** A newer result retargets every band from its current `r²`, restarting the pulse. With rapid sliding, the pulse is visible only once the input settles (pulses retarget, they never queue).
- **Preset snap** (solver not ready): the same pulse between `dispatch_results` states.
- **Reduced motion:** instant swap with no pulse line.

### 5.9 Scenario steps (S06)

- **Trigger:** p thresholds (VISUAL_DESIGN S06), or the stepper.
- **Motion:**
  - The scenario's bands tween from the previous state (keyed by class) over **1200ms smooth** (`--motion-scene`, the reference's stepped settle).
  - The dashed baseline ghost never moves.
  - The title swaps (5.2 statement swap).
  - Ledger numerals tween 600ms.
  - An outage class's band shrinks to 0 width in place (and leaves the legend row with a 200ms fade). It never jumps.
- **LAYER STACK ↔ PRICE:** each petal crossfades from its stack to its single price-bin fill (600ms). The legend swaps (200ms).
- **Reverse:** the previous scenario, same timing.

### 5.10 Data transitions (keyed, everywhere)

| Element | Key | Transition |
|---|---|---|
| Rose bands, same day, new values (solve, scenario, GRID/DAY swap with same classes) | (hour, class) | `r²` tween, 600ms smooth (1200ms for scenario steps) |
| Rose, different real state (hour lift, month, year) | hour / month / year | 200ms crossfade between real states (month), or a keyed tween (year, 600ms) |
| A class appearing or disappearing | class | Grows from or shrinks to zero width **at its stack position** (600ms). Outer bands slide in `r²` |
| Numerals (readouts, ledger, inspector) | field id | A 600ms tween, tabular, in a fixed `ch` box. Integers round per frame. Currency and sign are always shown |
| SoC trace | point index 0-24 | Point-wise morph, 600ms |
| Forecast series | series id | 200ms crossfade on week change, 600ms y-scale tween |
| Windows | building, slot | 80ms per window in lighting order |
| Empty data | n/a | Bands drain to the demand outline (600ms). The copy fades in (350ms). Scales keep their last domain |

### 5.11 Argument stack (S07) and The Wires

The argument stack is identical to P01/P03 5.11 (the shared component), with 7 exchanges:

- The objection enters (translateY 40px to 0, 350ms ease-in-out).
- `THE GRID IS TYPING...` appears only during the 350ms between cards (skipped under reduced motion).
- The answer enters offset (+24, +16) on D.
- Older cards dim through the palette (never by opacity below the AA threshold) and scale to 0.96.
- On M, cards older than 2 collapse to slivers.
- **Mini-visuals:** CI bars scaleX from their centre (600ms). Coverage bars scaleX from 0 (600ms, 80ms stagger). Assumption rows fade in (200ms, 40ms stagger). The parity ✓ marks draw (200ms each, in order). Numerals tween.
- **The Wires (answer 4).** The SVG draws buses (opacity, 200ms). Then, in BFS order from bus 1, **per hop** (90ms stagger): each branch at that hop goes `stroke-width` 1 to 3px with stroke `#FF4C25` (200ms), then settles to 2px `#5B6BFF` (350ms smooth). Each newly reached load bus fills from `#192CE4` outline to solid (200ms). Total is about 1.2s for the 14-bus depth. **Nothing moves along a path.**
- **Reverse:** cards retract in order. The Wires stays energized once played.

### 5.12 Control Room (CTRL)

- **Sliders** (D/T): on `input`, update the store's params, render the slider value (instant), and post a solve request (latest-wins). On M, post on `change` (release).
- **Solve lifecycle:**
  - The status line shows `SOLVING` only if the solve exceeds 150ms (no flicker).
  - On a result: run the validation (cost = objective, Σ breakdown, SoC bounds), then the pulse (5.8), then the status `SOLVED IN BROWSER · {{ms}} MS`.
  - On validation failure: the error state (7).
- **Presets:** sliders animate to the preset values (thumb translate 350ms premium), and one solve is posted.
- **GRID / DAY change:** the baseline ghost and rose re-fill (pulse from band 0). The Δ lines reset (200ms).
- **Inspector:**
  - D: enters from the right (x 24px to 0, opacity, 600ms premium).
  - T/M: a bottom sheet (350ms premium, critically damped drag release).
  - The selected petal lifts (200ms). The inspector updates in place on a new result (numerals tween).
- **RESET:** all controls tween to their defaults (350ms), one solve, and the button shows `RESET ✓` for 1.2s.
- **Offscreen:** solves continue only if a request is pending. No pulse is drawn offscreen.

### 5.13 Closing: the day closes (S08)

| p | Motion | Sync |
|---|---|---|
| 0-0.35 | G6 to G0: the centre goes to the frame centre (D 720, 400), and `R100` grows in log space so the peak petal reaches the G0 radius. The scrim fades in | scrubbed, symmetric |
| 0.35-0.65 | Paragraph word reveal (5.2 scrubbed) | scrubbed |
| 0.70 | **The echo** (stepped, once per down-crossing). The corner labels fade in (300ms). **Drain:** bands empty from the rim inward, one band per 150ms, all petals at once (outer edge to inner edge in `r²`). **Re-fill:** the S00 sequence (300ms per band, radial, `r²`), then the rim beat (500ms). The caption fades in (350ms) after the beat. The size never changes during the echo | stepped |
| 0.80-1 | The links fade in (350ms, 60ms stagger) | stepped |

- **Reverse.** Re-crossing above 0.68 resets the echo: the rose is shown full, with no replay. The caption never duplicates.
- **Reduced motion.** The static giant rose with caption and links.
- **Performance.** As S00, including the bloom (pre-rendered once on entry).

### 5.14 Component microinteractions

| Component | Behaviour |
|---|---|
| Square buttons and chips | Hover: background to white and text to black (200ms ease-in-out). Press: scale 0.97 (120ms). Focus: a 2px white outline offset 2px on `:focus-visible` |
| Parameter segmented controls | The active block is **`#192CE4` with white text** and slides between items (Motion `layoutId`, 350ms premium). The nav's active block stays white (shared shell) |
| Sliders | Square 16px thumb. On grab it grows to 20px (200ms), and the filled track left of the thumb is `#192CE4` at 6px tall. `aria-valuetext` gives units. Value text above the thumb while dragging (D) |
| Disabled controls | 50% white and a 45-degree hatch at 25%. No hover motion. The tooltip appears after 80ms |
| Petals (pointer on D) | Hover lifts the petal by `0.0125 × R100` (120ms) and shows a tooltip `{{hh}}:00 · {{MW}} MW`. Click lifts it fully (200ms) and opens the inspector |
| Tooltips | Opacity 0 to 1 and y 4px to 0 (200ms, 80ms delay). Out in 120ms. They follow the pointer at a 12px offset, clamped to the viewport |
| Parity and ledger ✓ / ✗ | The stroke draws over 200ms. ✗ uses `--state-error` and never animates repeatedly |
| Status line | Text crossfade 200ms. The ms number does not tween (it is a measurement) |

## 6. Navigation, chapter jumps, interruption

### 6.1 Nav

The nav is the shared shell, identical to P01/P03 6.1:

- **D bar.** Bottom centre, `--surface-glass` with a static 16px blur, and square 13px mono items. The white active block slides (350ms premium) and hover is 200ms ease-in-out. The right end holds REPLAY INTRO and MOTION ON/OFF.
- **T/M MENU pill.** A 160x32 white pill showing the current label (200ms crossfade). A tap opens a clip-path list upward (300ms premium, 30ms item stagger), and the icon morphs from "=" to "-". Close is 250ms.
- **Labels:** PULSE · SOURCE · DEMAND · NET LOAD · FORECAST · DISPATCH · STRESS · EVIDENCE · CONTROL ROOM. S08 keeps CONTROL ROOM active.

### 6.2 Direct chapter jumps: instant, with a stage fade

We jump instantly (the reference reached its target within 190ms). Smooth-scrolling across S05 would replay the whole fill, which is noise. **Procedure:**

1. `lenis.scrollTo(target, {immediate: true})`.
2. The DOM layer fades in over 350ms. The canvas renders the target state directly.
3. Every stepped state between the old and new positions is resolved without animation.
4. The hash is written with `replaceState` (`#dispatch`). `popstate` jumps the same way.
5. Focus moves to the scene heading.

**Landing progress per scene.** Each value sits at least 0.03 clear of every threshold ± hysteresis.

| Scene | Landing p | Why |
|---|---|---|
| S01 | 0.78 | Statement revealed, cards typing |
| S02 | 0.14 | Card 1 centred |
| S03a | 0.74 | Hour 17 (the evening climb) |
| S03b | 0.48 | A spring month, DEMAND layer |
| S04 | 0.88 | Week formed, all three models, verdict shown |
| S05 | 0.80 | Rose filled, lab live |
| S06 | 0.14 | `renewables_up` settled |
| S07 | 0.05 | First objection |
| CTRL | section top | |

### 6.3 Scroll interruption

| Case | Behaviour |
|---|---|
| Reverse scroll | Scrubbed phases reverse exactly. Steps use hysteresis. Crossfades retarget. |
| Rapid scroll / fling | Hours and months hard-step above 6 per second. Scenario steps go straight to the final state. A scene entered and left within 200ms gets its stepped state set directly. The S05 fill is scrubbed, so a fling simply shows the target fill level. |
| Mid-transition exit | Tweens finish their remaining time, then the scene pauses. A scene re-entered within 1.2s continues from its current values. |
| Resize / orientation | A `ResizeObserver` (debounced 150ms) records the scene and p, snaps tweens, re-measures, recomputes the G-state geometry from the D/T/M table (breakpoints 768 / 1024), resizes the canvas (DPR cap) and restores scrollY. Nothing animates during a resize. |
| Tab hidden | The loop stops. A pending solve finishes in the worker, and its pulse is skipped (the state just updates). |
| Long task | Frames are skipped, never queued. Tweens are time-based. |
| Worker crash | The `error` event moves to the solver error state and keeps the last result. RETRY re-creates the worker (wasm from HTTP cache). After 2 failures, the session is preset-only with the note `LIVE SOLVER DISABLED FOR THIS SESSION`. |

## 7. Operational state motion

| State | Motion |
|---|---|
| **Initial** | The rose's demand outline (white 1px at 50%) if data is ready, otherwise nothing. No shimmer. |
| **Loading** | The mono line `LOADING {ARTIFACT} · {n}%` with real byte progress (jumps, no tween). It fades in (200ms) only if loading lasts 150ms or longer. Solver: `LOADING SOLVER · {n}%` from the streamed wasm bytes. |
| **Ready** | Bands fill radially from the outline (5.8, 600ms, 40ms per band). |
| **Empty** | Bands drain to the outline (600ms). The copy fades in (350ms). Controls stay live. |
| **Error** | The loading line crossfades (200ms) to `COULD NOT LOAD {ARTIFACT} ({reason})` in `--state-error`, plus `RETRY`. No shake. A solver validation failure reads `SOLVER RESULT FAILED A CHECK: {which}` and keeps the last good result. |
| **Retry** | The same fetch or solve re-runs. The button shows `RETRYING`. A second failure adds `(ATTEMPT 2)`. |
| **Disabled** | 50% white plus hatch, `aria-disabled`, and a tooltip with the reason. No hover motion. |
| **Reset** | Values tween to the defaults (350ms controls, then the pulse), and the button shows `RESET ✓` for 1.2s (`aria-live`). |

## 8. Reduced motion

It is triggered by `prefers-reduced-motion: reduce` **or** the MOTION OFF toggle. The tokens zero their durations and blur. In addition:

1. The intro shows its end state at once. REPLAY plays the 0ms version.
2. Lenis is off, and native scroll is used.
3. **Pinned tracks become normal flow:**

| Scene | Static rendering |
|---|---|
| S01 | Statement, the rose at G1, and the cards |
| S02 | 4 cards stacked vertically |
| S03a | 4 frames (03, 09, 15, 19 h) of rose plus skyline: a row on D, 2x2 on T, stacked on M. Controls redraw all 4 |
| S03b | 4 NET LOAD roses (Jan, Apr, Jul, Oct) plus one rose with the live YEAR chips |
| S04 | A 3-frame unroll strip, then the final week plot (fully interactive) |
| S05 | The filled rose with the lab live (instant updates, no pulse) |
| S06 | 5 scenario roses with ledgers in a vertical list |
| S07 | All 7 exchanges as a vertical list; The Wires in its energized state |
| CTRL | Fully functional, instant updates |
| S08 | The static giant rose, caption and links |

4. No bloom fade, no rim beat, no window sweep, no blur and no word reveals.

**Tests (Playwright `reducedMotion: 'reduce'`):**

- The document height is below the pinned height.
- No sticky positioning inside scenes.
- The canvas frame counter is stable after idle.
- Every control still changes the visible state.

## 9. Performance budgets, rendering and the solver

### 9.1 Rendering and solver decisions

**Rendering: Canvas2D only, with no WebGL.**

| Option | Cost | Verdict |
|---|---|---|
| R3F + three.js (MASTER_PLAN default) | About 150-180 KB gz for a flat 2D form | Rejected: nothing here is 3D |
| Raw WebGL2 | Shader complexity for about 220 paths and 960 rects | Rejected: no fill-rate or vertex problem to solve |
| SVG for the rose | Hundreds of path nodes re-written per frame during scrubbed fills, and style recalc | Rejected for the rose. **Used** for the 14-bus card (static topology, about 34 elements) |
| **Canvas2D** | Our own sector-path code (about 4 KB). One canvas, DPR-capped. Dirty-flag redraws | **Chosen** |

**Solver: HiGHS-wasm in a module worker.**

| Option | Size (measured or stated) | Parity with Python (highspy) | Verdict |
|---|---|---|---|
| **highs-js 1.15.3** (HiGHS compiled to wasm) | **Measured 2026-10-10** from the npm tarball: `highs.wasm` 3,531,385 B raw, **1,212,105 B gzip -9**; `highs.mjs` 168 KB raw, 39 KB gzip | Same solver family as the pipeline (`formulation.solver`). Objective parity is certain. Vertex (primal) parity is very likely, but duals on degenerate LPs may differ (DR-11) | **Chosen.** Lazy, in a worker, off the LCP path |
| glpk.js 5.0.0 | 2.6 MB unpacked (npm metadata; gzip not measured) | A different simplex. The objective matches, but degenerate vertices and duals can differ, so parity tests on SoC and dispatch arrays become flaky | Rejected |
| javascript-lp-solver 1.0.3 | 2.4 MB unpacked (npm metadata, includes tests; core much smaller) | A naive JS simplex. Numerical robustness on about 300 variables, and parity on degenerate solutions, are not assured | Rejected (lighter, but the parity risk is the deciding cost) |
| Precomputed only (`dispatch_results`) | 0 | Exact, but only 6 presets | Rejected as the main path; **kept as the fallback** while loading or on error |

- **Loading.** The worker is created at **S04 entry** (or when CTRL is deep-linked). `WebAssembly.instantiateStreaming` reads the wasm with real byte progress. GitHub Pages serves `.wasm` as `application/wasm`; this is verified by the deploy smoke test, with an `arrayBuffer` fallback if the MIME is wrong.
- **LP construction.** The LP is built in TS (`src/model/lp.ts`) as **CPLEX LP text identical to Python's** (`dispatch_model.formulation.variable_order`, `row_order`; `reference_lp.cplex_lp` is the golden file). It is posted to the worker, which calls `highs.solve(text)` and returns columns, row duals, status and wall time.
- **Mapping and validation.** `src/model/result.ts` maps the columns to the `dispatch_results` shape. Before display:
  - cost = objective (1e-6 relative)
  - Σ breakdown = objective
  - SoC within bounds
  - balance per hour (served + unserved = demand, 0.5 MW)
- **Parity on this build.** On worker ready, the client silently runs all `dispatch_test_vectors` (about 24 small LPs) and sets `parity = {passed, n}`. The PARITY badge shows only this real result.

### 9.2 Budgets

| Item | Desktop D | Tablet T / Mobile M | LOW tier |
|---|---|---|---|
| Frame budget | 16.7ms (60fps); JS 6ms or less | 33ms (30fps); JS 10ms or less | same targets |
| Canvas DPR cap | 2 | 1.5 | 1 |
| Paths per rose frame | about 24 x 9 sectors (plus sink, residual and outline) | same | same |
| Bloom | Pre-rendered once per S00/S08 entry at 1/4 resolution, 36px blur, composited at 18% | same, 1/4 resolution | off |
| Windows | 960 rects, redrawn on hour change only. Unlit layer cached | same | no sweep (hard step) |
| Unroll | 168 sectors x 13 sampled points | same (M: 24) | 3-frame snap (t = 0, 0.5, 1) |
| Re-solve | Worker; expected a few ms per LP. **Measured on the build, never claimed here** | same | same |
| Pulse | 600ms, 40ms per band | same | instant |

- **Tier detection.** Measure the median frame time over the first 60 frames after the intro. Above 22ms on D or 40ms on M means LOW. The result is recorded in `window.__pulseQuality`. `?quality=low|high` forces a tier.
- **Offscreen pause.** The canvas draws only when dirty, and draws nothing in S07 except the SVG card.
- **Measured, not claimed.** FPS, LCP, TBT and solve times come only from real runs (Lighthouse desktop and mobile presets, a Playwright trace with frame pacing on a stated device, and the evidence harness).

### 9.3 Loading budget (Lighthouse perf 90+, LCP 2.5s or less, CLS 0.1 or less)

| Resource | Budget (gz / transfer) | When |
|---|---|---|
| HTML + critical CSS (headline, ghost state) | 25 KB or less | first paint |
| Main JS (React, shell, loop, Lenis, Motion lazy core, canvas rose, d3-scale/shape/array subset) | 150 KB or less | deferred module |
| Fonts (2 latin woff2, display preloaded) | 120 KB or less | first paint |
| `facts.json`, `meta.json`, `dispatch_model.json` (with DR-1/DR-2) | 80 KB or less | in parallel with JS |
| `demand_profile`, `fuel_mix` (+ DR-3), `weather_relation`, `reconciliation`, `quality` | 250 KB or less | idle after the intro |
| `forecast_samples`, `forecast_eval` | 150 KB or less | S03b entry |
| `dispatch_results`, `dispatch_test_vectors`, `grid_topology` | 300 KB or less | S04 entry |
| Solver worker: `highs.mjs` 39 KB + `highs.wasm` 1.21 MB | as measured | S04 entry, in the worker |

## 10. Technical stack recommendation

| Layer | Choice | Reason |
|---|---|---|
| App | React 18 + TypeScript strict + Vite, using the shared shell (`site/src/motion`, `scroll`, loader, nav, primitives) | Program standard. No rebuild |
| Styles | `tokens.css` + CSS Modules. Project overrides: `--accent-primary: #192CE4` (fill only), `--accent-secondary: #FF4C25`, `--grid-line: #5B6BFF`, plus the fuel and price-bin variables of VISUAL_DESIGN section 0 | Tokens own the language |
| Scroll | Lenis plus the one rAF loop | Same as P01-P03 |
| GSAP | Not used | The intro is a keyframe table run by the shared tween (P01 decision 6) |
| Component motion | Motion (`motion/react`, `LazyMotion` + `domAnimation`) | `layoutId` active blocks, inspector, sheets |
| Rose, skyline, unroll | **Canvas2D** in `src/canvas/` (`rose.ts` with sector paths and constant-width spokes, `city.ts`, `unroll.ts`) | 9.1 |
| Charts | `d3-scale`, `d3-shape` (lines only), `d3-array`, drawn by our components (week plot, SoC trace, card mini-visuals) | Stays in the visual language, with no chart-library defaults |
| Network card | SVG from `grid_topology.json` + `design/ieee14-layout.json` | 34 static elements |
| Models | `src/model/lp.ts` (CPLEX LP text builder), `result.ts` (mapping and validation), `stack.ts` (display order, sinks, residuals), `city.ts` (window lighting), `netload.ts` | Pure functions, each with Vitest parity against artifact fixtures |
| Solver | `src/workers/solver.worker.ts` (module worker, `highs@1.15.3` pinned, latest-wins) | 9.1 |
| Data | `fetch` with stream progress, plus hand-written type guards from the JSON Schemas | Validation at the trust boundary |

## 11. Motion test plan

Playwright runs against `npm run build && npm run preview` at D, T and M.

1. **Intro.**
   - SKIP is visible at 100ms, and the nav appears within 400ms of the click.
   - A wheel at 1s completes the intro within 400ms.
   - A same-session reload starts at the end state.
   - Under reduced motion, the end state shows in the first screenshot.
2. **LCP and CLS.** In the Lighthouse JSON, the LCP element is `h1[data-hero]`, LCP is 2.5s or less, CLS is 0.1 or less, and no wasm request precedes FCP.
3. **Track release.** At each scene's end plus 10px, the next heading is in view. No traps.
4. **Reverse and rapid.**
   - Fling S01 to S06 and back: the final frames match a direct load (screenshot diff under 0.5%).
   - S06 at p 0.5 shows `battery_big` both forward and backward.
   - S04 at p 0.30, reached in reverse, matches a forward load.
5. **Chapter jumps.** For every nav item: scrollY lands within 2px of the landing progress within 200ms, the hash updates, back/forward work, and focus is on the heading.
6. **Resize mid-scene.** At S05 p 0.40, resize 1440 to 390: the scene and p are preserved within ±0.01, there are no console errors, and the G4-M geometry matches the table.
7. **Radial-only rule.** In 10 sampled frames each of S00 900-3300ms, S05 p 0.08-0.60 and the S08 echo, every petal has the same band count (debug hook).
8. **Area rule.** Debug hook at S05 p 0.6: for 3 petals, `(r_out² − r_in²) / R100² × 100,000` equals the class MW within 0.5%.
9. **Integer rule.** During slow S03a and S03b scrubs, sampled `mix` values are 0 or 1 whenever no change happened in the previous 250ms.
10. **Unroll geometry.** At S04 t = 0 and t = 1, debug-hook vertices are within 1px of their polar and linear targets.
11. **Solver.**
    - The worker loads only after S04 entry (network log).
    - All parity vectors pass on the build (badge equals the test result).
    - 20 rapid slider moves leave at most 1 in-flight and 1 pending request, the final rose equals the final params' result, and no main-thread task exceeds 50ms.
    - A forced worker error shows the error state and keeps the last result.
12. **CTRL scroll safety.** On M, a vertical swipe starting on a slider scrolls the page. Sliders change only on a horizontal drag.
13. **Reduced motion.** No sticky in scenes, no animated filter, a stable canvas counter, and every control still works.
14. **Pause offscreen.** With S07 centred (after the Wires settle), the canvas frame counter is flat for 2s.
15. **Giant geometry and P01/P02/P03 confusion check (QA evidence).**
    - A debug hook reports the peak petal radius at or above the G0 value (D 620, T 620, M 530) from 400ms into S00 to its end, never decreasing, and again at S08 p 0.75.
    - The evidence harness writes `artifacts/evidence/<stage>/p01-p02-p03-vs-p04-open-close.png`: S00 frames (0.5s, 1.5s, 3s, end) and S08 frames (p 0.3, 0.75, 0.9) of all four sites, at D and M.
    - An independent QA reviewer confirms that no P04 frame shows a stroked ring, nodes on a circumference, chords, a smooth glow disc, a small orb or marker, a cell surface, or a rising horizon arc. Rejection criteria 2, 4 and 19 apply. (The design-time version of this sheet is `design/sketches/distinctness-sheet.png`.)
16. **Frame pacing** (evidence harness). Scroll recordings at D and M report p50/p95 frame times on a stated device and browser, plus solve times from the status line. These are recorded, never estimated.
