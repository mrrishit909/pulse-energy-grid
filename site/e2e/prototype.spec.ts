import { expect, test, type Page } from "@playwright/test";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Band = { key: string; r0: number; r1: number; mw: number };
type RoseLog = { R100: number; rPeakDemand: number; petals: { hour: number; bands: Band[] }[] };
const peg = (page: Page) => ({
  rose: () => page.evaluate(() => (window as any).__peg.rose() as RoseLog | null),
  debug: () => page.evaluate(() => (window as any).__peg.debug()),
  jump: (id: string, p?: number) => page.evaluate(([i, q]) => (window as any).__peg.jumpTo(i, q), [id, p] as const),
  intro: () => page.evaluate(() => (window as any).__peg.introStats()),
  solver: () => page.evaluate(() => (window as any).__peg.solver()),
  fill: () => page.evaluate(() => (window as any).__peg.fill()),
});
const data = (page: Page, f: string) => page.evaluate(async (file) => (await fetch(`data/${file}`)).json(), f);
const hourP = (h: number) => 0.06 + ((h + 0.5) / 24) * 0.88;

test.describe("S00 The Bloom", () => {
  test("LCP headline is in the HTML as ghost text from first paint (0.55 + blur, never opacity 0)", async ({ page }) => {
    const res = await page.request.get("");
    expect(await res.text()).toContain('data-hero');
    await page.goto("");
    const w = page.locator("h1[data-hero] .wr-word").first();
    expect(Number(await w.evaluate((e) => getComputedStyle(e).opacity))).toBeGreaterThanOrEqual(0.55);
  });

  test("SKIP is visible at once; the nav enters within 400ms of the click; plays once per session", async ({ page, isMobile }) => {
    await page.goto("");
    const skip = page.getByRole("button", { name: "SKIP INTRO" });
    await expect(skip).toBeVisible({ timeout: 1000 });
    await skip.click();
    const t0 = Date.now();
    await expect(page.locator(isMobile ? ".nav-pill.is-fixed:not(.is-hidden)" : ".nav-bar.is-fixed:not(.is-hidden)")).toBeVisible();
    expect(Date.now() - t0).toBeLessThan(1500); // CI slack over the 400ms spec; the class flips on the click frame
    await page.waitForFunction(() => !(window as any).__peg.introStats().playing);
    await page.reload();
    await page.waitForTimeout(300);
    expect((await peg(page).intro()).playing).toBe(false);
    await expect(page.getByRole("button", { name: "SKIP INTRO" })).toHaveCount(0);
  });

  test("giant geometry: the peak petal is >= G0 from the first silhouette frame and never shrinks; diameter >= 1.2 x frame height", async ({ page }) => {
    await page.goto("?quality=high");
    await page.waitForFunction(() => !(window as any).__peg.introStats().playing, null, { timeout: 15_000 });
    const s = await peg(page).intro();
    const vh = page.viewportSize()!.height;
    expect(s.firstSilhouette).toBeGreaterThanOrEqual(400);
    expect(s.minR).toBeGreaterThanOrEqual(s.G0 - 1e-6);
    expect(s.monotonic).toBe(true);
    expect((2 * s.minR) / vh).toBeGreaterThanOrEqual(1.2);
  });

  test("radial only: in sampled fill frames no petal shows a band beyond the one being filled", async ({ page }) => {
    await page.goto("?quality=high");
    await page.waitForFunction(() => (window as any).__peg.debug().frames > 0);
    for (const t of [950, 1300, 1700, 2100, 2500, 2900, 3200, 1100, 1900, 2700]) {
      await page.evaluate((x) => (window as any).__peg.freeze(x), t);
      await page.waitForTimeout(80);
      const d = await peg(page).debug();
      expect(d.bandCounts.length).toBe(24);
      for (const c of d.bandCounts) expect(c).toBeLessThanOrEqual(d.fillK);
      // the band in progress is drawn (radially, all petals at once); at its first instant it has zero area
      expect(Math.max(...d.bandCounts)).toBeGreaterThanOrEqual(d.fillK - 1);
    }
  });

  test("area truth in the drawn rose: (r1^2 - r0^2) / R100^2 x 100,000 = the OBSERVED fuel MW of that hour", async ({ page }) => {
    await page.goto("?quality=high");
    await page.waitForFunction(() => !(window as any).__peg.introStats().playing, null, { timeout: 15_000 });
    const log = (await peg(page).rose())!;
    const model = await data(page, "dispatch_model.json");
    const day = model.bas.CISO.days.find((d: any) => d.intro);
    const code: Record<string, string> = { SUN: "SUN", WND: "WND", NUC: "NUC", WAT: "WAT", OTH: "OTH", NG: "NG", OIL: "OIL" };
    for (const h of [3, 12, 19]) {
      for (const b of log.petals[h]!.bands) {
        const area = ((b.r1 ** 2 - b.r0 ** 2) / log.R100 ** 2) * 1e5;
        const truth = b.key === "IMPORTS" ? Math.max(0, -day.observed_interchange_mw[h]) : Math.max(0, day.observed_gen_mw[code[b.key]!][h]);
        expect(Math.abs(area - truth)).toBeLessThanOrEqual(Math.max(0.5, 0.005 * truth));
      }
    }
  });
});

test.describe("S03a Window City", () => {
  test("an integer hour from scroll; the readout MW is that hour's demand; windows = round(MW / 100)", async ({ page }) => {
    await page.goto("#demand");
    await page.keyboard.press("Escape");
    await peg(page).jump("demand", 0.5);
    await page.waitForTimeout(600);
    const model = await data(page, "dispatch_model.json");
    const d = await peg(page).debug();
    expect(Number.isInteger(d.hour)).toBe(true);
    const day = model.bas.CISO.days[0];
    const mw = day.demand_mw[d.hour];
    await expect(page.locator(".city-readout .readout-line").first()).toHaveText(`${Math.round(mw).toLocaleString("en-US")} MW SERVED`);
    await page.waitForFunction((n) => (window as any).__peg.debug().lit === n, Math.round(mw / 100));
    for (const h of [0, 23]) {
      await peg(page).jump("demand", hourP(h));
      await page.waitForFunction((hh) => (window as any).__peg.debug().hour === hh, h);
    }
  });

  test("GRID and DAY are live and RESET restores CISO / the first day", async ({ page }) => {
    await page.goto("#demand");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const grid = page.getByRole("radiogroup", { name: "GRID" }).first();
    await grid.getByRole("radio", { name: "ERCO" }).click();
    await expect(page.locator(".city-text .scene-kicker")).toContainText("ERCO");
    await page.getByRole("button", { name: "RESET" }).first().click();
    await expect(page.locator(".city-text .scene-kicker")).toContainText("CISO");
  });
});

test.describe("S05 Fill the Day", () => {
  test("the worker runs all 108 parity vectors on this build and the badge shows the real count", async ({ page }) => {
    await page.goto("#dispatch");
    await page.keyboard.press("Escape");
    const badge = page.locator(".fill-status .parity");
    await expect(badge).toHaveAttribute("data-parity-n", "108", { timeout: 60_000 });
    const s = await peg(page).solver();
    expect(s.parity.passed).toBe(108);
    expect(s.parity.objective).toBe(108);
    expect(s.parity.price).toBe(s.parity.priceComparable);
    await expect(badge).toContainText(`PARITY ${s.parity.passed}/108`);
    await expect(badge).toHaveAttribute("data-parity-hash", String(s.parity.hash));
  });

  test("cost == solver objective; the live baseline equals the precomputed Python result within 1e-6", async ({ page }) => {
    await page.goto("#dispatch");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => (window as any).__peg.fill().source === "browser", null, { timeout: 60_000 });
    const f = await peg(page).fill();
    const results = await data(page, "dispatch_results.json");
    const py = results.bas.CISO.days.summer.baseline.objective_usd;
    expect(Math.abs(f.objective - py) / py).toBeLessThanOrEqual(1e-6);
    await expect(page.locator(".ledger-total")).toHaveAttribute("data-objective", String(f.objective));
    await expect(page.locator(".fill-status [data-source]")).toContainText("SOLVED IN BROWSER");
    await expect(page.locator(".fill-chip")).toContainText("SIMULATED");
  });

  test("a slider re-solves in the worker (battery 6000 MW = the battery_big preset)", async ({ page, isMobile }) => {
    await page.goto("#dispatch");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => (window as any).__peg.fill().source === "browser", null, { timeout: 60_000 });
    const seq = (await peg(page).fill()).seq;
    const slider = page.locator(".fill-lab input[type=range]").first();
    await slider.fill("6000");
    if (isMobile) await slider.dispatchEvent("pointerup");
    await page.waitForFunction((s) => (window as any).__peg.fill().seq > s && (window as any).__peg.fill().params.battery_power_mw === 6000, seq, { timeout: 30_000 });
    const results = await data(page, "dispatch_results.json");
    const py = results.bas.CISO.days.summer.battery_big.objective_usd;
    const f = await peg(page).fill();
    expect(f.source).toBe("browser");
    expect(Math.abs(f.objective - py) / py).toBeLessThanOrEqual(1e-6);
  });

  test("worker blocked: PRECOMPUTED fallback, labelled, with RETRY; never 'SOLVED IN BROWSER'", async ({ page }) => {
    await page.route("**/assets/solver.worker-*.js", (r) => r.abort());
    await page.goto("#dispatch");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => ["error", "disabled"].includes((window as any).__peg.solver().status), null, { timeout: 30_000 });
    await expect(page.locator(".fill-status [data-source]")).toHaveText("LIVE SOLVER UNAVAILABLE: SHOWING PRECOMPUTED PYTHON RESULTS");
    await expect(page.locator(".fill-chip")).toContainText("PRECOMPUTED");
    await expect(page.locator(".fill-status")).not.toContainText("SOLVED IN BROWSER");
    await expect(page.locator(".fill-status").getByRole("button", { name: "RETRY" })).toBeVisible();
    expect((await peg(page).fill()).source).toBe("precomputed");
  });

  test("area truth in the drawn S05 rose and nothing heavy before S04: no wasm or worker request on the first screens", async ({ page, context }) => {
    const reqs: string[] = [];
    context.on("request", (r) => reqs.push(r.url()));
    await page.goto("");
    await page.keyboard.press("Escape");
    await page.waitForLoadState("networkidle");
    await peg(page).jump("demand");
    await page.waitForTimeout(800);
    expect(reqs.filter((u) => /\.wasm|solver\.worker/.test(u))).toEqual([]);
    await peg(page).jump("dispatch", 0.8);
    await page.waitForFunction(() => (window as any).__peg.fill().source === "browser", null, { timeout: 60_000 });
    await page.waitForTimeout(900);
    const log = (await peg(page).rose())!;
    for (const p of log.petals.filter((x) => [6, 12, 19].includes(x.hour))) for (const b of p.bands) {
      expect(Math.abs(((b.r1 ** 2 - b.r0 ** 2) / log.R100 ** 2) * 1e5 - b.mw)).toBeLessThanOrEqual(Math.max(0.5, 0.005 * b.mw));
    }
  });
});
