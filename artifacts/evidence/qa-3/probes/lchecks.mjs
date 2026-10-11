// P04-QA-003 (from the P04-QA-002 probe) independent L-checks over a scene walk (3 progress points per pinned scene):
//  L5/L14 overflow: documentElement.scrollWidth and every element's right edge vs the CONFIGURED viewport width (not innerWidth),
//         plus visualViewport.width and innerWidth logged (under isMobile innerWidth grows with overflow);
//  L7 11px floor: visible text nodes with computed font-size < 11;
//  L13 canvas marks (__peg.marks()) vs visible DOM text boxes (own walker, not the builder's helper);
//  L1 js class == css class.
// Self-test: a deliberately overflowing fixture (a 600px div at 390) must be reported.
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
import { writeFileSync } from "node:fs";
const base = "http://localhost:4331/pulse-energy-grid/";
const WALK = [["pulse", [0.3, 0.78]], ["source", [0.14, 0.58, 0.8]], ["demand", [0.2, 0.74, 0.9]], ["netload", [0.3, 0.6, 0.8]], ["forecast", [0.03, 0.15, 0.5, 0.9]],
  ["dispatch", [0.04, 0.4, 0.8]], ["stress", [0.1, 0.64]], ["evidence", [0.05, 0.5, 0.8, 0.95]], ["control", [0]], ["closing", [0.5, 0.76, 0.97]]];
const VPS = process.argv[2] ? process.argv[2].split(",") : ["1920x1080", "1440x900", "1280x720", "1024x768", "768x1024", "390x844", "375x812", "360x800"];
const reduced = process.argv.includes("--reduced");
const b = await chromium.launch();
const out = [];
const measure = (W) => {
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight) return null; for (let n = e; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < 0.05) return null; } return r; };
  const over = []; const small = []; const texts = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const el = n.parentElement; if (!n.textContent.trim() || !el || el.closest(".sr-only, [aria-hidden=true], details:not([open]) table, svg title")) continue;
    const r0 = vis(el); if (!r0) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) {
      if (r.width < 1 || r.bottom < 0 || r.top > innerHeight) continue;
      if (r.right > W + 1) over.push(`${n.textContent.trim().slice(0, 30)} right=${Math.round(r.right)}`);
      texts.push({ t: n.textContent.trim().slice(0, 30), x: r.left, y: r.top + r.height * 0.2, w: r.width, h: r.height * 0.6 });
    }
    const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 11) small.push(`${n.textContent.trim().slice(0, 30)} ${fs}px`);
  }
  const marks = window.__peg.marks();
  const inter = (a, c) => Math.max(0, Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)) * Math.max(0, Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y));
  const hits = [];
  for (const m of marks) for (const t of texts) if (inter(m, t) > 4) hits.push(`"${t.t}" x ${m.name}`);
  const cls = window.__peg.cls();
  return { scrollW: document.documentElement.scrollWidth, innerW: innerWidth, vvW: Math.round(visualViewport.width), overText: over.slice(0, 5), small: [...new Set(small)].slice(0, 5), marks: marks.length, markHits: [...new Set(hits)].slice(0, 6), cls: `${cls.js}/${cls.css}/${cls.layout}` };
};
for (const vp of VPS) {
  const [w, h] = vp.split("x").map(Number);
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 1024, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  await page.goto(base + "?quality=high"); await page.waitForTimeout(400); await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing, null, { timeout: 60000 });
  for (const [id, ps] of WALK) for (const p of ps) {
    await page.evaluate(([i, q]) => window.__peg.jumpTo(i, q), [id, p]); await page.waitForTimeout(reduced ? 900 : 1300);
    const r = await page.evaluate(measure, w);
    const row = { vp: vp + (reduced ? "-reduced" : ""), scene: id, p, ...r, overflow: r.scrollW > w || r.overText.length > 0 };
    out.push(row);
    if (row.overflow || r.small.length || r.markHits.length || r.cls.split("/")[0] !== r.cls.split("/")[1]) console.log(JSON.stringify(row));
  }
  if (vp === "390x844") { // fixture: the L14 check must fail on a real overflow
    await page.evaluate(() => { const d = document.createElement("div"); d.id = "qa-fixture"; d.textContent = "OVERFLOW FIXTURE"; d.style.cssText = "position:absolute;left:0;top:10px;width:600px;white-space:nowrap;padding-left:450px"; document.body.append(d); });
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
    const r = await page.evaluate(measure, w);
    out.push({ vp, scene: "FIXTURE", ...r, overflow: r.scrollW > w || r.overText.length > 0 });
    console.log("fixture", JSON.stringify({ scrollW: r.scrollW, innerW: r.innerW, vvW: r.vvW, detected: r.scrollW > w || r.overText.length > 0 }));
  }
  await ctx.close();
}
writeFileSync(new URL(`../logs/lchecks${reduced ? "-reduced" : ""}.json`, import.meta.url).pathname, JSON.stringify(out, null, 1));
console.log("rows", out.length, "overflow", out.filter((r) => r.overflow && r.scene !== "FIXTURE").length, "small", out.filter((r) => r.small.length).length, "markHits", out.filter((r) => r.markHits.length).length);
await b.close();
