#!/usr/bin/env node
/**
 * P04-FIXC-001 evidence: the QA walk at every composition the QA lessons name (production build on 4331), plus
 * the L1 classic-scrollbar frames and the L4 scene error banners. Then: python3 tests/contact-sheet.py ../artifacts/evidence/fix-c
 * Usage: node tests/fix-c-capture.mjs [--only 1024x768,...] [--out fix-d --reduced 1] (with --out: the walk only)
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args0 = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean));
const OUT = join(HERE, "..", "..", "artifacts", "evidence", args0.out ?? "fix-c");
const REDUCED = args0.reduced === "1";
const BASE = "http://localhost:4331/pulse-energy-grid/";
const args = args0;
const WALK = [["pulse", 0.9], ["source", 0.36], ["demand", 0.74], ["netload", 0.6], ["forecast", 0.03], ["forecast", 0.5], ["forecast", 0.9], ["dispatch", 0.8], ["stress", 0.1], ["stress", 0.64], ["evidence", 0.95], ["control", 0], ["closing", 0.9]];
const VPS = [[1440, 900], [1280, 720], [1024, 768], [768, 1024], [390, 844], [375, 812], [360, 800]].map(([w, h]) => ({ width: w, height: h, label: `${w}x${h}` }))
  .filter((v) => !args.only || args.only.split(",").includes(v.label));

async function open(page) {
  await page.goto(`${BASE}?quality=high`);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing, null, { timeout: 30000 });
}
const go = async (page, id, p) => { await page.evaluate(([i, q]) => window.__peg.jumpTo(i, q), [id, p]); await page.waitForTimeout(id === "control" ? 1400 : 1100); };

const browser = await chromium.launch();
for (const vp of VPS) {
  const dir = join(OUT, REDUCED ? `${vp.label}-reduced` : vp.label); mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 768, hasTouch: vp.width < 768, reducedMotion: REDUCED ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  await open(page);
  for (const [id, p] of WALK) { await go(page, id, p); await page.screenshot({ path: join(dir, `walk-${String(WALK.findIndex((w) => w[0] === id && w[1] === p)).padStart(2, "0")}-${id}-p${Math.round(p * 100)}.png`) }); }
  await ctx.close();
  // L4: block the forecast's two artifacts; the banner is in view inside the scene, one alert per file
  if (!REDUCED && !args0.out && (vp.width === 1440 || vp.width === 390)) {
    const c2 = await browser.newContext({ viewport: vp, isMobile: vp.width < 768, hasTouch: vp.width < 768 });
    const p2 = await c2.newPage();
    await p2.route(/forecast_(samples|eval)\.json/, (r) => r.fulfill({ status: 503, body: "" }));
    await open(p2); await go(p2, "forecast", 0.9);
    await p2.waitForSelector('[data-scene-errors="forecast"] [role=alert]', { timeout: 20000 });
    await p2.screenshot({ path: join(dir, "l4-forecast-errors.png") });
    await c2.close();
  }
}
await browser.close();
// L1: a classic 15px scrollbar (clientWidth = innerWidth - 15) at the two boundary widths
if (args0.out) process.exit(0);
const b2 = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
for (const [w, h] of [[1024, 768], [768, 1024]]) {
  if (args.only && !args.only.split(",").includes(`${w}x${h}`)) continue;
  const ctx = await b2.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "html { overflow-y: scroll; } ::-webkit-scrollbar { width: 15px; background: #222; }"; document.head.append(s); }));
  const page = await ctx.newPage();
  await open(page);
  for (const [id, p] of [["demand", 0.74], ["forecast", 0.9], ["stress", 0.64]]) { await go(page, id, p); await page.screenshot({ path: join(OUT, `${w}x${h}`, `l1-scrollbar-${id}.png`) }); }
  console.log(`${w}x${h}`, JSON.stringify(await page.evaluate(() => window.__peg.cls())));
  await ctx.close();
}
await b2.close();
