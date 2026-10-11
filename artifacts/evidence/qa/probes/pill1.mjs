import { chromium } from "/Users/rishitmathurrishit/data-frontier/projects/04-pulse-energy-grid/site/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch();
for (const rm of ["reduce","no-preference"]) {
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: rm, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
await page.goto("http://localhost:4331/pulse-energy-grid/"); await page.keyboard.press("Escape"); await page.waitForTimeout(3000);
const r = await page.locator(".menu-pill").boundingBox();
const info = await page.evaluate(({x,y}) => { const t=document.elementFromPoint(x,y); const p=document.querySelector(".menu-pill"); return {hit: t.className, pe: getComputedStyle(p).pointerEvents, op: getComputedStyle(p).opacity, sy: scrollY}; }, {x:r.x+r.width/2,y:r.y+r.height/2});
await page.mouse.click(r.x+r.width/2, r.y+r.height/2); await page.waitForTimeout(600);
const exp1 = await page.locator(".menu-pill").getAttribute("aria-expanded");
await page.keyboard.press("Escape"); await page.waitForTimeout(300);
await page.touchscreen.tap(r.x+r.width/2, r.y+r.height/2); await page.waitForTimeout(600);
const exp2 = await page.locator(".menu-pill").getAttribute("aria-expanded");
console.log(rm, JSON.stringify(r), JSON.stringify(info), "mouse ->", exp1, "tap ->", exp2);
await ctx.close(); }
await b.close();
