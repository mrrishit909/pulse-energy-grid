import type { Page } from "@playwright/test";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Scenes and the progress points every QA walk visits (landing points plus the states that carry the most text). */
export const WALK: [string, number][] = [
  ["pulse", 0.0], ["pulse", 0.9], ["source", 0.14], ["source", 0.36], ["source", 0.58], ["source", 0.8], ["demand", 0.74], ["netload", 0.3], ["netload", 0.6], ["netload", 0.95],
  ["forecast", 0.03], ["forecast", 0.5], ["forecast", 0.9], ["dispatch", 0.34], ["dispatch", 0.8], ["stress", 0.1], ["stress", 0.64], ["evidence", 0.05], ["evidence", 0.95], ["control", 0], ["closing", 0.9],
];

export async function openSite(page: Page, query = "?quality=high") {
  await page.goto(query);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => (window as any).__peg && !(window as any).__peg.introStats().playing);
}
export async function goScene(page: Page, id: string, p: number) {
  await page.evaluate(([i, q]) => (window as any).__peg.jumpTo(i, q), [id, p] as const);
  await page.waitForTimeout(id === "control" ? 900 : 700);
}

/**
 * L2 collisions in the scene on screen: every visible text run, chip and control against every other (DOM vs DOM),
 * and text without an opaque backing against the drawn rose's disc. Returns readable descriptions.
 */
export function collisions(page: Page, id: string, debug = false) {
  return page.evaluate(([sid, dbg]) => {
    const vw = innerWidth, vh = innerHeight;
    const scope = sid === "control" ? document.getElementById(sid)! : document.getElementById(sid)!.querySelector(".stage")!;
    const roots = [scope, ...document.querySelectorAll(".nav-bar.is-fixed, .nav-pill.is-fixed, .corner-btn")];
    const eff = (e: Element) => { let o = 1; for (let n: Element | null = e; n; n = n.parentElement) { const cs = getComputedStyle(n); o *= Number(cs.opacity); if (cs.visibility === "hidden" || cs.display === "none") return 0; } return o; };
    const backed = (e: Element) => { for (let n: Element | null = e; n && n !== scope; n = n.parentElement) { const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(n).backgroundColor); if (m) { const a = m[1]!.split(",").map(Number); if ((a[3] ?? 1) >= 0.7) return true; } } return false; };
    type B = { el: Element; r: DOMRect; name: string; backed: boolean };
    const boxes: B[] = [];
    const seen = new Set<Element>();
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement!;
        if (!n.textContent?.trim() || eff(el) < 0.05 || el.closest("svg, .sr-only, [aria-hidden=true] .wr, details:not([open]) table")) continue;
        // a story deck scrolls cards past the viewport by design: only the centred card is read
        const card = el.closest(".story-card");
        if (card) { const cr = card.getBoundingClientRect(); if (!(cr.left < vw / 2 && cr.right > vw / 2)) continue; }
        const hit = el.closest("button, a, label, select, .chip, [role=radio], [role=tab]");
        const ctl = hit ?? el;
        if (seen.has(ctl)) continue;
        seen.add(ctl);
        const rg = document.createRange(); rg.selectNodeContents(n);
        // ellipsised or clipped text: its box, not the full run; glyph boxes are inset 20% vertically (line boxes touch by design)
        const clipped = getComputedStyle(el).overflow === "hidden" || getComputedStyle(el).textOverflow === "ellipsis";
        const run = !hit && !clipped;
        // a control or chip is its full painted box; a bare text run is its glyph band
        const rects = run ? [...rg.getClientRects()].map((r) => new DOMRect(r.left, r.top + r.height * 0.2, r.width, r.height * 0.6)) : [ctl.getBoundingClientRect()];
        for (const r of rects) if (r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < vh) boxes.push({ el: ctl, r, name: (ctl.textContent ?? "").trim().slice(0, 32), backed: backed(ctl) });
      }
    }
    for (const c of root2controls()) { if (!seen.has(c) && eff(c) > 0.05) { const r = c.getBoundingClientRect(); if (r.width > 1 && r.bottom > 0 && r.top < vh) boxes.push({ el: c, r, name: c.getAttribute("aria-label") ?? c.tagName, backed: true }); } }
    function root2controls() { return [...scope.querySelectorAll("input[type=range], select")]; }
    if (dbg) return boxes.map((b) => `${b.name} ${Math.round(b.r.left)}..${Math.round(b.r.right)} ${Math.round(b.r.top)}-${Math.round(b.r.bottom)}`);
    // a scene in normal flow (CTRL, every scene under reduced motion) scrolls under the fixed nav like any page
    const flow = sid === "control" || getComputedStyle(scope).position !== "sticky";
    const out: string[] = [];
    const inter = (a: DOMRect, b: DOMRect) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i]!;
      if (a.r.left < -1 || a.r.right > vw + 1) out.push(`offscreen "${a.name}" (${Math.round(a.r.left)}..${Math.round(a.r.right)})`);
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j]!;
        if (a.el.contains(b.el) || b.el.contains(a.el) || a.el === b.el) continue;
        const isNav = (e: Element) => !!e.closest(".nav-bar, .nav-pill, .corner-btn");
        if (flow && isNav(a.el) !== isNav(b.el)) continue;
        if (inter(a.r, b.r) > 4) out.push(`"${a.name}" x "${b.name}"`);
      }
    }
    // text over the rose (scenes where the rose and text share the frame): only text without an opaque backing counts
    const log = (window as any).__peg.rose(), view = (window as any).__peg.view();
    if (log && view && ["demand", "netload", "dispatch", "stress"].includes(sid)) {
      const tip = Math.max(...log.petals.map((p: any) => p.tip)) * 0.96;
      for (const b of boxes) {
        if (b.backed) continue;
        const nx = Math.max(b.r.left, Math.min(view.cx, b.r.right)), ny = Math.max(b.r.top, Math.min(view.cy, b.r.bottom));
        if (Math.hypot(nx - view.cx, ny - view.cy) < tip) out.push(`"${b.name}" over the rose`);
      }
    }
    return [...new Set(out)];
  }, [id, debug] as const);
}
