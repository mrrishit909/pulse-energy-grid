import { chromium } from "/Users/rishitmathurrishit/data-frontier/projects/04-pulse-energy-grid/site/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", isMobile: true, hasTouch: true }); const page = await ctx.newPage();
await page.goto("http://localhost:4331/pulse-energy-grid/"); await page.waitForTimeout(3000);
console.log(await page.evaluate(() => [...document.body.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > 392 && e.getBoundingClientRect().width > 0).map((e) => `${e.closest("section")?.id} ${e.tagName}.${String(e.className).slice(0,30)} "${e.textContent.trim().slice(0,50)}" right=${Math.round(e.getBoundingClientRect().right)}`).join("\n")));
const el = page.locator("#evidence .chip__detail").filter({ hasText: "NOT AVAILABLE" }).first();
await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
await page.screenshot({ path: "/Users/rishitmathurrishit/data-frontier/projects/04-pulse-energy-grid/artifacts/evidence/qa/screens/reduced-390-s07-overflow.jpg", type: "jpeg", quality: 60 });
await b.close();
