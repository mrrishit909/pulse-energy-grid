import { chromium } from "/Users/rishitmathurrishit/data-frontier/projects/04-pulse-energy-grid/site/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch();
for (const [w,h] of [[390,844],[375,812],[360,800],[768,1024]]) for (const rm of ["reduce","no-preference"]) {
const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: rm, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
await page.goto("http://localhost:4331/pulse-energy-grid/"); await page.waitForFunction(() => window.__peg); await page.keyboard.press("Escape"); await page.waitForTimeout(2500);
const r = await page.evaluate(() => { const vw = innerWidth; const wide = [...document.body.querySelectorAll("*")].map((e) => [e, e.getBoundingClientRect()]).filter(([e, r]) => r.right > 391 && r.width > 0).sort((a, b) => b[1].right - a[1].right).slice(0, 4).map(([e, r]) => `${e.tagName}.${String(e.className).slice(0, 40)} right=${Math.round(r.right)}`); return { innerW: innerWidth, innerH: innerHeight, vvW: visualViewport.width, scrollW: document.documentElement.scrollWidth, wide }; });
console.log(w, rm, JSON.stringify(r));
await ctx.close(); }
await b.close();
