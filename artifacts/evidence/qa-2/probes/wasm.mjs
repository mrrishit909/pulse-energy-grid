// P04-QA-002 D-014: count highs.wasm GETs on a normal load into S05, and S04 MODEL toggles per BA (D-022).
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage();
let n = 0; page.on("request", (r) => { if (/\.wasm/.test(r.url())) n++; });
await page.goto("http://localhost:4331/pulse-energy-grid/?quality=high"); await page.waitForTimeout(300); await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
for (const ba of ["CISO", "ERCO"]) { await page.evaluate((x) => window.__peg.setForecast({ ba: x }), ba); await page.evaluate(() => window.__peg.jumpTo("forecast", 0.9)); await page.waitForTimeout(2000);
  console.log(ba, "models:", await page.evaluate(() => [...document.querySelectorAll("#forecast [aria-pressed]")].map((e) => e.textContent.trim()).join(","))); }
await page.evaluate(() => window.__peg.jumpTo("dispatch", 0.8)); await page.waitForFunction(() => window.__peg.solver().parity, null, { timeout: 90000 });
console.log("wasm GETs", n);
await b.close();
