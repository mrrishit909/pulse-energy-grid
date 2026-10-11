// P04-QA-003 (from the P04-QA-002 probe) (unchanged copy of the P04-QA-001 probe): axe (wcag2a/aa/21aa) on every scene, normal + reduced motion, 1440 and 390, reached by REAL nav clicks
// (pill menu on phones), plus a keyboard journey with focus assertions.
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
import AxeBuilder from "../../../../site/node_modules/@axe-core/playwright/dist/index.mjs";
import { writeFileSync } from "node:fs";
const base = "http://localhost:4331/pulse-energy-grid/";
const NAV = [["pulse", "PULSE"], ["source", "SOURCE"], ["demand", "DEMAND"], ["netload", "NET LOAD"], ["forecast", "FORECAST"], ["dispatch", "DISPATCH"], ["stress", "STRESS"], ["evidence", "EVIDENCE"], ["control", "CONTROL ROOM"]];
const b = await chromium.launch();
const out = { axe: [], kb: [] };
for (const [w, h] of [[1440, 900], [390, 844]]) for (const rm of ["no-preference", "reduce"]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: rm, hasTouch: w < 1024, isMobile: w < 768 });
  const page = await ctx.newPage();
  await page.goto(base); await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
  const scan = async (label) => {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const v = r.violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, sample: x.nodes.slice(0, 3).map((n) => n.target.join(" ") + " :: " + (n.failureSummary || "").split("\n")[1]) }));
    out.axe.push({ vp: `${w}x${h}`, motion: rm, at: label, violations: v });
    console.log(`${w} ${rm} ${label}: ${v.length ? v.map((x) => `${x.id}(${x.impact},${x.n})`).join(" ") : "clean"}`);
  };
  await scan("S00/S01 top");
  for (const [id, label] of NAV) {
    try {
      if (w < 768) { await page.locator("[aria-controls=menu-panel]").first().click({ timeout: 5000 }); await page.waitForTimeout(500); }
      await page.getByRole("button", { name: label, exact: true }).or(page.getByRole("link", { name: label, exact: true })).last().click({ timeout: 5000 });
    } catch (e) { out.axe.push({ vp: `${w}x${h}`, motion: rm, at: `nav->${id}`, navFailed: String(e).split("\n")[0] }); console.log(`${w} ${rm} NAV CLICK FAILED for ${label}; jumpTo fallback`); if (w < 768) await page.keyboard.press("Escape"); await page.evaluate((i) => window.__peg.jumpTo(i), id); }
    await page.waitForTimeout(2200);
    const cur = await page.evaluate(() => window.__peg.debug().scene);
    await scan(`nav->${id} (scene=${cur})`);
  }
  await page.evaluate(() => window.__peg.jumpTo("closing", 0.97)); await page.waitForTimeout(2500); await scan("closing 0.97");
  await ctx.close();
}
// keyboard journey at 1440
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const kb = (name, ok, d) => { out.kb.push({ name, ok, d }); console.log(ok ? "PASS" : "FAIL", name, d ?? ""); };
const focused = () => page.evaluate(() => { const e = document.activeElement; return e ? `${e.tagName.toLowerCase()}${e.getAttribute("role") ? "[" + e.getAttribute("role") + "]" : ""} "${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 40)}" in #${e.closest("section,[id]")?.id ?? "?"}` : "none"; });
const fv = () => page.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 || cs.boxShadow !== "none"; });
await page.goto(base);
await page.keyboard.press("Tab"); const f1 = await focused(); kb("first Tab reaches SKIP INTRO or skip link", /SKIP/i.test(f1), f1);
await page.keyboard.press("Enter"); await page.waitForTimeout(800);
kb("Enter on SKIP ends the intro", !(await page.evaluate(() => window.__peg.introStats().playing)));
// tab order sample through the nav
const seq = []; for (let i = 0; i < 14; i++) { await page.keyboard.press("Tab"); seq.push((await focused()) + ((await fv()) ? " [ring]" : " [NO RING]")); }
kb("Tab walk shows a focus ring on every stop", seq.every((s) => s.includes("[ring]")), seq.join(" | "));
// S03a radio group arrows
await page.evaluate(() => window.__peg.jumpTo("demand")); await page.waitForTimeout(1500);
await page.locator("#demand [role=radio]", { hasText: "CISO" }).focus(); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(700);
kb("S03a GRID arrow selects ERCO", (await page.evaluate(() => window.__peg.city().ba)) === "ERCO", await focused());
await page.locator("#demand [role=radio]", { hasText: "WINTER" }).focus(); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(700);
kb("S03a DAY arrow changes day", (await page.evaluate(() => window.__peg.city().dayId)) !== "winter", JSON.stringify(await page.evaluate(() => window.__peg.city())));
const rose = page.locator("#demand [role=button]").first(); await rose.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(900);
const insF = await focused(); kb("S03a Enter on rose opens the inspector and moves focus into it", /inspector|CLOSE/i.test(insF) || await page.evaluate(() => !!document.activeElement.closest(".inspector")), insF);
await page.keyboard.press("Escape"); await page.waitForTimeout(600);
const back = await focused(); kb("Esc closes the inspector and returns focus to the rose", /rose/i.test(back), back);
// S03b LAYER / YEAR
await page.evaluate(() => window.__peg.jumpTo("netload")); await page.waitForTimeout(1500);
await page.locator("#netload [role=radio]", { hasText: "NET LOAD" }).focus(); await page.keyboard.press("Space"); await page.waitForTimeout(600);
kb("S03b LAYER NET LOAD via keyboard", (await page.evaluate(() => window.__peg.debug())) && (await page.locator("#netload [role=radio]", { hasText: "NET LOAD" }).getAttribute("aria-checked")) === "true");
await page.locator("#netload [role=radio]", { hasText: "2023" }).focus(); await page.keyboard.press("Space"); await page.waitForTimeout(600);
kb("S03b YEAR 2023 via keyboard", (await page.locator("#netload [role=radio]", { hasText: "2023" }).getAttribute("aria-checked")) === "true");
// S04 models
await page.evaluate(() => window.__peg.jumpTo("forecast", 0.9)); await page.waitForTimeout(2000);
const naive = page.locator("#forecast button", { hasText: /^NAIVE$/ }); await naive.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(500);
kb("S04 NAIVE toggle via keyboard sets aria-pressed=false", (await naive.getAttribute("aria-pressed")) === "false", await naive.getAttribute("aria-pressed"));
await page.keyboard.press("Enter");
await page.locator("#forecast [role=radio]", { hasText: "COLDEST WEEK" }).focus(); await page.keyboard.press("Space"); await page.waitForTimeout(800);
kb("S04 WEEK via keyboard", (await page.evaluate(() => window.__peg.setForecast && document.querySelector("#forecast").innerText)).includes("COLDEST"));
// S05 sliders
await page.evaluate(() => window.__peg.jumpTo("dispatch", 0.8)); await page.waitForTimeout(3000);
const s0 = page.locator("#dispatch input[type=range]").first(); await s0.focus(); const seq0 = (await page.evaluate(() => window.__peg.fill().seq));
for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight"); await page.waitForTimeout(3000);
const fl = await page.evaluate(() => window.__peg.fill());
kb("S05 battery slider via keyboard re-solves in browser", fl.params.battery_power_mw === 1800 && fl.seq > seq0 && fl.source === "browser", JSON.stringify({ p: fl.params.battery_power_mw, seq: fl.seq, src: fl.source }));
const nm = await page.evaluate(() => [...document.querySelectorAll("#dispatch input[type=range], #control input[type=range]")].map((e) => e.labels?.[0]?.textContent?.trim() || e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || "NO NAME"));
kb("every slider has an accessible name", !nm.includes("NO NAME"), nm.join(" | "));
// S06 tablist
await page.evaluate(() => window.__peg.jumpTo("stress", 0.1)); await page.waitForTimeout(2000);
await page.locator("#stress [role=tab]").first().focus(); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(1500);
kb("S06 tablist ArrowRight steps the scenario", (await page.evaluate(() => window.__peg.stress().step)) === 1, JSON.stringify(await page.evaluate(() => window.__peg.stress())) + " focus " + (await focused()));
// CTRL: every control
await page.evaluate(() => window.__peg.jumpTo("control", 0)); await page.waitForTimeout(3000);
const c0 = await page.evaluate(() => window.__peg.ctrl());
await page.locator("#control [role=radio]", { hasText: "ERCO" }).focus(); await page.keyboard.press("Space"); await page.waitForTimeout(3000);
kb("CTRL GRID via keyboard", (await page.evaluate(() => window.__peg.ctrl().ba)) === "ERCO");
await page.locator("#control button", { hasText: "HEAT WAVE +5 C" }).focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(3000);
kb("CTRL preset HEAT WAVE via keyboard", (await page.evaluate(() => window.__peg.ctrl().params.heat_wave_c)) === 5, JSON.stringify(await page.evaluate(() => window.__peg.ctrl().params)));
await page.locator("#control select").focus(); await page.keyboard.press("ArrowDown"); await page.waitForTimeout(3000);
kb("CTRL OUTAGE select via keyboard", (await page.evaluate(() => window.__peg.ctrl().params.outage_class)) !== "none", await page.evaluate(() => window.__peg.ctrl().params.outage_class));
await page.locator("#control [role=radio]", { hasText: "PRICE" }).focus(); await page.keyboard.press("Space"); await page.waitForTimeout(800);
kb("CTRL LAYER PRICE via keyboard", (await page.locator("#control [role=radio]", { hasText: "PRICE" }).getAttribute("aria-checked")) === "true");
await page.locator("#control [role=radio]", { hasText: "TOO SHORT" }).focus(); await page.keyboard.press("Space"); await page.waitForTimeout(500);
const rs = page.locator("#control input[type=range]").nth(4); await rs.focus(); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(4000);
const tl = await page.evaluate(() => ({ c: window.__peg.ctrl(), status: document.querySelector("#control .ctrl-status").innerText }));
kb("CTRL TIME LIMIT too short: handled, last optimal kept, said on screen", /TIME LIMIT/i.test(tl.status + (tl.c.check ?? "")), tl.status.replace(/\s+/g, " ").slice(0, 200));
await page.locator("#control [role=radio]", { hasText: "10 S" }).focus(); await page.keyboard.press("Space");
await page.locator("#control button", { hasText: "RESET" }).focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(3000);
const c1 = await page.evaluate(() => window.__peg.ctrl());
kb("CTRL RESET restores CISO / first day / baseline params", c1.ba === "CISO" && c1.dayId === c0.dayId && JSON.stringify(c1.params) === JSON.stringify(c0.params), JSON.stringify({ ba: c1.ba, day: c1.dayId, p: c1.params }));
const layerAfter = await page.locator("#control [role=radio]", { hasText: "STACK" }).getAttribute("aria-checked");
kb("CTRL RESET returns LAYER to STACK", layerAfter === "true", layerAfter);
const cr = page.locator("#control [role=button]").first(); await cr.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(900);
await page.keyboard.press("Escape"); await page.waitForTimeout(600);
kb("CTRL inspector Enter/Esc returns focus to the rose", /rose/i.test(await focused()), await focused());
writeFileSync(new URL("../a11y.json", import.meta.url).pathname, JSON.stringify(out, null, 1));
await b.close();
