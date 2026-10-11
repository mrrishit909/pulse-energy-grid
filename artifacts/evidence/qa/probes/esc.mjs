import { chromium } from "/Users/rishitmathurrishit/data-frontier/projects/04-pulse-energy-grid/site/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch();
for (const [w,h,m] of [[1440,900,false],[390,844,true]]) {
const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: m, hasTouch: m }); const page = await ctx.newPage();
await page.goto("http://localhost:4331/pulse-energy-grid/"); await page.waitForFunction(() => window.__peg); await page.waitForTimeout(500);
const t0 = await page.evaluate(() => window.__peg.introT());
await page.keyboard.press("Escape"); await page.waitForTimeout(600);
const s = await page.evaluate(() => ({ t: window.__peg.introT(), playing: window.__peg.introStats().playing, h1: getComputedStyle(document.querySelector("h1")).filter, skip: !!document.querySelector(".corner-btn:not(.corner-btn--compact)")?.offsetParent }));
// skip via tapping SKIP
console.log(w, "introT before", Math.round(t0), "after Esc+600ms", JSON.stringify(s));
await ctx.close();
const c2 = await b.newContext({ viewport: { width: w, height: h }, isMobile: m, hasTouch: m }); const p2 = await c2.newPage();
await p2.goto("http://localhost:4331/pulse-energy-grid/"); await p2.waitForFunction(() => window.__peg); await p2.waitForTimeout(500);
const btn = p2.getByRole("button", { name: /SKIP INTRO/i }); if (m) await btn.tap(); else await btn.click(); await p2.waitForTimeout(600);
console.log(w, "after SKIP +600ms", JSON.stringify(await p2.evaluate(() => ({ t: window.__peg.introT(), playing: window.__peg.introStats().playing, h1: getComputedStyle(document.querySelector("h1")).filter }))));
await c2.close();
}
await b.close();
