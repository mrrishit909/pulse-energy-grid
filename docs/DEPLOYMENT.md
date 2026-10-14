# Deployment

Target: GitHub Pages at https://mrrishit909.github.io/pulse-energy-grid/ (live). Originally the repo did not exist yet; creating it, pushing and deploying were separate, authorized steps.

## How

`scripts/deploy_site_pages.sh <repo-name>` (copy of the shared `~/data-frontier/shared/deployment/deploy_site_pages.sh`):

```bash
scripts/deploy_site_pages.sh pulse-energy-grid
```

It runs `npm run build` in `site/` (which runs `tsc --noEmit` first), writes `site/dist` to a temporary worktree on the `gh-pages` branch with `.nojekyll`, pushes `gh-pages`, then creates or updates the Pages source to `gh-pages` at `/` through the GitHub API using the git credential helper's token. Run it from a clean checkout with an `origin` remote.

Base path `/pulse-energy-grid/` is set in `site/vite.config.ts`; `npm run preview` (`site/tests/serve.mjs`) serves the same path on port 4331.

## Solver assets: no external requests

The HiGHS WebAssembly solver (`highs@1.15.3`, MIT) is bundled by Vite from `node_modules/highs/build/highs.wasm` and served from the site's own assets under `/pulse-energy-grid/assets/`. No CDN, no third-party host, no font service: the e2e suite asserts there are no external requests. The solver runs in a **module worker** (`worker: { format: "es" }`), so the browser must support module workers (all current evergreen browsers do); if the worker or wasm fails to load, the UI falls back to the precomputed result and labels it PRECOMPUTED. The wasm is about 1.2 MB gzipped and is fetched lazily at S04 entry, not at first paint. GitHub Pages compresses it in transit; `__HIGHS_WASM_BYTES__` (raw size, injected at build) keeps the byte-progress bar honest when `Content-Length` is the compressed size.

Artifacts under `/data/*.json` are plain JSON (no pre-gzipped binaries in this project). A missing artifact is a real 404 (`appType: "mpa"`); the loader shows the error and retry state.

## Pre-deploy checklist (the release gate)

1. `uv run pytest -q`, then in `site/`: `npm run typecheck`, `lint`, `test`, `e2e` (includes the 108-vector browser parity run).
2. `npm run build && npm run preview`; screenshots at 1440x900, 768x1024, 390x844 and a scroll recording; an independent QA pass reads the images.
3. Lighthouse and axe on the production build.
4. Deploy, then verify: `curl -sI https://mrrishit909.github.io/pulse-energy-grid/` returns 200; `curl -sI` on `.../data/facts.json` and the hashed `highs-*.wasm` returns 200; take a real screenshot of the live URL.
5. Add the case study to the projects site (`~/data-frontier/portfolio/04-pulse-energy-grid/project.json` is the draft; schema `contracts/portfolio.schema.json`) and verify every link.

Results (2026-10-14): published at https://mrrishit909.github.io/pulse-energy-grid/ (repo https://github.com/mrrishit909/pulse-energy-grid, Pages source gh-pages root). Live checks at 1440 and 390: 20 requests, 0 failed, 0 console errors, 0 external hosts; `data/facts.json` 200. Lighthouse x3 on the live URL (`artifacts/evidence/live/lighthouse/`): mobile performance 0.97 to 0.99, LCP 1,719 to 1,941 ms, CLS 0, accessibility 1.0; desktop performance 1.0, LCP 366 to 425 ms. Case study: https://mrrishit909.github.io/projects/pulse-energy-grid/.

## CI

`.github/workflows/ci.yml` runs on push and pull request; it does not deploy. Deployment stays a manual script so a failing gate cannot publish.

## Rollback

Pages serves the `gh-pages` branch; revert by force-pushing a previous `gh-pages` commit or re-running the script from an earlier tag.
