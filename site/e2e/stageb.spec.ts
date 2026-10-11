import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/* eslint-disable @typescript-eslint/no-explicit-any */
const P = (page: Page) => ({
  jump: (id: string, p?: number) => page.evaluate(([i, q]) => (window as any).__peg.jumpTo(i, q), [id, p] as const),
  debug: () => page.evaluate(() => (window as any).__peg.debug()),
  ctrl: () => page.evaluate(() => (window as any).__peg.ctrl()),
});
const data = (page: Page, f: string) => page.evaluate(async (file) => (await fetch(`data/${file}`)).json(), f);
async function open(page: Page) {
  await page.goto("?quality=high");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => (window as any).__peg && !(window as any).__peg.introStats().playing);
}

test("S01: the statement and the two facts cards (facts.json numbers)", async ({ page }) => {
  await open(page);
  await P(page).jump("pulse", 0.9);
  await expect(page.locator(".s01-cards")).toHaveClass(/is-in/);
  const f = await data(page, "facts.json");
  await expect(page.locator(".s01-cards .note").first()).toContainText(Math.round(f.bas.CISO.peak_demand_mw).toLocaleString("en-US"));
  await expect(page.locator(".s01-statement")).toHaveText("A grid keeps no stock. Every hour, supply has to meet demand exactly.");
});

test("S02: four cards; the ledger identities are recomputed and hold", async ({ page }) => {
  await open(page);
  await P(page).jump("source", 0.8);
  await page.waitForTimeout(600);
  await expect(page.locator(".story-card")).toHaveCount(4);
  await expect(page.locator(".ledger-card li").first()).toContainText("SLOTS = RAW + MISSING ✓");
  await expect(page.locator(".ledger-card .is-bad")).toHaveCount(0);
});

test("seams: S02 hands the rose to S03a, and S03a hands it to S03b, without a jump (within 1px)", async ({ page }) => {
  await open(page);
  const at = async (id: string, p: number) => { await P(page).jump(id, p); await page.waitForTimeout(500); return (await P(page).debug()).frames ? page.evaluate(() => (window as any).__peg.view()) : null; };
  const a = await at("source", 1), b = await at("demand", 0);
  expect(Math.abs(a.cx - b.cx)).toBeLessThan(1); expect(Math.abs(a.cy - b.cy)).toBeLessThan(1); expect(Math.abs(a.R100 - b.R100)).toBeLessThan(1);
  await page.waitForFunction(() => (window as any).__peg.ready(["fuel_mix.json", "demand_profile.json"]), null, { timeout: 20_000 });
  const c = await at("demand", 1), d = await at("netload", 0);
  expect(Math.abs(c.cx - d.cx)).toBeLessThan(1); expect(Math.abs(c.cy - d.cy)).toBeLessThan(1); expect(Math.abs(c.R100 - d.R100)).toBeLessThan(1);
});

test("S03b: NET LOAD and the year steps; the 2025 caption is marked partial", async ({ page }) => {
  await open(page);
  await P(page).jump("netload", 0.95);
  await expect(page.locator("#netload-title")).toHaveText("The sun takes a bite out of noon.");
  await expect(page.locator("[data-year-caption]")).toContainText("2025: MIDDAY NET LOAD FELL TO");
  await expect(page.locator("[data-year-caption]")).toContainText("PARTIAL YEAR");
  await page.getByRole("radiogroup", { name: "LAYER" }).first().getByRole("radio", { name: "DEMAND" }).click();
  await expect(page.locator("#netload-title")).toHaveText("Every month draws a different day.");
});

test("S04: the rose unrolls into the week; both BAs' verdicts, the CISO drift bound to facts", async ({ page }) => {
  await open(page);
  await P(page).jump("forecast", 0.03);
  await page.waitForFunction(() => (window as any).__peg.debug().scene === "forecast" && (window as any).__peg.rose() !== null, null, { timeout: 20_000 });
  await P(page).jump("forecast", 0.6);
  await page.waitForFunction(() => (window as any).__peg.rose() === null); // no rose once unrolled: the week plot
  await P(page).jump("forecast", 0.9);
  const f = await data(page, "facts.json");
  await expect(page.locator('.fc-card[data-ba="CISO"]')).toHaveAttribute("data-beats", "true");
  await expect(page.locator('.fc-card[data-ba="ERCO"]')).toHaveAttribute("data-beats", "false");
  await expect(page.locator("[data-bias]")).toContainText(`${Math.abs(f.eia_ciso_dayahead_bias_pct).toFixed(2)}% BIAS IN ${f.eia_ciso_dayahead_bias_year}`);
});

test("S06: the stepper steps the scenario; each ledger row is scenario - baseline", async ({ page }) => {
  await open(page);
  await P(page).jump("stress", 0.1);
  await page.waitForFunction(() => document.querySelector(".stress-ledger li") !== null, null, { timeout: 20_000 });
  await page.getByRole("tab", { name: /^4/ }).click();
  await expect(page.locator("#stress-title")).toHaveText("Heat wave +5 C");
  const r = await data(page, "dispatch_results.json");
  const b = r.bas.CISO.days.summer.baseline.objective_usd, x = r.bas.CISO.days.summer.heat_wave.objective_usd;
  await expect(page.locator('[data-row="MODEL COST"]')).toContainText(`+$${Math.round(x - b).toLocaleString("en-US")}`);
});

test("S07: The Wires is ILLUSTRATIVE, carries the artifact tag, no MW on any line and nothing moves along a path", async ({ page }) => {
  await open(page);
  await P(page).jump("evidence", 0.51);
  const svg = page.locator("svg.wires");
  await expect(svg).toBeVisible();
  expect(await svg.evaluate((s) => [...s.querySelectorAll("text")].some((t) => /\d\s*MW/i.test(t.textContent ?? "")))).toBe(false);
  expect(await svg.evaluate((s) => s.querySelectorAll("animateMotion").length + [...s.querySelectorAll("*")].filter((e) => getComputedStyle(e).offsetPath && getComputedStyle(e).offsetPath !== "none").length)).toBe(0);
  await expect(page.locator('[data-exchange="4"] .chip')).toContainText("SYNTHETIC");
  await expect(page.locator('[data-exchange="4"] .chip')).toContainText("ILLUSTRATIVE");
});

test("CTRL: a non-preset combination solves in the browser and cost == objective (unrounded, in the DOM)", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "slider rail on D; M uses the sheet (next test)");
  await open(page);
  await P(page).jump("control");
  await page.waitForFunction(() => (window as any).__peg.ctrl().source === "browser", null, { timeout: 60_000 });
  const seq = (await P(page).ctrl()).seq;
  await page.locator('.ctrl-rail input[data-control="renewables_scale"]').fill("1.85");
  await page.locator('.ctrl-rail input[data-control="battery_power_mw"]').fill("3700");
  await page.locator('.ctrl-rail input[data-control="heat_wave_c"]').fill("2.5");
  await page.waitForFunction((s) => (window as any).__peg.ctrl().seq >= s + 1 && (window as any).__peg.ctrl().params.heat_wave_c === 2.5, seq, { timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__peg.ctrl().source === "browser" && (window as any).__peg.ctrl().params.battery_power_mw === 3700);
  const ul = page.locator(".ctrl-lines");
  const obj = Number(await ul.getAttribute("data-objective")), sum = Number(await ul.getAttribute("data-breakdown-sum"));
  expect(Math.abs(obj - sum)).toBeLessThanOrEqual(1e-6 * obj);
  await expect(ul.locator('[data-line="cost"]')).toContainText("= SOLVER OBJECTIVE ✓");
  await expect(page.locator(".ctrl-status [data-source]")).toContainText("SOLVED IN BROWSER");
  // RESET restores CISO, the first day, baseline
  await page.getByRole("button", { name: /^RESET/ }).click();
  await page.waitForFunction(() => { const c = (window as any).__peg.ctrl(); return c.ba === "CISO" && c.dayId === "winter" && c.params.renewables_scale === 1 && c.params.battery_power_mw === 1500; });
});

test("CTRL: a 1 microsecond time limit is a handled non-Optimal status; cancel keeps the parity badge and recovers", async ({ page }) => {
  await open(page);
  await P(page).jump("control");
  await page.waitForFunction(() => (window as any).__peg.ctrl().source === "browser" && (window as any).__peg.solver().parity, null, { timeout: 60_000 });
  const before = await P(page).ctrl();
  await page.evaluate(() => { (window as any).__peg.setCtrlTimeLimit(0.000001); (window as any).__peg.setCtrl({ battery_hours: 5 }); });
  await page.waitForFunction(() => /TIME LIMIT REACHED/.test((window as any).__peg.ctrl().check ?? ""));
  expect((await P(page).ctrl()).objective).toBe(before.objective); // the last optimal result stays
  await page.evaluate(() => { (window as any).__peg.setCtrlTimeLimit(10); (window as any).__peg.setCtrl({ battery_hours: 6 }); (window as any).__peg.cancel(); });
  await page.waitForFunction(() => /CANCELLED/.test((window as any).__peg.ctrl().check ?? "") || (window as any).__peg.ctrl().params.battery_hours === 6);
  await page.waitForFunction(() => (window as any).__peg.solver().status === "ready", null, { timeout: 30_000 });
  expect((await page.evaluate(() => (window as any).__peg.solver())).parity.passed).toBe(108);
});

test("Hour Inspector: a click on a petal opens it, the balance identity holds, Esc returns focus", async ({ page }) => {
  await open(page);
  await P(page).jump("dispatch", 0.8);
  await page.waitForFunction(() => (window as any).__peg.fill().source === "browser", null, { timeout: 60_000 });
  await page.waitForTimeout(800);
  const hit = page.locator('[data-rose-hit="dispatch"]');
  const box = (await hit.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + 40, box.y + box.height / 2 - 4); // into the 18:00 side of the rose
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible();
  await expect(dlg.locator(".inspector__check")).toHaveAttribute("data-ok", "true");
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect(hit).toBeFocused();
});

test("M: the S05 full ledger opens as a bottom sheet", async ({ page, isMobile }) => {
  test.skip(!isMobile, "M only");
  await open(page);
  await P(page).jump("dispatch", 0.8);
  await page.getByRole("button", { name: "FULL LEDGER" }).click();
  await expect(page.getByRole("dialog", { name: "Dispatch ledger" })).toBeVisible();
  await expect(page.locator(".ledger--sheet li")).toHaveCount(9);
});

test("S08: the echo keeps the rose at G0 and ends with the caption and the links", async ({ page }) => {
  await open(page);
  await P(page).jump("closing", 0.66);
  await page.waitForTimeout(300);
  await P(page).jump("closing", 0.75);
  await page.waitForTimeout(400);
  const s = await page.evaluate(() => ({ r: (window as any).__peg.rose().rPeakDemand, g0: (window as any).__peg.introStats().G0 }));
  expect(s.r).toBeGreaterThanOrEqual(s.g0 - 1e-6);
  await P(page).jump("closing", 0.9);
  await expect(page.locator("[data-caption]")).toContainText("MWH SERVED");
  await expect(page.getByRole("button", { name: "→ OPEN THE CONTROL ROOM" })).toBeVisible();
});

test("axe: no serious or critical violations in the Stage B scenes", async ({ page }) => {
  await open(page);
  for (const [id, p] of [["pulse", 0.9], ["source", 0.36], ["netload", 0.6], ["forecast", 0.9], ["stress", 0.28], ["evidence", 0.95], ["control", 0], ["closing", 0.9]] as const) {
    await P(page).jump(id, p);
    await page.waitForTimeout(700);
    const res = await new AxeBuilder({ page }).analyze();
    const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${id} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }
});

test("reduced motion: every Stage B scene renders static frames in flow", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("", { waitUntil: "networkidle" });
  await expect(page.locator(".s01-statement")).toBeVisible();
  await expect(page.locator(".stress-item")).toHaveCount(5);
  await expect(page.locator(".ev-x")).toHaveCount(7);
  await expect(page.locator(".fc-still")).toHaveCount(4);
  await expect(page.locator(".bite-stills canvas")).toHaveCount(5);
  await ctx.close();
});
