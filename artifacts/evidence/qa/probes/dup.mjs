import { chromium } from "/Users/rishitmathurrishit/data-frontier/projects/04-pulse-energy-grid/site/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch();
for (const [w,h,f,scene,p] of [[1440,900,"forecast_eval.json","forecast",0.9],[390,844,"fuel_mix.json","netload",0.6]]) {
const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w<768, hasTouch: w<1024 }); const page = await ctx.newPage();
await ctx.route(new RegExp(f), (r) => r.fulfill({ status: 503, body: "" }));
await page.goto("http://localhost:4331/pulse-energy-grid/?quality=high"); await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
await page.evaluate(([s,q]) => window.__peg.jumpTo(s, q), [scene,p]); await page.waitForTimeout(3000);
console.log(w, JSON.stringify(await page.evaluate(() => [...document.body.querySelectorAll("*")].filter((e) => /COULD NOT LOAD/.test(e.textContent) && e.children.length <= 2 && e.getBoundingClientRect().width > 0).map((e) => { const r = e.getBoundingClientRect(); return { tag: e.tagName, cls: e.className, role: e.getAttribute("role"), parent: e.parentElement?.className, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), pos: getComputedStyle(e).position, ppos: e.parentElement && getComputedStyle(e.parentElement).position }; })), null, 0));
}
await b.close();
