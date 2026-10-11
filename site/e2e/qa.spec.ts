/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Pre-QA hardening (P04-FIXC-001): one test per QA_LESSONS item L1-L9 (L6 is Lighthouse, L10 is the copy test in Vitest).
 * Runs once (desktop project); each test opens its own contexts at the viewports its lesson names.
 */
import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { WALK, collisions, goScene, openSite } from "./qa";

test.skip(({ isMobile }) => isMobile, "viewports are set per test");
test.describe.configure({ timeout: 300_000 });

const VP = (w: number, h: number) => ({ width: w, height: h });
async function at(browser: Browser, vp: { width: number; height: number }, opts: { reduced?: boolean } = {}) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 768, hasTouch: vp.width < 768, reducedMotion: opts.reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  return { ctx, page };
}
const SCENES = [...new Set(WALK.map(([id]) => id))];

test("L1: classic 15px scrollbar at 1024x768 and 768x1024: JS class == CSS class == layout class, and no collisions", async () => {
  const b = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
  try {
    for (const vp of [VP(1024, 768), VP(768, 1024)]) {
      const ctx = await b.newContext({ viewport: vp, baseURL: "http://localhost:4331/pulse-energy-grid/" });
      await ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        s.textContent = "html { overflow-y: scroll; } ::-webkit-scrollbar { width: 15px; background: #222; }";
        document.head.append(s);
      }));
      const page = await ctx.newPage();
      await openSite(page);
      const c = await page.evaluate(() => (window as any).__peg.cls());
      expect(c.innerWidth - c.clientWidth, "a classic scrollbar is showing").toBeGreaterThanOrEqual(15);
      expect(c.js, JSON.stringify(c)).toBe(c.css);
      expect(c.layout, JSON.stringify(c)).toBe(c.css);
      const bad: string[] = [];
      for (const [id, p] of WALK) { await goScene(page, id, p); for (const x of await collisions(page, id)) bad.push(`${vp.width} ${id}@${p}: ${x}`); }
      expect(bad).toEqual([]);
      await ctx.close();
    }
  } finally { await b.close(); }
});

test("L2: no text, chip or control collisions in any scene at 1024x768, 1280x720, 768x1024 and 390x844", async ({ browser }) => {
  const bad: string[] = [];
  for (const vp of [VP(1024, 768), VP(1280, 720), VP(768, 1024), VP(390, 844)]) {
    const { ctx, page } = await at(browser, vp);
    await openSite(page);
    for (const [id, p] of WALK) { await goScene(page, id, p); for (const x of await collisions(page, id)) bad.push(`${vp.width}x${vp.height} ${id}@${p}: ${x}`); }
    await ctx.close();
  }
  expect(bad).toEqual([]);
});

/** Visible (opacity, visibility, display) and inside the viewport. */
const visibleIn = (page: Page, root: string, sel: string) => page.evaluate(([r, s]) => {
  const vw = innerWidth, vh = innerHeight;
  const on = (e: Element) => { for (let n: Element | null = e; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false; } return true; };
  return [...document.querySelectorAll(`${r} ${s}`)].filter((e) => { const b = e.getBoundingClientRect(); return on(e) && b.width > 0 && b.left >= 0 && b.right <= vw && b.top >= 0 && b.bottom <= vh; }).length;
}, [root, sel] as const);

const TAGGED: [string, number, boolean][] = [
  // scene, progress, has a rose with fuel colours (needs a colour key)
  ["pulse", 0.9, false], ["demand", 0.74, true], ["netload", 0.6, true], ["forecast", 0.5, false], ["forecast", 0.9, false],
  ["dispatch", 0.8, true], ["stress", 0.1, true], ["control", 0, true],
];
test("L3: every visual keeps a visible, in-viewport honesty tag (and every rose a colour key) at 360/375/390/768", async ({ browser }) => {
  const bad: string[] = [];
  for (const w of [360, 375, 390, 768]) {
    const { ctx, page } = await at(browser, VP(w, w < 768 ? 844 : 1024));
    await openSite(page);
    for (const [id, p, key] of TAGGED) {
      await goScene(page, id, p);
      const root = id === "pulse" ? "body" : `#${id}`;
      if (!(await visibleIn(page, root, ".chip"))) bad.push(`${w} ${id}@${p}: no visible tag`);
      if (key && !(await visibleIn(page, root, ".stack-key li, .stack-legend li, .price-legend, .ledger .swatch"))) bad.push(`${w} ${id}@${p}: no visible colour key`);
    }
    await ctx.close();
  }
  expect(bad).toEqual([]);
  // and no stylesheet hides a tag or a key at any breakpoint
  const dir = new URL("../src/styles/", import.meta.url).pathname;
  const css = readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf-8")).join("\n");
  const hides = [...css.matchAll(/([^{}]+)\{[^}]*display:\s*none/g)].map((m) => m[1]!.trim()).filter((s) => /chip|stack-key|stack-legend|price-legend|swatch/.test(s));
  expect(hides).toEqual([]);
});

test("L5: no sideways scroll in any scene, normal and reduced motion, at 360/375/390/768", async ({ browser }) => {
  const bad: string[] = [];
  for (const reduced of [false, true]) {
    for (const w of [360, 375, 390, 768]) {
      const { ctx, page } = await at(browser, VP(w, w < 768 ? 844 : 1024), { reduced });
      await openSite(page);
      for (const id of SCENES) {
        await goScene(page, id, 0.5);
        const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, iw: innerWidth }));
        if (Math.max(r.sw, r.bw) > r.iw) bad.push(`${reduced ? "reduced" : "motion"} ${w} ${id}: ${Math.max(r.sw, r.bw)} > ${r.iw}`);
      }
      await ctx.close();
    }
  }
  expect(bad).toEqual([]);
});

test("L7: every visible text node is at least 11 CSS px (SVG text measured on screen) at 1440, 768 and 390", async ({ browser }) => {
  const bad: string[] = [];
  for (const vp of [VP(1440, 900), VP(768, 1024), VP(390, 844)]) {
    const { ctx, page } = await at(browser, vp);
    await openSite(page);
    for (const [id, p] of WALK) {
      await goScene(page, id, p);
      const small = await page.evaluate(() => {
        const vh = innerHeight, out: string[] = [];
        const on = (e: Element) => { for (let n: Element | null = e; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false; } return true; };
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          const el = n.parentElement!;
          if (!n.textContent?.trim() || el.closest(".sr-only, script, style, title")) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.bottom < 0 || r.top > vh || !on(el)) continue;
          let px = parseFloat(getComputedStyle(el).fontSize);
          const svg = el.closest("svg");
          if (svg && svg.viewBox.baseVal && svg.viewBox.baseVal.width) px *= svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
          if (px < 10.95) out.push(`"${n.textContent.trim().slice(0, 24)}" ${px.toFixed(1)}px`);
        }
        return [...new Set(out)];
      });
      for (const s of small) bad.push(`${vp.width} ${id}@${p}: ${s}`);
    }
    await ctx.close();
  }
  expect(bad).toEqual([]);
});

test("L8: SKIP INTRO and REPLAY INTRO clear the nav pill by >= 8px at 768/390/375/360", async ({ browser }) => {
  const gap = (page: Page, sel: string) => page.evaluate((s) => {
    const a = document.querySelector(s)!.getBoundingClientRect(), b = document.querySelector(".nav-pill.is-fixed")!.getBoundingClientRect();
    const dx = Math.max(b.left - a.right, a.left - b.right), dy = Math.max(b.top - a.bottom, a.top - b.bottom);
    return Math.max(dx, dy);
  }, sel);
  for (const w of [768, 390, 375, 360]) {
    const { ctx, page } = await at(browser, VP(w, w < 768 ? 844 : 1024));
    await page.goto("?quality=high");
    const skip = page.locator(".corner-btn", { hasText: "SKIP" });
    if (await skip.isVisible().catch(() => false)) expect(await gap(page, ".corner-btn:not(.corner-btn--compact)"), `${w} skip`).toBeGreaterThanOrEqual(8);
    await openSite(page);
    await goScene(page, "demand", 0.5);
    await expect(page.locator(".corner-btn--compact")).toBeVisible();
    expect(await gap(page, ".corner-btn--compact"), `${w} replay`).toBeGreaterThanOrEqual(8);
    await ctx.close();
  }
});

test("L9: every visible control is the topmost element at its centre (no canvas hit area over it) at 1440 and 390", async ({ browser }) => {
  const bad: string[] = [];
  for (const vp of [VP(1440, 900), VP(390, 844)]) {
    const { ctx, page } = await at(browser, vp);
    await openSite(page);
    for (const [id, p] of WALK) {
      await goScene(page, id, p);
      const hidden = await page.evaluate((sid) => {
        const vw = innerWidth, vh = innerHeight, out: string[] = [];
        const on = (e: Element) => { for (let n: Element | null = e; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05 || cs.pointerEvents === "none") return false; } return true; };
        const root = document.getElementById(sid)!;
        for (const c of root.querySelectorAll("button, a[href], select, input, [role=radio], [role=tab], summary")) {
          const r = c.getBoundingClientRect();
          const x = r.left + r.width / 2, y = r.top + r.height / 2;
          if (r.width < 2 || x < 0 || x > vw || y < 0 || y > vh || !on(c) || c.closest("[inert]")) continue;
          // controls under the fixed nav are scrolled content (CTRL is normal flow), not hit-area bugs
          const top = document.elementFromPoint(x, y);
          if (top && top.closest(".nav-bar, .nav-pill, .corner-btn, .scene-errors")) continue;
          if (!top || !(top === c || c.contains(top) || top.contains(c) && top.closest("label") === c.closest("label"))) out.push(`${(c.textContent || c.getAttribute("aria-label") || c.tagName).trim().slice(0, 24)} under ${top ? top.className || top.tagName : "nothing"}`);
        }
        return out;
      }, id);
      for (const h of hidden) bad.push(`${vp.width} ${id}@${p}: ${h}`);
    }
    await ctx.close();
  }
  expect(bad).toEqual([]);
});

/** L4: scene -> every artifact it consumes, and a progress point where its content is on screen. */
const CONSUMES: [string, number, string[]][] = [
  ["pulse", 0.9, ["dispatch_model.json", "facts.json"]],
  ["source", 0.36, ["dispatch_model.json", "fuel_mix.json", "demand_profile.json", "facts.json", "weather_relation.json", "reconciliation.json", "quality.json", "meta.json"]],
  ["demand", 0.74, ["dispatch_model.json", "facts.json"]],
  ["netload", 0.6, ["fuel_mix.json", "demand_profile.json", "facts.json"]],
  ["forecast", 0.9, ["forecast_samples.json", "forecast_eval.json", "facts.json"]],
  ["dispatch", 0.8, ["dispatch_model.json", "dispatch_results.json"]],
  ["stress", 0.1, ["dispatch_model.json", "dispatch_results.json"]],
  ["evidence", 0.5, ["forecast_eval.json", "facts.json", "dispatch_model.json", "dispatch_results.json", "grid_topology.json", "reconciliation.json", "quality.json", "meta.json"]],
  ["control", 0, ["dispatch_model.json", "dispatch_results.json"]],
  ["closing", 0.9, ["dispatch_model.json", "meta.json"]],
];
for (const vp of [VP(1440, 900), VP(390, 844)]) {
  for (const [id, p, files] of CONSUMES) {
    test(`L4 ${vp.width}: ${id} shows its own alert + RETRY for each of its ${files.length} artifacts, one live region per file, one re-fetch per RETRY`, async ({ browser }) => {
      const { ctx, page } = await at(browser, vp);
      const blocked = new Set(files), hits = new Map<string, number>();
      await page.route("**/data/*.json", (r) => {
        const f = r.request().url().split("/data/")[1]!.split("?")[0]!;
        hits.set(f, (hits.get(f) ?? 0) + 1);
        return blocked.has(f) ? r.fulfill({ status: 503, body: "" }) : r.continue();
      });
      await page.goto("?quality=high");
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => (window as any).__peg && !(window as any).__peg.introStats().playing);
      await page.evaluate(() => (window as any).__peg.prefetchAll?.());
      await goScene(page, id, p);
      const banner = page.locator(`[data-scene-errors="${id}"]`);
      for (const f of files) {
        // a lazily loaded file is requested when its scene comes near; wait for its failure
        const alert = banner.locator(`[role=alert][data-file="${f}"]`);
        await expect(alert, f).toBeVisible({ timeout: 20_000 });
        await expect(alert.getByRole("button", { name: "RETRY" })).toBeInViewport();
        expect(await page.locator(`[role=alert][data-file="${f}"]`).count(), `${f}: one live region`).toBe(1);
      }
      for (const f of files) {
        blocked.delete(f);
        const before = hits.get(f) ?? 0;
        await banner.locator(`[role=alert][data-file="${f}"]`).getByRole("button", { name: "RETRY" }).click();
        await expect(banner.locator(`[data-file="${f}"]`), f).toHaveCount(0, { timeout: 20_000 });
        expect((hits.get(f) ?? 0) - before, `${f}: exactly one re-fetch`).toBe(1);
      }
      await ctx.close();
    });
  }
}
