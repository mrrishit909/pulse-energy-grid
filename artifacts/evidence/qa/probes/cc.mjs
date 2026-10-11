import { chromium } from "/Users/rishitmathurrishit/data-frontier/projects/04-pulse-energy-grid/site/node_modules/@playwright/test/index.mjs";
import AxeBuilder from "/Users/rishitmathurrishit/data-frontier/projects/04-pulse-energy-grid/site/node_modules/@axe-core/playwright/dist/index.mjs";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }); const page = await ctx.newPage();
await page.goto("http://localhost:4331/pulse-energy-grid/"); await page.waitForTimeout(3000);
const r = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();
for (const v of r.violations) for (const n of v.nodes) console.log(v.id, n.target.join(" "), "|", n.any.map((a) => a.message).join(";"), "|", n.html.slice(0, 100));
await page.screenshot({ path: "../screens/rm-top.jpg", type: "jpeg" });
await b.close();
