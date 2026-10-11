// P04-QA-002 targeted frames: S03a CISO winter readout + OBSERVED inspector at 17:00 (D-008 on screen), S00 end,
// S04 unroll p0.10-0.20 (D-002), S06/CTRL PRICE (D-001) at 1440 / 768 / 390, with the readout text logged.
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
import { writeFileSync } from "node:fs";
const base = "http://localhost:4331/pulse-energy-grid/";
const S = (n) => new URL(`../screens/${n}.jpg`, import.meta.url).pathname;
const b = await chromium.launch({ headless: false });
const log = {};
for (const [w, h] of [[1440, 900], [768, 1024], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 1024 });
  const page = await ctx.newPage();
  await page.goto(base + "?quality=high");
  await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing, null, { timeout: 60000 });
  await page.waitForTimeout(600); await page.screenshot({ path: S(`s00-end-${w}`), type: "jpeg", quality: 70 });
  const go = async (id, p, ms = 1600) => { await page.evaluate(([i, q]) => window.__peg.jumpTo(i, q), [id, p]); await page.waitForTimeout(ms); };
  await page.evaluate(() => window.__peg.setCity({ ba: "CISO", dayId: "winter" }));
  for (const hr of [16, 17]) {
    await go("demand", 0.74); await page.evaluate((x) => window.__peg.openHour("demand", x), hr); await page.waitForTimeout(1200);
    log[`${w}-insp-${hr}`] = await page.evaluate(() => [...document.querySelectorAll("[class*=inspector]")].filter((e) => e.getBoundingClientRect().width > 50).map((e) => e.innerText.replace(/\s+/g, " ").slice(0, 400))[0]);
    await page.screenshot({ path: S(`s03a-winter-insp-${hr}-${w}`), type: "jpeg", quality: 70 });
    await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  }
  for (const p of [0.1, 0.12, 0.15, 0.2]) { await go("forecast", p, 1200); await page.screenshot({ path: S(`s04-p${String(p * 100).padStart(2, "0")}-${w}`), type: "jpeg", quality: 85 }); }
  await page.evaluate(() => window.__peg.setStress({ layer: "price" }));
  for (const [p, n] of [[0.1, "renew"], [0.64, "heat"], [0.82, "outage"]]) { await go("stress", p, 1800); await page.screenshot({ path: S(`s06-price-${n}-${w}`), type: "jpeg", quality: 80 }); }
  await page.evaluate(() => window.__peg.setStress({ layer: "stack" }));
  await ctx.close();
}
writeFileSync(new URL("../logs/visual.json", import.meta.url).pathname, JSON.stringify(log, null, 1));
await b.close();
