// P04-QA-002 L17 / D-005 / D-006: open the Hour Inspector with a REAL pointer (mouse.click on desktop/tablet,
// touchscreen.tap on phones) on the S03a, S05 and CTRL roses; assert the panel/sheet box is in the viewport;
// then jump to every other scene and assert it is gone and the destination's first control passes the L12
// elementFromPoint + real-pointer check.
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
import { writeFileSync } from "node:fs";
const base = "http://localhost:4331/pulse-energy-grid/";
const SC = { demand: 0.74, dispatch: 0.8, control: 0 };
const DEST = [["pulse", 0.9], ["source", 0.36], ["demand", 0.74], ["netload", 0.6], ["forecast", 0.9], ["dispatch", 0.8], ["stress", 0.1], ["evidence", 0.5], ["control", 0], ["closing", 0.97]];
const b = await chromium.launch();
const out = [];
for (const [w, h] of [[1440, 900], [1024, 768], [768, 1024], [390, 844], [360, 800]]) for (const [sc, p] of Object.entries(SC)) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 1024 });
  const page = await ctx.newPage();
  await page.goto(base + "?quality=high"); await page.waitForTimeout(300); await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
  await page.evaluate(([s, q]) => window.__peg.jumpTo(s, q), [sc, p]); await page.waitForTimeout(3000);
  const bx = await page.locator(`#${sc} [role=button]`).first().boundingBox();
  const disc = sc === "control" ? await page.evaluate(() => window.__peg.liveDisc()) : null;
  // aim at a petal: just above the rose centre (noon petal)
  const x = disc ? disc.cx : bx.x + bx.width / 2, y = disc ? disc.cy - disc.tip * 0.5 : bx.y + bx.height * 0.3;
  if (w < 768) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  await page.waitForTimeout(1400);
  const open = await page.evaluate(() => [...document.querySelectorAll(".inspector, [class*=inspector]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 50 && r.height > 30 && getComputedStyle(e).visibility !== "hidden" && +getComputedStyle(e).opacity > 0.1; }).map((e) => { const r = e.getBoundingClientRect(); return { cls: e.className.slice(0, 40), y: Math.round(r.y), bottom: Math.round(r.bottom), inView: r.top < innerHeight - 40 && r.bottom > 40, text: e.innerText.replace(/\s+/g, " ").slice(0, 60) }; })[0] ?? null);
  await page.screenshot({ path: new URL(`../screens/insp-open-${sc}-${w}.jpg`, import.meta.url).pathname, type: "jpeg", quality: 45 });
  const row = { vp: w, scene: sc, open, leaks: [] };
  for (const [d, dp] of DEST) {
    if (d === sc) continue;
    await page.evaluate(([i, q]) => window.__peg.jumpTo(i, q), [d, dp]); await page.waitForTimeout(1300);
    const r = await page.evaluate((did) => {
      const vis = [...document.querySelectorAll(".inspector, [class*=inspector]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 50 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(e).visibility !== "hidden" && +getComputedStyle(e).opacity > 0.1; }).length;
      const btn = [...document.getElementById(did).querySelectorAll("button, a, [role=radio], [role=tab], summary")].find((e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.top >= 0 && r.bottom <= innerHeight - 60 && r.left >= 0 && r.right <= innerWidth && getComputedStyle(e).visibility !== "hidden"; });
      if (!btn) return { vis, ctl: null };
      const q = btn.getBoundingClientRect(); const e = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2);
      return { vis, ctl: (btn.textContent || btn.getAttribute("aria-label") || "").trim().slice(0, 24), hit: e === btn || btn.contains(e), hitEl: e ? e.className?.toString().slice(0, 30) : null };
    }, d);
    if (r.vis || (r.ctl && !r.hit)) row.leaks.push({ d, ...r });
  }
  out.push(row); console.log(JSON.stringify(row));
  await ctx.close();
}
writeFileSync(new URL("../logs/inspector.json", import.meta.url).pathname, JSON.stringify(out, null, 1));
await b.close();
