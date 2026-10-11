// P04-QA-002: screenshot the CTRL price legend at 1024 after HEAT WAVE + PRICE (real clicks), scrolled into view.
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1024, height: 768 } })).newPage();
await page.goto("http://localhost:4331/pulse-energy-grid/?quality=high"); await page.waitForTimeout(300); await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
await page.evaluate(() => window.__peg.jumpTo("control", 0)); await page.waitForTimeout(2500);
for (const re of [/^HEAT WAVE/, /^PRICE$/]) { const bx = await page.locator("#control button, #control [role=radio]", { hasText: re }).first().boundingBox(); await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2); await page.waitForTimeout(2500); }
const r = await page.evaluate(() => { const e = document.querySelector("#control .price-legend"); e.scrollIntoView({ block: "center" }); const q = e.getBoundingClientRect(); return { x: q.x, w: q.width, right: q.right, scrollX, sw: document.documentElement.scrollWidth }; });
await page.waitForTimeout(500); console.log(JSON.stringify(r));
await page.screenshot({ path: new URL("../screens/ctrl-wide-legend-1024.jpg", import.meta.url).pathname, type: "jpeg", quality: 70 });
await b.close();
