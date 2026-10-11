// P04-QA-003: locate the S07 "PERFECT WEATHER" bar label vs its value under reduced motion on phones; crop at 2x.
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch();
for (const [w, h, rm] of [[360, 800, "reduce"], [390, 844, "reduce"], [390, 844, "no-preference"]]) {
  const page = await (await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, reducedMotion: rm, deviceScaleFactor: 2 })).newPage();
  await page.goto("http://localhost:4331/pulse-energy-grid/?quality=high"); await page.waitForTimeout(400); await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
  await page.evaluate(() => window.__peg.jumpTo("evidence", 0.35)); await page.waitForTimeout(1500);
  const r = await page.evaluate(() => { const el = [...document.querySelectorAll("#evidence *")].find((e) => e.children.length === 0 && e.textContent.trim() === "PERFECT WEATHER" && e.getBoundingClientRect().width > 0); if (!el) return null; el.scrollIntoView({ block: "center" }); const row = el.closest("li, tr, div"); const q = row.parentElement.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height }; });
  await page.waitForTimeout(400);
  const r2 = await page.evaluate(() => { const el = [...document.querySelectorAll("#evidence *")].find((e) => e.children.length === 0 && e.textContent.trim() === "PERFECT WEATHER" && e.getBoundingClientRect().width > 0); const q = el.closest("ul, ol, div").getBoundingClientRect(); return { x: Math.max(0, q.x - 4), y: Math.max(0, q.y - 4), width: Math.min(q.width + 8, innerWidth), height: Math.min(q.height + 8, 300) }; });
  await page.screenshot({ path: new URL(`../screens/pw-${w}-${rm}.png`, import.meta.url).pathname, clip: r2 });
  console.log(w, rm, JSON.stringify(r2));
}
await b.close();
