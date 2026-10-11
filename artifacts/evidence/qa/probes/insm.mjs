import { chromium } from "/Users/rishitmathurrishit/data-frontier/projects/04-pulse-energy-grid/site/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch();
for (const [w,h] of [[390,844],[768,1024]]) for (const sc of ["demand","dispatch","control"]) {
const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w<768, hasTouch: true }); const page = await ctx.newPage();
await page.goto("http://localhost:4331/pulse-energy-grid/?quality=high"); await page.waitForFunction(() => window.__peg); await page.keyboard.press("Escape"); await page.waitForFunction(() => !window.__peg.introStats().playing);
await page.evaluate((s) => window.__peg.jumpTo(s, s==="demand"?0.74:s==="dispatch"?0.8:0), sc); await page.waitForTimeout(3000);
const hit = page.locator(`#${sc} [role=button]`).first(); const bx = await hit.boundingBox();
await page.touchscreen.tap(bx.x + bx.width/2, bx.y + bx.height*0.3); await page.waitForTimeout(1500);
const r = await page.evaluate(() => [...document.querySelectorAll("[role=dialog], .inspector")].map((e) => { const q = e.getBoundingClientRect(); return `${e.className} y=${Math.round(q.y)} h=${Math.round(q.height)} vis=${getComputedStyle(e).visibility} op=${getComputedStyle(e).opacity}`; }));
await page.screenshot({ path: `/Users/rishitmathurrishit/data-frontier/projects/04-pulse-energy-grid/artifacts/evidence/qa/screens/inspector-tap-${sc}-${w}.jpg`, type: "jpeg", quality: 60 });
console.log(w, sc, JSON.stringify(bx), JSON.stringify(r));
await ctx.close(); }
await b.close();
