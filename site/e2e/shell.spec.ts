import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const isLocal = (url: string) => /^(http:\/\/(localhost|127\.0\.0\.1):\d+\/|data:|blob:)/.test(url);
type Peg = { __peg: { jumpTo: (id: string, p?: number) => void; getProgress: (id: string) => number; solver: () => { status: string; parity: { passed: number; n: number } | null } } };
const IDS = ["pulse", "source", "demand", "netload", "forecast", "dispatch", "stress", "evidence", "control", "closing"];

async function open(page: Page) {
  await page.goto("");
  await page.evaluate(() => document.fonts.ready);
}

test("shell renders the ten scene tracks with the static hero", async ({ page }) => {
  await open(page);
  await expect(page).toHaveTitle("Pulse Energy Grid");
  await expect(page.locator("section.track")).toHaveCount(10);
  await expect(page.locator("h1[data-hero]")).toHaveText("The invisible machine that powers everything.");
  await expect(page.locator("#demand-title")).toHaveText("Every window is a hundred megawatts.");
});

test("zero external requests while visiting every scene, the HiGHS wasm included (served from this origin)", async ({ page, context }) => {
  const all: string[] = [];
  context.on("request", (r) => all.push(r.url()));
  await page.goto("", { waitUntil: "networkidle" });
  await page.keyboard.press("Escape");
  for (const id of IDS) {
    await page.evaluate((i) => (window as unknown as Peg).__peg.jumpTo(i), id);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => (window as unknown as Peg).__peg.jumpTo("dispatch"));
  await page.waitForFunction(() => (window as unknown as Peg).__peg.solver().parity !== null, null, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  expect(all.filter((u) => !isLocal(u))).toEqual([]);
  // the worker fetched the wasm itself; when Playwright sees worker traffic it must be local, and the solve proves it loaded
  expect(all.filter((u) => /\.wasm/.test(u)).every(isLocal)).toBe(true);
  expect(page.workers().length).toBeGreaterThan(0);
});

test("desktop nav: keyboard jump, aria-current, focus, back", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "desktop bar only");
  await open(page);
  await page.getByRole("button", { name: "SKIP INTRO" }).click();
  const nav = page.getByRole("navigation", { name: "Chapters", exact: true });
  await expect(nav).toBeVisible();
  const pulse = nav.getByRole("link", { name: "PULSE" });
  await expect(pulse).toHaveAttribute("aria-current", "location");
  const demand = nav.getByRole("link", { name: "DEMAND" });
  await demand.focus();
  await page.keyboard.press("Enter");
  await expect(demand).toHaveAttribute("aria-current", "location");
  await expect(page).toHaveURL(/#demand$/);
  await expect(page.locator("#demand-title")).toBeFocused();
  const p = await page.evaluate(() => (window as unknown as Peg).__peg.getProgress("demand"));
  expect(Math.abs(p - 0.74)).toBeLessThan(0.01);
  await nav.getByRole("link", { name: "DISPATCH" }).click();
  await expect(page).toHaveURL(/#dispatch$/);
  await page.goBack();
  await expect(page).toHaveURL(/#demand$/);
  await expect(demand).toHaveAttribute("aria-current", "location");
});

test("mobile menu pill: open, Esc closes and returns focus, item jumps", async ({ page, isMobile }) => {
  test.skip(!isMobile, "T/M pill only");
  await open(page);
  await page.getByRole("button", { name: "SKIP INTRO" }).click();
  const pill = page.locator(".nav-pill.is-fixed .menu-pill");
  await expect(pill).toBeVisible();
  await expect(pill).toContainText("PULSE");
  await pill.click();
  await expect(pill).toHaveAttribute("aria-expanded", "true");
  const panel = page.locator("#menu-panel");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pill).toHaveAttribute("aria-expanded", "false");
  await expect(pill).toBeFocused();
  await pill.click();
  await panel.getByRole("link", { name: "DISPATCH" }).click();
  await expect(page).toHaveURL(/#dispatch$/);
  await expect(pill).toContainText("DISPATCH");
});

test("reduced motion renders in flow: no pinned stages, no blur, static rose frames", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("", { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  const sticky = await page.evaluate(() => [...document.querySelectorAll(".stage")].filter((s) => getComputedStyle(s).position === "sticky").length);
  expect(sticky).toBe(0);
  const blurred = await page.evaluate(() => [...document.querySelectorAll(".wr-word")].filter((w) => getComputedStyle(w).filter !== "none").length);
  expect(blurred).toBe(0);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(height).toBeLessThan(2300 * 9); // far below the 2,300vh of pinned tracks
  await expect(page.locator(".rose-layer")).toBeHidden();
  await expect(page.locator(".city-still canvas")).toHaveCount(4);
  await expect(page.locator(".pulse-still")).toHaveCount(1);
  await ctx.close();
});

test("axe: no serious or critical violations at S00, S03a and S05", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "SKIP INTRO" }).click();
  await page.waitForTimeout(500);
  for (const id of ["pulse", "demand", "dispatch"]) {
    await page.evaluate((i) => (window as unknown as Peg).__peg.jumpTo(i), id);
    await page.waitForTimeout(700);
    const results = await new AxeBuilder({ page }).analyze();
    const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${id} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }
});

test("production build excludes the dev gallery", async ({ page }) => {
  await page.goto("?gallery");
  await expect(page.locator(".gallery")).toHaveCount(0);
  await expect(page.locator("section.track")).toHaveCount(10);
});
