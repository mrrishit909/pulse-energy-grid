// Rasterizes the P04 sketches and P02's S00 orb sketch with Playwright Chromium, then the Python step composes
// distinctness-sheet.png (P01 real frame | P02 S00 sketch | P04 S00 sketch | P04 S03a sketch).
// Run from the repo root with any project's Playwright, e.g.:
//   NODE_PATH=../01-atlas-human-mobility/site/node_modules node design/sketches/render_sheet.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(new URL(import.meta.url).pathname);
const jobs = [
  [path.join(here, 'rose-s00-d.svg'), path.join(here, 'rose-s00-d.png')],
  [path.join(here, 'city-s03a-d.svg'), path.join(here, 'city-s03a-d.png')],
  [path.resolve(here, '../../../02-market-microstructure-lab/design/sketches/orb-s00-d.svg'), path.join(here, '_p02-orb-s00-d.png')],
];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const [src, out] of jobs) {
  await page.goto('file://' + src);
  await page.screenshot({ path: out });
}
await browser.close();
// Then: python3 design/sketches/compose_sheet.py
