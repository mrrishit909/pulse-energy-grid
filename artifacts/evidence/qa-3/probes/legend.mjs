// P04-QA-003: crop the price legend (S06 and CTRL, PRICE on) at each width; log label line counts (mid-word breaks).
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch(); const res = [];
for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720], [1024, 768], [768, 1024], [390, 844], [360, 800]]) {
  const page = await (await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 1024 })).newPage();
  await page.goto("http://localhost:4331/pulse-energy-grid/?quality=high"); await page.waitForTimeout(300); await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
  await page.evaluate(() => { window.__peg.setStress({ layer: "price" }); window.__peg.jumpTo("stress", 0.1); }); await page.waitForTimeout(2000);
  const sel = "#stress .price-legend";
  const info = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { box: [r.x, r.y, r.width, r.height].map(Math.round), labels: [...e.querySelectorAll(".price-legend__edges span, .price-legend__edges > *")].map((x) => { const rg = document.createRange(); rg.selectNodeContents(x); const lines = new Set([...rg.getClientRects()].map((q) => Math.round(q.top))).size; return `${x.textContent.trim()}:${lines}`; }) }; }, sel);
  if (info) { const [x, y, ww, hh] = info.box; await page.screenshot({ path: new URL(`../screens/legend-s06-${w}.png`, import.meta.url).pathname, clip: { x: Math.max(0, x - 4), y: Math.max(0, y - 4), width: Math.min(ww + 8, w), height: hh + 8 } }); }
  res.push({ w, info }); console.log(w, JSON.stringify(info));
}
await b.close();
