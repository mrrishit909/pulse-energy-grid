import { chromium } from "/Users/rishitmathurrishit/data-frontier/projects/04-pulse-energy-grid/site/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", isMobile: true, hasTouch: true }); const page = await ctx.newPage();
await page.goto("http://localhost:4331/pulse-energy-grid/");
for (let i = 0; i < 8; i++) { await page.waitForTimeout(700); console.log(i*700, await page.evaluate(() => { const p = document.querySelector(".nav-pill"); return "pill y=" + Math.round(p.getBoundingClientRect().y) + " h=" + Math.round(p.getBoundingClientRect().height) + " vv=" + visualViewport.height + " ih=" + innerHeight + " sy=" + scrollY + " transform=" + getComputedStyle(p).transform + " bottom=" + getComputedStyle(p).bottom; })); }
await page.screenshot({ path: "pill3.jpg", type: "jpeg", quality: 50 });
await b.close();
