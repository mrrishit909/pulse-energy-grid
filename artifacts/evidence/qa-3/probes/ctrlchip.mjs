// P04-QA-003: does the CTRL SIMULATED chip (and stack key) stay hidden under the fixed nav while the visitor scrolls CTRL?
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch();
for (const [w, h] of [[1024, 768], [1280, 720], [1440, 900], [1920, 1080], [768, 1024]]) {
  const page = await (await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 1024 })).newPage();
  await page.goto("http://localhost:4331/pulse-energy-grid/?quality=high"); await page.waitForTimeout(300); await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
  await page.evaluate(() => window.__peg.jumpTo("control", 0)); await page.waitForTimeout(2500);
  const out = [];
  for (const dy of [0, 120, 240, 400, 600]) {
    if (dy) { await page.mouse.wheel(0, dy === 120 ? 120 : dy - [0, 120, 240, 400, 600][[0, 120, 240, 400, 600].indexOf(dy) - 1]); await page.waitForTimeout(700); }
    out.push(await page.evaluate((d) => { const nav = document.querySelector(".nav-bar.is-fixed, .nav-pill.is-fixed, nav"); const n = nav.getBoundingClientRect(); const chip = [...document.querySelectorAll("#control [class*=chip]")].find((c) => /YOUR SCENARIO/.test(c.textContent)); const c = chip.getBoundingClientRect(); const ov = Math.max(0, Math.min(c.bottom, n.bottom) - Math.max(c.top, n.top)) * Math.max(0, Math.min(c.right, n.right) - Math.max(c.left, n.left)); return `dy${d}: chip y ${Math.round(c.top)}-${Math.round(c.bottom)} nav y ${Math.round(n.top)} overlap ${Math.round(100 * ov / (c.width * c.height))}%`; }, dy));
    if (dy === 240) await page.screenshot({ path: new URL(`../screens/ctrl-chip-${w}.jpg`, import.meta.url).pathname, type: "jpeg", quality: 55 });
  }
  console.log(w, out.join(" | "));
}
await b.close();
