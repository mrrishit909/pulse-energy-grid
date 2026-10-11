// P04-QA-003 L2/L11/L13/L19 collision probe, independent of the builder's helper. The box list is generated from the DOM:
//  - every visible text node -> its glyph-band rects (Range client rects, inset 20% vertically), owner = parent element;
//  - every visible interactive element or chip (button, a, input, select, summary, [role=button|radio|tab|switch|slider],
//    [tabindex], anything whose class contains "chip") -> full box;
//  - fixed / sticky-positioned elements with text or controls (nav bar, pill, corner buttons, banners) are included
//    automatically because they are visible DOM elements; they are tagged FIXED;
//  - canvas label/mark hooks from window.__peg.marks().
// A pair collides when the intersection is > 4 px^2 and neither owner contains the other. Each hit is classified:
//  "pinned" (both in a sticky/pinned stage, or a fixed element over a pinned stage: always a defect),
//  "flow-under-fixed" (flowing content under a fixed element with an opaque backing: normal scrolling, reported only),
//  "flow-under-fixed-unbacked" (fixed element without opaque backing over flowing text: defect),
//  "flow" (two flowing elements: defect).
// Self-test: an element with an unlisted class name ("qa-unlisted-zz") placed over the first visible heading must be caught.
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
import { writeFileSync } from "node:fs";
const base = "http://localhost:4331/pulse-energy-grid/";
const WALK = [["pulse", 0.02], ["pulse", 0.3], ["pulse", 0.78], ["source", 0.14], ["source", 0.36], ["source", 0.58], ["source", 0.8], ["demand", 0.2], ["demand", 0.74], ["demand", 0.9],
  ["netload", 0.15], ["netload", 0.3], ["netload", 0.6], ["netload", 0.8], ["forecast", 0.0], ["forecast", 0.12], ["forecast", 0.5], ["forecast", 0.9], ["dispatch", 0.04], ["dispatch", 0.4], ["dispatch", 0.8],
  ["stress", 0.1], ["stress", 0.64], ["stress", 0.82], ["evidence", 0.05], ["evidence", 0.35], ["evidence", 0.5], ["evidence", 0.8], ["evidence", 0.95], ["control", 0], ["closing", 0.5], ["closing", 0.76], ["closing", 0.97]];
const args = process.argv.slice(2);
const VPS = (args.find((a) => /^\d/.test(a)) ?? "1920x1080,1440x900,1280x720,1024x768,768x1024,390x844,375x812,360x800").split(",");
const reduced = args.includes("--reduced");
const price = args.includes("--price");
function measure(fixtureOnly) {
  const vw = innerWidth, vh = innerHeight;
  const effOp = (e) => { let o = 1; for (let n = e; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden") return 0; o *= +cs.opacity; } return o; };
  const fixedAnc = (e) => { for (let n = e; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === "fixed") return n; } return null; };
  const pinned = (e) => { for (let n = e; n && n !== document.body; n = n.parentElement) { if (getComputedStyle(n).position === "sticky") return true; } return false; };
  const backed = (e) => { for (let n = e; n && n !== document.body; n = n.parentElement) { const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(n).backgroundColor); if (m) { const a = m[1].split(",").map(Number); if ((a[3] ?? 1) >= 0.85) return true; } if (getComputedStyle(n).position === "fixed") break; } return false; };
  const boxes = [];
  const add = (owner, r, name, kind) => { if (r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw) boxes.push({ owner, r: { l: r.left, t: r.top, r: r.right, b: r.bottom }, name, kind }); };
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const el = n.parentElement; if (!el || !n.textContent.trim() || el.closest(".sr-only, [aria-hidden=true], details:not([open]) table, title, script, style")) continue;
    if (effOp(el) < 0.3) continue;
    const card = el.closest(".story-card"); if (card) { const cr = card.getBoundingClientRect(); if (!(cr.left < vw / 2 && cr.right > vw / 2)) continue; }
    const ctl = el.closest("button, a, label, select, summary, [role=button], [role=radio], [role=tab], [class*=chip]");
    const owner = ctl ?? el;
    if (ctl) { add(owner, ctl.getBoundingClientRect(), (ctl.textContent || "").trim().slice(0, 28), "ctl"); continue; }
    const rg = document.createRange(); rg.selectNodeContents(n);
    const clip = getComputedStyle(el).overflow === "hidden";
    if (clip) { add(owner, el.getBoundingClientRect(), n.textContent.trim().slice(0, 28), "text"); continue; }
    for (const q of rg.getClientRects()) add(owner, new DOMRect(q.left, q.top + q.height * 0.2, q.width, q.height * 0.6), n.textContent.trim().slice(0, 28), "text");
  }
  for (const c of document.querySelectorAll("button, a[href], input, select, summary, [role=button], [role=radio], [role=tab], [role=switch], [role=slider], [tabindex]:not([tabindex='-1']), [class*=chip]")) {
    if (effOp(c) < 0.3 || c.closest("[aria-hidden=true]")) continue; { const q = c.getBoundingClientRect(); if (!(c.textContent || "").trim() && q.width * q.height > 20000) continue; } // figure hit areas (aria-label only, over a canvas) are targets, checked by L9 elementFromPoint, not text
    add(c, c.getBoundingClientRect(), c.getAttribute("aria-label") || (c.textContent || "").trim().slice(0, 28) || c.tagName, "ctl");
  }
  const marks = window.__peg?.marks?.() ?? [];
  const markOwner = { mark: true };
  for (const m of marks) add(markOwner, new DOMRect(m.x, m.y, m.w, m.h), "canvas " + m.name, "mark");
  const hits = [];
  const seen = new Set();
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.owner === b.owner || a.owner.mark && b.owner.mark) continue;
    if (!a.owner.mark && !b.owner.mark && (a.owner.contains(b.owner) || b.owner.contains(a.owner))) continue;
    const w = Math.min(a.r.r, b.r.r) - Math.max(a.r.l, b.r.l), h = Math.min(a.r.b, b.r.b) - Math.max(a.r.t, b.r.t);
    if (w <= 0 || h <= 0 || w * h <= 4) continue;
    const fa = a.owner.mark ? null : fixedAnc(a.owner), fb = b.owner.mark ? null : fixedAnc(b.owner);
    let cls;
    if (fa && fb) cls = fa === fb ? "fixed-internal" : "fixed-vs-fixed";
    else if (fa || fb) { const f = fa ? a : b, o = fa ? b : a; cls = !o.owner.mark && pinned(o.owner) ? "fixed-over-pinned" : backed(f.owner) ? "flow-under-fixed" : "flow-under-fixed-unbacked"; }
    else cls = (!a.owner.mark && pinned(a.owner)) || (!b.owner.mark && pinned(b.owner)) ? "pinned" : "flow";
    const key = `${cls}|${a.name}|${b.name}`; if (seen.has(key)) continue; seen.add(key);
    hits.push({ cls, a: a.name, b: b.name, area: Math.round(w * h), at: [Math.round(Math.max(a.r.l, b.r.l)), Math.round(Math.max(a.r.t, b.r.t))] });
  }
  return { n: boxes.length, marks: marks.length, hits: fixtureOnly ? hits.filter((x) => /QA FIXTURE/.test(x.a + x.b)) : hits };
}
const b = await chromium.launch();
const out = [];
for (const vp of VPS) {
  const [w, h] = vp.split("x").map(Number);
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 1024, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  await page.goto(base + "?quality=high"); await page.waitForTimeout(300); await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing, null, { timeout: 60000 });
  if (price) await page.evaluate(() => window.__peg.setStress({ layer: "price" }));
  for (const [id, p] of WALK) {
    await page.evaluate(([i, q]) => window.__peg.jumpTo(i, q), [id, p]); await page.waitForTimeout(reduced ? 900 : 1300);
    if (price && id === "control") { for (const t of ["HEAT WAVE", "PRICE"]) { const bx = await page.locator("#control button, #control [role=radio]", { hasText: new RegExp(`^${t}`) }).first().boundingBox().catch(() => null); if (bx) { await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2); await page.waitForTimeout(1500); } } await page.evaluate(() => window.__peg.jumpTo("control", 0)); await page.waitForTimeout(800); }
    const r = await page.evaluate(measure, false);
    const defects = r.hits.filter((x) => !["flow-under-fixed", "fixed-internal"].includes(x.cls));
    const row = { vp: vp + (reduced ? "-reduced" : "") + (price ? "-price" : ""), scene: id, p, boxes: r.n, marks: r.marks, defects, flowUnderFixed: r.hits.filter((x) => x.cls === "flow-under-fixed").length };
    out.push(row);
    if (defects.length) { console.log(JSON.stringify(row).slice(0, 900)); await page.screenshot({ path: new URL(`../screens/collide-${row.vp}-${id}-${p}.jpg`, import.meta.url).pathname, type: "jpeg", quality: 55 }); }
  }
  if (vp === VPS[0]) { // L19 self-test
    await page.evaluate(() => window.__peg.jumpTo("demand", 0.74)); await page.waitForTimeout(1200);
    await page.evaluate(() => { const hd = [...document.querySelectorAll("h1,h2,h3,p")].find((e) => { const r = e.getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight && r.width > 0; }); const r = hd ? hd.getBoundingClientRect() : new DOMRect(90, 90, 200, 40); const d = document.createElement("span"); d.className = "qa-unlisted-zz"; d.textContent = "QA FIXTURE"; d.style.cssText = `position:absolute;left:${r.left + scrollX + 10}px;top:${r.top + scrollY + 10}px;font:14px monospace;color:#fff;z-index:9`; document.body.append(d); });
    const f = await page.evaluate(measure, true);
    out.push({ vp, scene: "FIXTURE", caught: f.hits.length > 0, hits: f.hits.slice(0, 3) });
    console.log("fixture", vp, JSON.stringify(f.hits.slice(0, 2)));
  }
  await ctx.close();
}
const tag = `${reduced ? "-reduced" : ""}${price ? "-price" : ""}`;
writeFileSync(new URL(`../logs/collide${tag}.json`, import.meta.url).pathname, JSON.stringify(out, null, 1));
console.log("rows", out.length, "rows with defects", out.filter((r) => r.defects?.length).length);
await b.close();
