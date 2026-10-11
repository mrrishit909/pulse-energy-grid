import { chromium } from "/Users/rishitmathurrishit/data-frontier/projects/04-pulse-energy-grid/site/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch();
for (const rm of ["reduce","no-preference"]) {
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: rm, isMobile: true, hasTouch: true }); const page = await ctx.newPage();
await page.goto("http://localhost:4331/pulse-energy-grid/"); await page.keyboard.press("Escape"); await page.waitForTimeout(3000);
console.log(rm, await page.evaluate(() => [...document.querySelectorAll(".menu-pill, .nav-pill, nav")].map(e => e.className + " pos=" + getComputedStyle(e).position + " y=" + Math.round(e.getBoundingClientRect().y) + " pe=" + getComputedStyle(e).pointerEvents + " op=" + getComputedStyle(e).opacity + " vis=" + getComputedStyle(e).visibility).join(" || ")));
await page.screenshot({ path: `top-390-${rm}.jpg`, type: "jpeg", quality: 60 });
await ctx.close(); }
await b.close();
