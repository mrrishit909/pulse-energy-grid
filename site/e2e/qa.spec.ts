/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Pre-QA hardening (P04-FIXC-001): one test per QA_LESSONS item L1-L9 (L6 is Lighthouse, L10 is the copy test in Vitest).
 * Runs once (desktop project); each test opens its own contexts at the viewports its lesson names.
 */
import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
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

test("L2: no text, chip or control collisions in any scene at 1024x768, 1280x720 and 768x1024", async ({ browser }) => {
  const bad: string[] = [];
  for (const vp of [VP(1024, 768), VP(1280, 720), VP(768, 1024)]) {
    const { ctx, page } = await at(browser, vp);
    await openSite(page);
    for (const [id, p] of WALK) { await goScene(page, id, p); for (const x of await collisions(page, id)) bad.push(`${vp.width}x${vp.height} ${id}@${p}: ${x}`); }
    await ctx.close();
  }
  expect(bad).toEqual([]);
});

for (const reduced of [false, true]) {
  test(`L11: phones flow, no collisions in any scene at 360x800, 375x812 and 390x844 (${reduced ? "reduced motion" : "motion"})`, async ({ browser }) => {
    const bad: string[] = [];
    for (const vp of [VP(360, 800), VP(375, 812), VP(390, 844)]) {
      const { ctx, page } = await at(browser, vp, { reduced });
      await openSite(page);
      for (const [id, p] of WALK) { await goScene(page, id, p); for (const x of await collisions(page, id)) bad.push(`${vp.width}x${vp.height} ${id}@${p}: ${x}`); }
      await ctx.close();
    }
    expect(bad).toEqual([]);
  });
}

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
        // L14: against the configured viewport width; under isMobile innerWidth grows with the overflow
        const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth }));
        if (Math.max(r.sw, r.bw) > w) bad.push(`${reduced ? "reduced" : "motion"} ${w} ${id}: ${Math.max(r.sw, r.bw)} > ${w}`);
      }
      await ctx.close();
    }
  }
  expect(bad).toEqual([]);
  // L14 fixture: a deliberately overflowing element must make this measurement fail under isMobile
  const { ctx, page } = await at(browser, VP(390, 844), { reduced: true });
  await openSite(page);
  await page.evaluate(() => { const d = document.createElement("div"); d.style.cssText = "width:525px;height:4px;position:relative"; document.body.append(d); });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw, "the overflow check sees a 525px fixture").toBeGreaterThan(390);
  await ctx.close();
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
  ["forecast", 0.9, ["forecast_samples.json", "forecast_eval.json", "facts.json", "fuel_mix.json", "demand_profile.json"]],
  ["dispatch", 0.8, ["dispatch_model.json", "dispatch_results.json", "dispatch_test_vectors.json"]],
  ["stress", 0.1, ["dispatch_model.json", "dispatch_results.json"]],
  ["evidence", 0.5, ["forecast_eval.json", "facts.json", "dispatch_model.json", "dispatch_results.json", "grid_topology.json", "reconciliation.json", "quality.json", "meta.json", "dispatch_test_vectors.json"]],
  ["control", 0, ["dispatch_model.json", "dispatch_results.json", "dispatch_test_vectors.json"]],
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
        // L12: the RETRY must be the topmost element at its centre and a real pointer click there must work
        const btn = banner.locator(`[role=alert][data-file="${f}"]`).getByRole("button", { name: "RETRY" });
        // the banner re-centres as other files settle, so the box is re-read just before each real click
        for (let k = 0; k < 3 && (hits.get(f) ?? 0) === before; k++) {
          await page.waitForTimeout(250);
          const bb = await btn.boundingBox();
          if (!bb) break;
          const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
          expect(await page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.textContent?.trim(), [x, y]), `${f}: RETRY on top`).toBe("RETRY");
          await page.mouse.click(x, y);
          await page.waitForTimeout(400);
        }
        await expect(banner.locator(`[data-file="${f}"]`), f).toHaveCount(0, { timeout: 20_000 });
        expect((hits.get(f) ?? 0) - before, `${f}: exactly one re-fetch`).toBe(1);
      }
      await ctx.close();
    });
  }
}

// ------------------------------------------------------------------ P04-FIXE-001: the QA report's defects, each with its own test
test("D-005: the Hour Inspector closes when its scene leaves the viewport", async ({ browser }) => {
  for (const [id, p] of [["demand", 0.74], ["control", 0]] as const) {
    const { ctx, page } = await at(browser, VP(1440, 900));
    await openSite(page);
    await goScene(page, id, p);
    const hit = page.locator(`[data-rose-hit="${id}"]`);
    await hit.focus(); await page.keyboard.press("Enter");
    await expect(page.locator(".sheet.inspector")).toBeVisible();
    await goScene(page, "closing", 0.9);
    await expect(page.locator(".sheet.inspector")).toHaveCount(0);
    await ctx.close();
  }
});

test("D-006: a tap on the rose opens the inspector sheet inside the phone viewport (S03a, S05, CTRL)", async ({ browser }) => {
  for (const vp of [VP(390, 844), VP(360, 800)]) {
    const { ctx, page } = await at(browser, vp);
    await openSite(page);
    for (const [id, p] of [["demand", 0.74], ["dispatch", 0.8], ["control", 0]] as const) {
      await goScene(page, id, p);
      const v = await page.evaluate((sid) => { const l = sid === "control" ? (window as any).__peg.liveDisc() : (window as any).__peg.view(); return l ? { x: l.cx, y: l.cy - (l.R100 ? l.R100 * 0.3 : l.tip * 0.5) } : null; }, id);
      expect(v, id).not.toBeNull();
      await page.touchscreen.tap(v!.x, v!.y);
      const sheet = page.locator(".sheet.inspector");
      await expect(sheet, `${vp.width} ${id}`).toBeVisible();
      const b = (await sheet.boundingBox())!;
      expect(b.y + b.height, `${vp.width} ${id} sheet bottom`).toBeGreaterThan(0);
      expect(b.y, `${vp.width} ${id} sheet top inside the viewport`).toBeLessThan(vp.height);
      await page.locator(".sheet.inspector .sheet__close").click();
    }
    await ctx.close();
  }
});

test("D-007: missing test vectors read PARITY NOT CHECKED (never RUNNING) in S05, CTRL and S07", async ({ browser }) => {
  const { ctx, page } = await at(browser, VP(1440, 900));
  await page.route("**/data/dispatch_test_vectors.json", (r) => r.fulfill({ status: 503, body: "" }));
  await openSite(page);
  for (const [id, p] of [["dispatch", 0.8], ["control", 0], ["evidence", 0.5]] as const) {
    await goScene(page, id, p);
    await expect(page.locator(`[data-scene-errors="${id}"] [role=alert][data-file="dispatch_test_vectors.json"]`)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`#${id}`)).not.toContainText("PARITY CHECK RUNNING");
  }
  await goScene(page, "dispatch", 0.8);
  await expect(page.locator("#dispatch [data-parity-missing]")).toContainText("PARITY NOT CHECKED");
  await ctx.close();
});

test("D-009: on phones both verdict cards state the MAPE difference and its 95% CI", async ({ browser }) => {
  for (const vp of [VP(360, 800), VP(375, 812), VP(390, 844)]) {
    const { ctx, page } = await at(browser, vp);
    await openSite(page);
    await goScene(page, "forecast", 0.9);
    for (const ba of ["CISO", "ERCO"]) await expect(page.locator(`.fc-card[data-ba="${ba}"] .fc-card__mono`), `${vp.width} ${ba}`).toContainText(/PP \(95% CI/);
    await ctx.close();
  }
});

test("D-011: S08 corner labels keep >= 4.5:1 over the drawn rose on phones and desktop", async ({ browser }) => {
  for (const vp of [VP(390, 844), VP(360, 800), VP(1440, 900)]) {
    const { ctx, page } = await at(browser, vp);
    await openSite(page);
    await goScene(page, "closing", 0.76);
    await page.waitForTimeout(600);
    // composite the label's backing over the rose pixels behind it, then the contrast of its white text
    const worst = await page.evaluate(() => {
      const cv = document.querySelector<HTMLCanvasElement>("canvas.rose-layer")!;
      const g = cv.getContext("2d")!;
      const k = cv.width / cv.getBoundingClientRect().width;
      const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!); };
      let min = 99;
      for (const el of document.querySelectorAll<HTMLElement>(".close-corners .wordmark, .close-corners .intro-corner")) {
        const r = el.getBoundingClientRect();
        const bg = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)!.map(Number);
        const a = bg[3] ?? 1, op = Number(getComputedStyle(cv).opacity);
        for (let x = r.left + 2; x < r.right - 2; x += 4) for (let y = r.top + 2; y < r.bottom - 2; y += 4) {
          const px = Array.from(g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data).map((v) => v * op);
          const comp = [0, 1, 2].map((i) => bg[i]! * a + px[i]! * (1 - a));
          min = Math.min(min, 1.05 / (lum(comp) + 0.05));
        }
      }
      return min;
    });
    expect(worst, `${vp.width}`).toBeGreaterThanOrEqual(4.5);
    await ctx.close();
  }
});

test("D-014: one highs.wasm GET per solver start", async ({ browser }) => {
  const { ctx, page } = await at(browser, VP(1440, 900));
  let n = 0;
  ctx.on("request", (r) => { if (/\.wasm(\?|$)/.test(r.url())) n++; });
  await openSite(page);
  await goScene(page, "dispatch", 0.8);
  await page.waitForFunction(() => (window as any).__peg.solver().parity, null, { timeout: 60_000 });
  expect(n).toBe(1);
  await ctx.close();
});

test("D-004: axe finds no serious contrast issue in S07 under reduced motion (1440 and 390)", async ({ browser }) => {
  for (const vp of [VP(1440, 900), VP(390, 844)]) {
    const { ctx, page } = await at(browser, vp, { reduced: true });
    await openSite(page);
    await goScene(page, "evidence", 0.5);
    const res = await new AxeBuilder({ page }).include("#evidence").analyze();
    const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${vp.width} ${v.id}: ${v.nodes.slice(0, 3).map((x) => x.target.join(" ")).join(", ")}`)).toEqual([]);
    await ctx.close();
  }
});
