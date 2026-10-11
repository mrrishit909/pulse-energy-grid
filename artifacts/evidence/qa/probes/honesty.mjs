// P04-QA-001 honesty / correctness probe at 1440x900: on-screen numbers vs facts.json and artifacts, parity badge,
// CTRL non-preset cost == solver objective (driven through the real slider with the keyboard), worker-blocked fallback,
// "live" claims, inspector persistence after a real petal click.
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const base = "http://localhost:4331/pulse-energy-grid/";
const D = new URL("../../../../site/public/data/", import.meta.url).pathname;
const facts = JSON.parse(readFileSync(D + "facts.json")), ev = JSON.parse(readFileSync(D + "forecast_eval.json"));
const res = JSON.parse(readFileSync(D + "dispatch_results.json")), tv = JSON.parse(readFileSync(D + "dispatch_test_vectors.json"));
const out = { checks: [], texts: {} };
const chk = (name, ok, detail) => { out.checks.push({ name, ok, detail }); console.log(ok ? "PASS" : "FAIL", name, detail ?? ""); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(base + "?quality=high"); await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
const go = async (id, p, ms = 1800) => { await page.evaluate(([i, q]) => window.__peg.jumpTo(i, q), [id, p]); await page.waitForTimeout(ms); };
const txt = (id) => page.evaluate((i) => document.getElementById(i).innerText.replace(/\s+/g, " "), id);
const n = (x) => x.toLocaleString("en-US");
// S00/S01
await go("pulse", 0.9); let t = await txt("pulse"); out.texts.pulse = t;
chk("S01 CISO peak = facts", t.includes(n(facts.bas.CISO.peak_demand_mw)) && t.includes(facts.bas.CISO.peak_demand_local), `${facts.bas.CISO.peak_demand_mw} ${facts.bas.CISO.peak_demand_local}`);
chk("S01 ERCO peak = facts", t.includes(n(facts.bas.ERCO.peak_demand_mw)) && t.includes(facts.bas.ERCO.peak_demand_local));
chk("S01 ERCO interchange % = facts", t.includes(String(facts.bas.ERCO.interchange_abs_mean_pct_of_demand) + "%"));
// S02
for (const p of [0.14, 0.36, 0.58, 0.8]) { await go("source", p, 1400); }
t = await txt("source"); out.texts.source = t;
chk("S02 slope 5.49 / CI", /5\.49% DEMAND PER/.test(t), (t.match(/\+[\d.]+% DEMAND PER[^)]*\)/) || [])[0]);
chk("S02 solar share CISO 21.8", /SOLAR 21\.8%/.test(t), (t.match(/SOLAR [\d.]+%[^·]*·[^·]*·[^A-Z]*/g) || []).join(" | "));
chk("S02 rows in = raw_rows_total", t.includes(n(facts.global.raw_rows_total)) && t.includes(n(facts.global.kept_rows_total)), `${facts.global.raw_rows_total} / ${facts.global.kept_rows_total}`);
// S03a
await go("demand", 0.74); t = await txt("demand"); out.texts.demand = t;
const city = await page.evaluate(() => window.__peg.city()); const dbg = await page.evaluate(() => window.__peg.debug());
chk("S03a evening ramp = facts", t.includes(n(facts.bas.CISO.evening_ramp_mw_per_h)), String(facts.bas.CISO.evening_ramp_mw_per_h));
chk("S03a lit windows = round(MW/100)", (() => { const m = t.match(/([\d,]+) MW SERVED/), l = t.match(/(\d+) OF 960 WINDOWS LIT/); return m && l && Math.round(+m[1].replace(/,/g, "") / 100) === +l[1]; })(), (t.match(/[\d,]+ MW SERVED.{0,40}/) || [])[0]);
// S03b
await go("netload", 0.9); t = await txt("netload"); out.texts.netload = t;
chk("S03b partial 2025 marked", /2025\*|PARTIAL/.test(t));
// S04
await go("forecast", 0.9, 2500); t = await txt("forecast"); out.texts.forecast = t;
chk("S04 CISO MAPE ours 3.35 vs EIA 7.82", /3\.35%/.test(t) && /7\.82%/.test(t));
chk("S04 ERCO MAPE ours 4.06 vs EIA 2.23", /4\.06%/.test(t) && /2\.23%/.test(t));
out.s04drift=(t.match(/[^.]*6\.36[^.]*/g)||[]); chk("S04 drift -6.36% printed from facts", t.replace(/\u2212/g, "-").includes(String(facts.eia_ciso_dayahead_bias_pct) + "%"), String(facts.eia_ciso_dayahead_bias_pct));
const cards = await page.evaluate(() => [...document.querySelectorAll("#forecast .verdict, #forecast [class*=verdict]")].map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), fs: getComputedStyle(e.querySelector("h3, .verdict__title, p") ?? e).fontSize, t: e.innerText.slice(0, 60) }; }));
out.verdictCards = cards; console.log("verdict cards", JSON.stringify(cards));
const cmpC = ev.bas.CISO.comparison_vs_eia, cmpE = ev.bas.ERCO.comparison_vs_eia;
out.cmp = { CISO: cmpC, ERCO: cmpE };
chk("S04 CISO diff -4.47 pp CI -4.89 to -4.02", /[-\u2212]4\.47 PP/.test(t) && /[-\u2212]4\.89 TO [-\u2212]4\.02/.test(t), JSON.stringify(cmpC).slice(0, 160));
chk("S04 ERCO diff +1.83 pp CI +1.50 to +2.20", /\+1\.83 PP/.test(t), JSON.stringify(cmpE).slice(0, 160));
chk("S04 CISO coverage 83.4", /83\.4%/.test(t));
// S05 / parity
await go("dispatch", 0.8, 3000);
await page.waitForFunction(() => window.__peg.solver().parity, null, { timeout: 120000 }).catch(() => {});
const sv = await page.evaluate(() => window.__peg.solver()); out.solver = sv;
t = await txt("dispatch"); out.texts.dispatch = t;
chk("parity computed this session (108 vectors)", sv.parity && sv.parity.n === tv.vectors?.length || sv.parity?.n === 108, JSON.stringify(sv.parity));
chk("S05 parity badge text = session report", sv.parity && t.includes(`PARITY ${sv.parity.objective}/${sv.parity.n}`), (t.match(/PARITY[^·]*/) || [])[0]);
chk("S05 SOLVED IN BROWSER label", /SOLVED IN BROWSER/.test(t));
const f = await page.evaluate(() => window.__peg.fill());
const base0 = res.bas.CISO.days.summer.baseline.objective_usd;
chk("S05 baseline objective == Python within 1e-6", Math.abs(f.objective - base0) / base0 < 1e-6, `${f.objective} vs ${base0}`);
chk("S05 displayed model cost == objective (rounded $)", t.includes("MODEL COST $" + n(Math.round(f.objective))), "MODEL COST $" + n(Math.round(f.objective)));
// CTRL: real UI: focus RENEWABLES slider, press keys; DEMAND +%; battery
await go("control", 0, 2500);
const sliders = page.locator("#control input[type=range]");
const nS = await sliders.count();
await sliders.nth(0).focus(); for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight"); // renewables +0.25
await sliders.nth(1).focus(); for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight"); // demand +7
await sliders.nth(3).focus(); for (let i = 0; i < 13; i++) await page.keyboard.press("ArrowRight"); // battery +1300
await page.waitForTimeout(6000);
const c = await page.evaluate(() => window.__peg.ctrl()); out.ctrl = c;
const dom = await page.evaluate(() => { const u = document.querySelector("#control .ctrl-lines"); return { obj: +u.dataset.objective, sum: +u.dataset.breakdownSum, text: u.innerText.replace(/\s+/g, " "), status: document.querySelector("#control .ctrl-status").innerText.replace(/\s+/g, " ") }; });
out.ctrlDom = dom;
chk("CTRL non-preset params", c.params.renewables_scale !== 1 && c.params.demand_growth_pct !== 0 && c.source === "browser", JSON.stringify(c.params));
chk("CTRL displayed cost == objective (rounded $)", dom.text.includes("$" + n(Math.round(c.objective))), dom.text.slice(0, 120));
chk("CTRL data-objective == solver objective; sum(breakdown) within 1e-6", dom.obj === c.objective && Math.abs(dom.sum - c.objective) / c.objective < 1e-6, `${dom.obj} ${dom.sum} ${c.objective}`);
chk("CTRL status says SOLVED IN BROWSER with parity", /SOLVED IN BROWSER/.test(dom.status) && /PARITY/.test(dom.status), dom.status);
// inspector persistence: real click on a CTRL petal, then scroll to S08
const hit = page.locator("#control [role=button]").first(); const bx = await hit.boundingBox(); const view = await page.evaluate(() => window.__peg.view());
await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2 - 40); await page.waitForTimeout(1200);
const insOpen = await page.evaluate(() => !!document.querySelector(".inspector, [class*=inspector]") && [...document.querySelectorAll("[class*=inspector]")].some((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== "hidden"));
await go("closing", 0.5, 1800);
const insAfter = await page.evaluate(() => [...document.querySelectorAll("[class*=inspector]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 50 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(e).visibility !== "hidden" && +getComputedStyle(e).opacity > 0.1; }).map((e) => e.className).slice(0, 3));
await page.screenshot({ path: new URL("../screens/inspector-persists-s08-1440.jpg", import.meta.url).pathname, type: "jpeg", quality: 60 });
chk("Hour Inspector closes when its scene leaves", !(insOpen && insAfter.length), `opened=${insOpen} visibleInS08=${JSON.stringify(insAfter)}`);
// S07 / S08
await go("evidence", 0.5, 2500); t = await txt("evidence"); out.texts.evidence = t;
chk("S07 Wires ILLUSTRATIVE and no MW", /ILLUSTRATIVE/.test(t) && !/\d+\s?MW/.test(await page.evaluate(() => [...document.querySelectorAll("#evidence svg")].map((s) => s.textContent).join(" "))));
await go("evidence", 0.8, 2000); t = await txt("evidence");
chk("S07 parity answer bound to session report", sv.parity && t.includes(`${sv.parity.objective}/${sv.parity.n}`), (t.match(/OBJECTIVE \d+\/\d+[^·]*/) || [])[0]);
await go("closing", 0.97, 2500); t = await txt("closing"); out.texts.closing = t;
// global live claims
const all = await page.evaluate(() => document.body.innerText);
const live = all.match(/[^.\n]*\blive\b[^.\n]*/gi) || [];
out.live = live; chk("no 'live' claims in copy", live.length === 0, JSON.stringify(live));
chk("no U+2014/U+2015 in rendered text", !/[\u2014\u2015]/.test(all));
await ctx.close();
// worker blocked: PRECOMPUTED fallback labelled, never SOLVED IN BROWSER, no parity badge
const c2 = await b.newContext({ viewport: { width: 1440, height: 900 } });
await c2.route(/solver\.worker|\.wasm/, (r) => r.abort());
const p2 = await c2.newPage();
await p2.goto(base + "?quality=high"); await p2.keyboard.press("Escape");
await p2.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
await p2.evaluate(() => window.__peg.jumpTo("dispatch", 0.8)); await p2.waitForTimeout(8000);
const t5 = await p2.evaluate(() => document.getElementById("dispatch").innerText.replace(/\s+/g, " "));
await p2.screenshot({ path: new URL("../screens/worker-blocked-s05-1440.jpg", import.meta.url).pathname, type: "jpeg", quality: 60 });
await p2.evaluate(() => window.__peg.jumpTo("control", 0)); await p2.waitForTimeout(4000);
const tc = await p2.evaluate(() => document.getElementById("control").innerText.replace(/\s+/g, " "));
await p2.screenshot({ path: new URL("../screens/worker-blocked-ctrl-1440.jpg", import.meta.url).pathname, type: "jpeg", quality: 60 });
chk("worker blocked: S05 PRECOMPUTED labelled, no SOLVED IN BROWSER, no PARITY ✓", /PRECOMPUTED/.test(t5) && !/SOLVED IN BROWSER/.test(t5) && !/PARITY \d/.test(t5), t5.match(/(LIVE SOLVER[^.]*|PRECOMPUTED[^·]*)/g)?.slice(0, 3).join(" | "));
chk("worker blocked: CTRL PRECOMPUTED labelled, no parity", /PRECOMPUTED/.test(tc) && !/SOLVED IN BROWSER/.test(tc) && !/PARITY ✓/.test(tc), tc.slice(0, 200));
await b.close();
writeFileSync(new URL("../honesty.json", import.meta.url).pathname, JSON.stringify(out, null, 1));
