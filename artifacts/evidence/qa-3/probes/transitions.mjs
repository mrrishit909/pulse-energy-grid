// P04-QA-003 (from the P04-QA-002 probe): (a) D-012 hand-off frames: scroll in small real steps across S02->S03a, S03a->S03b, S05->S06 at 1440 and 768;
// (b) L18: real-pointer click on LAYER PRICE / STACK in S06 and CTRL, then screenshot + legend/unit text every ~40 ms for
// 800 ms; each frame logs which legend is in the DOM (unit text) so it can be read against the drawn rose in the same frame.
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const base = "http://localhost:4331/pulse-energy-grid/";
const D = new URL("../screens/trans/", import.meta.url).pathname; mkdirSync(D, { recursive: true });
const b = await chromium.launch({ headless: false });
const log = {};
for (const [w, h] of [[1440, 900], [768, 1024]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 1024 });
  const page = await ctx.newPage();
  await page.goto(base + "?quality=high"); await page.waitForTimeout(300); await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
  for (const [from, to] of [["source", "demand"], ["demand", "netload"], ["forecast", "dispatch"], ["dispatch", "stress"], ["stress", "evidence"]]) {
    const [y0, y1] = await page.evaluate(([a, c]) => { const top = (i) => scrollY + document.getElementById(i).getBoundingClientRect().top; return [top(c) - innerHeight * 1.2, top(c) + innerHeight * 0.3]; }, [from, to]);
    let k = 0;
    for (let y = y0; y <= y1; y += (y1 - y0) / 10) {
      await page.mouse.wheel(0, 0); await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: "instant" }), y); await page.waitForTimeout(220);
      await page.screenshot({ path: `${D}${w}-${from}-${to}-${String(k++).padStart(2, "0")}.jpg`, type: "jpeg", quality: 50 });
    }
  }
  if (w === 1440) for (const [sid, p] of [["stress", 0.64], ["control", 0]]) {
    await page.evaluate(([i, q]) => window.__peg.jumpTo(i, q), [sid, p]); await page.waitForTimeout(2500);
    for (const target of ["PRICE", "STACK"]) {
      const bx = await page.locator(`#${sid} [role=radio]`, { hasText: new RegExp(`^${target}$`) }).first().boundingBox();
      await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2);
      const frames = [];
      for (let i = 0; i < 16; i++) {
        const t = await page.evaluate((s) => { const sc = document.getElementById(s); return { price: !!sc.querySelector(".price-legend"), unit: sc.querySelector(".price-legend__unit")?.textContent ?? null, stackKey: !!sc.querySelector(".stack-key, [class*=stack-key]"), chip: [...sc.querySelectorAll(".chip")].map((c) => c.textContent.trim()).join(" | ").slice(0, 120) }; }, sid);
        await page.screenshot({ path: `${D}L18-${sid}-${target}-${String(i).padStart(2, "0")}.jpg`, type: "jpeg", quality: 45 });
        frames.push(t);
      }
      log[`${sid}-${target}`] = frames;
    }
  }
  await ctx.close();
}
writeFileSync(new URL("../logs/transitions.json", import.meta.url).pathname, JSON.stringify(log, null, 1));
await b.close();
