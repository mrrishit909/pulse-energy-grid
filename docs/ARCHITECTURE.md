# Architecture

Two halves joined by a contract: an offline Python pipeline that turns EIA-930 and NOAA files into small versioned JSON artifacts, and a static browser site that reads those artifacts and re-solves the dispatch LP itself (HiGHS WebAssembly in a worker).

```
data/raw (gitignored)        pipelines/ingestion/{eia,noaa,...}   (streamed EBA.zip, ISD CSVs, pglib case; sha256 in data/manifests/)
   -> cleaning + accounting  pipelines/cleaning/                  (UTC grid, flags, <=3 h imputation, ledger)
   -> forecasting            analytics/{forecast,evaluate}.py     (HistGradientBoosting, strict split, CQR intervals)
   -> dispatch LP            analytics/dispatch.py                (HiGHS, reference days, scenarios, 108 parity vectors)
   -> site/public/data/*     pipelines/publish.py                 (tracked JSON, honesty tags per field)
   -> data/contracts/*.json  pipelines/contracts.py               (JSON Schema per artifact)
```

Entry point: `pipelines/run_all.py` (`--fetch` downloads). `pipelines/validate_artifacts.py` checks artifacts against the schemas; `pipelines/methodology.py` generates `docs/METHODOLOGY.md` from the artifacts. Shared paths and constants: `pipelines/common.py`.

## Data contract

`data/contracts/*.schema.json` (generated, 13 schemas) cover the 13 artifacts in `site/public/data/`: demand_profile, dispatch_model, dispatch_results, dispatch_test_vectors, facts, forecast_eval, forecast_samples, fuel_mix, grid_topology, meta, quality, reconciliation, weather_relation. Every artifact is under 400 KB gzip (tested). `facts.json` is the single source of every number in site copy (`src/data/copy.ts`, guarded by `copy.test.ts`). `dispatch_test_vectors.json` carries 108 LP cases with expected objectives, prices and an LP-text hash, used to prove the browser solver matches Python.

## Site (`site/`)

Vite 8, React 18, TypeScript strict, Tailwind CSS v4, Lenis smooth scroll, Canvas 2D graphics (no WebGL, no chart library), self-hosted variable fonts. Base path `/pulse-energy-grid/` (`site/vite.config.ts`), `appType: "mpa"` so a missing artifact is a real 404 as on Pages. Static output, no server, no external requests.

| Area | Files | Role |
|---|---|---|
| Shell | `src/main.tsx`, `src/app/{App,scenes,useIntro,ErrorBoundary}` | Scene registry (`scenes.ts`: ids, track heights, landing points, `built` flag), intro, error boundary |
| Data layer | `src/data/{loader,artifacts,copy,useArtifact}.ts`, `ieee14-layout.json`, `window-city.json` | Typed loaders with initial/loading/ready/empty/error/retry states; copy generated from facts |
| Scroll | `src/scroll/{engine,hooks,Track}` | Tracks register sections; progress computed once per frame |
| Motion | `src/motion/{loop,ease,tween,progress,reveal,useTweened}.ts` | One rAF loop; easing, tweens, stepped progress |
| Graphics | `src/graphics/{rose,orb,canvas}.ts`, `src/scenes/{director,geometry,LiveRose,Still}` | The Day Rose (24-petal area-true polar form) and orb; scene state computed from (scene, progress, time) |
| Model | `src/model/{lp,solve,stack,city,fmt,format,types}.ts` | LP text builder (same CPLEX LP text as Python), solver call, merit-order stack, Window City |
| Solver | `src/workers/solver.worker.ts`, `src/state/solver.ts` | HiGHS-wasm in a **module worker**; cancel, time limit, PRECOMPUTED fallback labelled in the UI |
| State | `src/state/{store,lab,inspector,motion,scenes,solver}.ts` | Shared lab (scenario controls) for S05 and CTRL, Hour Inspector, tier and reduced-motion state |
| Components | `src/components/` | WordReveal, Nav, StoryCard/Deck, Orb, HonestyChip, Tooltip, Sheet, HourInspector, StateUI, NotificationCard |
| Dev | `src/dev/Gallery.tsx` | Component gallery (`npm run build:gallery`), not in the production page |

`highs.wasm` is 1.2 MB gzipped and is fetched lazily at S04 entry (not at first paint); fonts total 172 KB.

### Scene map (`src/app/scenes.ts`, state as of this commit)

| Id | Code | Scene | Code file | State |
|---|---|---|---|---|
| pulse | S01 (S00 intro) | The invisible machine that powers everything | `scenes/S00Pulse.tsx` | built |
| source | S02 | Where every number comes from | | pending |
| demand | S03a | Every window is a hundred megawatts | `scenes/S03aCity.tsx` | built |
| netload | S03b | The sun takes a bite out of noon | | pending |
| forecast | S04 | Tomorrow, unrolled | | pending |
| dispatch | S05 | The cheapest power goes first | `scenes/S05Fill.tsx` | built |
| stress | S06 | Stress the machine | `scenes/S06Stress.tsx` | built |
| evidence | S07 | How we know | | pending |
| control | CTRL | Run tomorrow yourself | `scenes/Ctrl.tsx` | built |
| closing | S08 | The day closes | | pending |

Design and motion details: `docs/VISUAL_DESIGN.md`, `docs/MOTION_SYSTEM.md`.
