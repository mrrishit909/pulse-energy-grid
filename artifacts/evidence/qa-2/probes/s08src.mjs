import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto("http://localhost:4331/pulse-energy-grid/"); await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
await page.evaluate(() => window.__peg.jumpTo("closing", 0.97)); await page.waitForTimeout(2000);
console.log(await page.evaluate(() => { const t = [...document.querySelectorAll("#closing *")].find((e) => e.children.length === 0 && /Source: U\.S\. Energy/.test(e.textContent)); const chain = []; for (let n = t; n && n.id !== "closing"; n = n.parentElement) { const cs = getComputedStyle(n); chain.push(`${n.tagName}.${n.className} ov=${cs.overflow} pos=${cs.position} w=${Math.round(n.getBoundingClientRect().width)} x=${Math.round(n.getBoundingClientRect().x)}`); } return chain.join("\n"); }));
await b.close();
