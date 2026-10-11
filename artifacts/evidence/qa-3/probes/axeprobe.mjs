// P04-QA-003 (from the P04-QA-002 probe): are the two axe contrast findings on screen? (390 normal at load: #303030 scene titles; 1440 reduced S07: nav over orange)
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
const base = "http://localhost:4331/pulse-energy-grid/";
const b = await chromium.launch();
let ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
let page = await ctx.newPage(); await page.goto(base); await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
console.log("390 titles at load", JSON.stringify(await page.evaluate(() => ["demand", "netload", "forecast", "dispatch"].map((i) => { const e = document.getElementById(i + "-title"); const r = e.getBoundingClientRect(); return { i, y: Math.round(r.y), h: Math.round(r.height), color: getComputedStyle(e).color, op: getComputedStyle(e).opacity }; }))));
for (const [id, p] of [["demand", 0.02], ["demand", 0.1], ["netload", 0.02], ["forecast", 0.02]]) {
  await page.evaluate(([i, q]) => window.__peg.jumpTo(i, q), [id, p]); await page.waitForTimeout(1200);
  console.log(id, p, JSON.stringify(await page.evaluate((i) => { const e = document.getElementById(i + "-title"); const r = e.getBoundingClientRect(); return { y: Math.round(r.y), color: getComputedStyle(e).color, op: getComputedStyle(e).opacity, inView: r.bottom > 0 && r.top < innerHeight }; }, id)));
  await page.screenshot({ path: new URL(`../screens/title-${id}-${p}-390.jpg`, import.meta.url).pathname, type: "jpeg", quality: 55 });
}
await ctx.close();
ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
page = await ctx.newPage(); await page.goto(base);
await page.waitForFunction(() => window.__peg); await page.waitForTimeout(2500);
await page.getByRole("link", { name: "EVIDENCE", exact: true }).last().click(); await page.waitForTimeout(2500);
const r = await page.evaluate(() => { const n = document.querySelector(".nav-bar"); const r = n.getBoundingClientRect(); return { y: Math.round(r.y), h: Math.round(r.height), bg: getComputedStyle(n).backgroundColor, under: document.elementsFromPoint(r.x + 30, r.y + r.height / 2).slice(0, 5).map((e) => e.className + " " + getComputedStyle(e).backgroundColor) }; });
console.log("1440 reduced nav", JSON.stringify(r));
await page.screenshot({ path: new URL("../screens/reduced-1440-s07-nav.jpg", import.meta.url).pathname, type: "jpeg", quality: 70 });
await b.close();
