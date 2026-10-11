#!/usr/bin/env node
/**
 * P04-FIXE-001 evidence: the frames the QA report cites, at 1440, 1024, 768, 390, 360 (+ reduced motion), into
 * artifacts/evidence/fix-e/<label>/<vp>/. Production build on 4331. Then: python3 tests/contact-sheet.py <dir>
 * Usage: node tests/fix-e-capture.mjs --label after [--only 1440x900,...] [--reduced 1] [--shots s04,s06,...]
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean));
const REDUCED = args.reduced === "1";
const OUT = join(HERE, "..", "..", "artifacts", "evidence", "fix-e", args.label ?? "after");
const BASE = args.base ?? "http://localhost:4331/pulse-energy-grid/";
const VPS = [[1440, 900], [1024, 768], [768, 1024], [390, 844], [360, 800]].map(([w, h]) => ({ width: w, height: h, label: `${w}x${h}` }))
  .filter((v) => !args.only || args.only.split(",").includes(v.label));
const peg = (page, fn, a) => page.evaluate(fn, a);
const jump = (page, id, p) => peg(page, ([i, q]) => window.__peg.jumpTo(i, q), [id, p]);

/** [group, name, scene, progress, setup?] */
const SHOTS = [
  ["s03b", "s03b-p99-end", "netload", 0.99],
  ["s04", "s04-p00-open", "forecast", 0.0],
  ["s04", "s04-p03", "forecast", 0.03],
  ["s04", "s04-p12-unroll", "forecast", 0.12],
  ["s04", "s04-p15-unroll", "forecast", 0.15],
  ["s04", "s04-p25-unroll", "forecast", 0.25],
  ["s04", "s04-p35-unroll", "forecast", 0.35],
  ["s04", "s04-p90-verdict", "forecast", 0.9],
  ["s04", "s04-p90-verdict-erco", "forecast", 0.9, (p) => peg(p, () => window.__peg.setForecast({ ba: "ERCO" }))],
  ["s06", "s06-price-renew", "stress", 0.1, (p) => peg(p, () => window.__peg.setStress({ ba: "CISO", dayId: "summer", layer: "price" }))],
  ["s06", "s06-price-heat", "stress", 0.64, (p) => peg(p, () => window.__peg.setStress({ ba: "CISO", dayId: "summer", layer: "price" }))],
  ["s06", "s06-price-outage", "stress", 0.82, (p) => peg(p, () => window.__peg.setStress({ ba: "CISO", dayId: "summer", layer: "price" }))],
  ["s06", "s06-stack-heat", "stress", 0.64, (p) => peg(p, () => window.__peg.setStress({ ba: "CISO", dayId: "summer", layer: "stack" }))],
  ["ctrl", "ctrl-landing", "control", 0],
  ["ctrl", "ctrl-price-heatwave", "control", 0, async (p) => {
    await p.waitForFunction(() => window.__peg.ctrl().source === "browser", null, { timeout: 60000 }).catch(() => {});
    await p.locator(".ctrl [role=radiogroup][aria-label=LAYER] [role=radio]", { hasText: "PRICE" }).first().click({ force: true }).catch(() => {});
    await peg(p, () => window.__peg.setCtrl({ heat_wave_c: 5 }));
  }],
  ["s03a", "s03a-p74", "demand", 0.74],
  ["s05", "s05-p80", "dispatch", 0.8],
  ["s07", "s07-p50", "evidence", 0.5],
  ["s07", "s07-p95", "evidence", 0.95],
  ["s08", "s08-p76-echo", "closing", 0.76],
  ["s08", "s08-p97", "closing", 0.97],
].filter((s) => !args.shots || args.shots.split(",").includes(s[0]));

const browser = await chromium.launch();
for (const vp of VPS) {
  const dir = join(OUT, REDUCED ? `${vp.label}-reduced` : vp.label); mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 768, hasTouch: vp.width < 768, reducedMotion: REDUCED ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}?quality=high`);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__peg.ready(["fuel_mix.json", "demand_profile.json", "forecast_samples.json", "dispatch_results.json"]), null, { timeout: 60000 }).catch(() => {});
  for (const [, name, id, p, setup] of SHOTS) {
    await jump(page, id, p); await page.waitForTimeout(700);
    if (setup) { await setup(page); await jump(page, id, p); }
    await page.waitForTimeout(id === "control" ? 1600 : 1100);
    await page.screenshot({ path: join(dir, `${name}.png`) });
  }
  await ctx.close();
}
await browser.close();
