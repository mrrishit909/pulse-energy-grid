import { chromium } from "/Users/rishitmathurrishit/data-frontier/projects/04-pulse-energy-grid/site/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage();
await page.goto("http://localhost:4331/pulse-energy-grid/?quality=high"); await page.waitForFunction(() => window.__peg); await page.keyboard.press("Escape"); await page.waitForFunction(() => !window.__peg.introStats().playing);
const H = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
for (const i of [22, 32, 33, 45, 58, 73]) {
  // approach from above in small steps like the recording
  for (let k = 3; k >= 0; k--) { await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), H * (i - k * 0.33) / 110); await page.waitForTimeout(150); }
  await page.waitForTimeout(250);
  await page.screenshot({ path: `/Users/rishitmathurrishit/data-frontier/projects/04-pulse-energy-grid/artifacts/evidence/qa/screens/scroll-1440-f${i}.jpg`, type: "jpeg", quality: 65 });
  console.log(i, await page.evaluate(() => window.__peg.debug().scene));
}
await b.close();
