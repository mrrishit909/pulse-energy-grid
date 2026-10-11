// P04-QA-003 (from the P04-QA-002 probe): CTRL horizontal overflow at 1024 / 1280 after HEAT WAVE + PRICE (harness shots log scrollW > width).
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch();
for (const [w, h] of [[1024, 768], [1280, 720], [1440, 900], [1920, 1080]]) {
  const page = await (await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 1024 })).newPage();
  await page.goto("http://localhost:4331/pulse-energy-grid/?quality=high"); await page.waitForTimeout(300); await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
  await page.evaluate(() => window.__peg.jumpTo("control", 0)); await page.waitForTimeout(2500);
  const steps = [];
  const sw = async (label) => steps.push(`${label}:${await page.evaluate(() => document.documentElement.scrollWidth)}`);
  await sw("landing");
  const click = async (re) => { const bx = await page.locator("#control button, #control [role=radio]", { hasText: re }).first().boundingBox(); await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2); await page.waitForTimeout(2500); };
  await click(/^HEAT WAVE/); await sw("heat"); await click(/^PRICE$/); await sw("price");
  const wide = await page.evaluate((W) => [...document.querySelectorAll("body *")].filter((e) => { if (e.getBoundingClientRect().right <= W + 1) return false; for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o === "hidden" || o === "clip" || o === "auto" || o === "scroll") return false; } return true; }).map((e) => `${e.tagName}.${String(e.className).slice(0, 40)} right=${Math.round(e.getBoundingClientRect().right)} "${(e.textContent || "").trim().slice(0, 40)}"`).slice(0, 8), w);
  await page.screenshot({ path: new URL(`../screens/ctrl-wide-${w}.jpg`, import.meta.url).pathname, type: "jpeg", quality: 60 });
  console.log(w, steps.join(" "), JSON.stringify(wide));
}
await b.close();
