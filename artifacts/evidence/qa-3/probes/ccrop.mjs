// P04-QA-003 (from the P04-QA-002 probe) L16 adjudication: full-resolution frames at the contrast candidates (text visible), cropped around the boxes.
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
import { execFileSync } from "node:child_process";
const base = "http://localhost:4331/pulse-energy-grid/";
const C = [ // [w,h,reduced,scene,p,label,crop x,y,w,h]
  [768, 1024, false, "pulse", 0.02, "s00-corner-768", 0, 0, 380, 120],
  [768, 1024, false, "dispatch", 0.8, "s05-chip-768", 40, 130, 420, 80],
  [390, 844, false, "evidence", 0.8, "s07-chip-390", 20, 640, 360, 160],
  [390, 844, true, "pulse", 0.78, "s01-reduced-390", 0, 150, 390, 420],
  [1440, 900, true, "pulse", 0.78, "s01-reduced-1440", 0, 0, 1440, 900],
  [390, 844, true, "source", 0.58, "s02-reduced-390", 0, 600, 390, 244],
  [390, 844, true, "evidence", 0.5, "s07-corner-reduced-390", 200, 700, 190, 144],
  [1440, 900, true, "netload", 0.8, "s03b-nav-reduced-1440", 240, 840, 960, 60],
  [1440, 900, true, "evidence", 0.5, "s07-nav-reduced-1440", 0, 600, 1440, 300],
];
const b = await chromium.launch({ headless: false });
for (const [w, h, rm, sc, p, label, cx, cy, cw, ch] of C) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 1024, reducedMotion: rm ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  await page.goto(base + "?quality=high"); await page.waitForTimeout(300); await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
  await page.evaluate(([i, q]) => window.__peg.jumpTo(i, q), [sc, p]); await page.waitForTimeout(2000);
  const f = new URL(`../screens/cc-${label}.png`, import.meta.url).pathname;
  await page.screenshot({ path: f, clip: { x: cx, y: cy, width: cw, height: ch } });
  await ctx.close();
}
await b.close();
