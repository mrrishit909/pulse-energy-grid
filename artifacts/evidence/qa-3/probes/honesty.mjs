// P04-QA-003 (from the P04-QA-002 probe) honesty / correctness probe: on-screen numbers vs facts.json and artifacts (values read from the files,
// not hard-coded), the parity badge vs the session report, CTRL non-preset cost == solver objective (real keyboard on
// the real sliders), the worker-blocked fallback, "live" claims, phone verdict parity at 390/375/360.
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const base = "http://localhost:4331/pulse-energy-grid/";
const D = new URL("../../../../site/public/data/", import.meta.url).pathname;
const J = (f) => JSON.parse(readFileSync(D + f));
const facts = J("facts.json"), ev = J("forecast_eval.json"), res = J("dispatch_results.json"), model = J("dispatch_model.json");
const out = { checks: [], texts: {} };
const chk = (name, ok, detail) => { out.checks.push({ name, ok: !!ok, detail }); console.log(ok ? "PASS" : "FAIL", name, detail ?? ""); };
const n = (x) => Math.round(x).toLocaleString("en-US");
const pp = (x) => (x < 0 ? "−" : "+") + Math.abs(x).toFixed(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(base + "?quality=high"); await page.waitForTimeout(300); await page.keyboard.press("Escape");
await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
const go = async (id, p, ms = 1800) => { await page.evaluate(([i, q]) => window.__peg.jumpTo(i, q), [id, p]); await page.waitForTimeout(ms); };
const txt = (id) => page.evaluate((i) => document.getElementById(i).innerText.replace(/\s+/g, " "), id);
const C = facts.bas.CISO, E = facts.bas.ERCO;
// S00
await go("pulse", 0.02, 1500); let t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
const intro = model.bas.CISO.days.find((d) => d.id === "intro");
chk("S00 corner = intro day date + peak", t.includes(`CISO · ${intro.date} · PEAK ${n(Math.max(...intro.demand_mw))} MW`), `${intro.date} ${n(Math.max(...intro.demand_mw))}`);
await go("pulse", 0.9); t = await txt("pulse"); out.texts.pulse = t;
chk("S01 CISO peak MW + local time (17:00 after D-008 fix)", t.includes(n(C.peak_demand_mw)) && t.includes(C.peak_demand_local), `${C.peak_demand_mw} ${C.peak_demand_local}`);
chk("S01 ERCO peak MW + local time", t.includes(n(E.peak_demand_mw)) && t.includes(E.peak_demand_local), `${E.peak_demand_mw} ${E.peak_demand_local}`);
chk("S01 no stale 18:00 peak", !/2022-09-06 18:00|2024-08-20 18:00/.test(t));
chk("S01 ERCO interchange %", t.includes(String(E.interchange_abs_mean_pct_of_demand) + "%"));
// S02
let s2 = ""; for (const p of [0.14, 0.36, 0.58, 0.8]) { await go("source", p, 1400); s2 += " " + await txt("source"); }
out.texts.source = s2;
const wr = J("weather_relation.json").bas.CISO; out.weather = JSON.stringify(wr).slice(0, 300);
chk("S02 CISO slope = facts demand_temp_slope", s2.includes(C.demand_temp_slope_pct_per_c.toFixed(2) + "% DEMAND PER"), (s2.match(/\+[\d.]+% DEMAND PER[^)]*\)/) || [])[0]);
chk("S02 CISO solar/wind/gas shares", s2.includes(`SOLAR ${C.solar_share_pct.toFixed(1)}%`) && s2.includes(`WIND ${C.wind_share_pct.toFixed(1)}%`) && s2.includes(`GAS ${C.gas_share_pct.toFixed(1)}%`), (s2.match(/SOLAR [\d.]+%.{0,60}/) || [])[0]);
chk("S02 rows in / kept", s2.includes(n(facts.global.raw_rows_total)) && s2.includes(n(facts.global.kept_rows_total)));
chk("S02 no stale 5.49 slope", !/5\.49%/.test(s2));
// S03a
await page.evaluate(() => window.__peg.setCity({ ba: "CISO", dayId: "winter" }));
await go("demand", 0.74); t = await txt("demand"); out.texts.demand = t;
chk("S03a evening ramp = facts", t.includes(n(C.evening_ramp_mw_per_h) + " MW PER HOUR"), String(C.evening_ramp_mw_per_h));
const m = t.match(/(\d\d):00 ([\d,]+) MW SERVED/) || t.match(/([\d,]+) MW SERVED/); const lit = t.match(/(\d+) OF 960 WINDOWS LIT/);
const city = await page.evaluate(() => window.__peg.city()); out.city = city;
const wday = model.bas.CISO.days.find((d) => d.id === city.dayId);
const mwShown = m ? +String(m[m.length - 1]).replace(/,/g, "") : NaN;
chk("S03a MW served is a real hour of the day; windows = round(MW/100)", wday.demand_mw.map(Math.round).includes(mwShown) && lit && Math.round(mwShown / 100) === +lit[1], `${mwShown} MW, ${lit?.[1]} windows, day ${wday.date}`);
// S03b
await go("netload", 0.9); t = await txt("netload"); out.texts.netload = t;
chk("S03b partial 2025 marked", /2025\*|PARTIAL/.test(t));
{ const fm = J("fuel_mix.json").bas.CISO.month_hour_mean_mw_by_year; const mm = t.match(/([A-Z]{3}) MIDDAY NET LOAD MIN ([\d,]+) MW AT (\d\d):00/); const yr = (t.match(/· (20\d\d)/) || [])[1];
  const mons = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"]; let ok = false, exp = "";
  if (mm && yr && fm[yr]) { const y = fm[yr], mi = y.months_present === 12 || y.months_present > mons.indexOf(mm[1]) ? mons.indexOf(mm[1]) : -1; const nl = y.demand.slice(mi * 24, mi * 24 + 24).map((d, k) => d - y.SUN[mi * 24 + k] - y.WND[mi * 24 + k]); const mn = Math.min(...nl); exp = `${Math.round(mn)} at ${nl.indexOf(mn)}`; ok = Math.round(mn) === +mm[2].replace(/,/g, "") && nl.indexOf(mn) === +mm[3]; }
  chk("S03b month-mean midday net-load min = fuel_mix by-year means", ok, `${mm?.[0]} (${yr}) expected ${exp}`); }
// S04
await page.evaluate(() => window.__peg.setForecast({ ba: "CISO" }));
await go("forecast", 0.9, 2500); t = await txt("forecast"); out.texts.forecast = t;
const cc = ev.bas.CISO.comparison_vs_eia, ce = ev.bas.ERCO.comparison_vs_eia; out.cmp = { cc, ce };
chk("S04 CISO MAPE ours vs EIA", t.includes(C.test_mape.gbm.toFixed(2) + "%") && t.includes(C.test_mape.eia_day_ahead.toFixed(2) + "%"), `${C.test_mape.gbm} vs ${C.test_mape.eia_day_ahead}`);
chk("S04 CISO diff + CI", t.includes(pp(cc.mape_diff_pp) + " PP") && t.includes(`${pp(cc.mape_diff_ci95[0])} TO ${pp(cc.mape_diff_ci95[1])}`), `${cc.mape_diff_pp} ${cc.mape_diff_ci95}`);
chk("S04 ERCO diff + CI (EIA beats ours, said so)", t.includes(pp(ce.mape_diff_pp) + " PP") && t.includes(`${pp(ce.mape_diff_ci95[0])} TO ${pp(ce.mape_diff_ci95[1])}`) && ce.beats_eia === false, `${ce.mape_diff_pp} ${ce.mape_diff_ci95}`);
chk("S04 ERCO MAPE ours vs EIA", t.includes(E.test_mape.gbm.toFixed(2) + "%") && t.includes(E.test_mape.eia_day_ahead.toFixed(2) + "%"));
chk("S04 CISO drift = facts.eia_ciso_dayahead_bias_pct", t.replace(/−/g, "-").includes(String(facts.eia_ciso_dayahead_bias_pct) + "%"), String(facts.eia_ciso_dayahead_bias_pct));
chk("S04 CISO interval coverage", t.includes(C.interval_coverage_cqr_pct.toFixed(1) + "%"));
// S05 / parity
await go("dispatch", 0.8, 3000);
await page.waitForFunction(() => window.__peg.solver().parity, null, { timeout: 120000 }).catch(() => {});
const sv = await page.evaluate(() => window.__peg.solver()); out.solver = sv;
t = await txt("dispatch"); out.texts.dispatch = t;
const tvN = J("dispatch_test_vectors.json").vectors.length;
chk("parity computed this session over every vector", sv.parity && sv.parity.n === tvN && sv.parity.passed === tvN, JSON.stringify(sv.parity));
chk("S05 parity text = session report (n, prices, keys)", sv.parity && t.includes(`${sv.parity.objective}/${sv.parity.n}`) && t.includes(`${sv.parity.price}/${sv.parity.priceComparable}`), (t.match(/PARITY[^·]*·[^·]*·[^·]*·[^·]*/) || [])[0]);
const f = await page.evaluate(() => window.__peg.fill());
const base0 = res.bas[f.ba].days[f.dayId].baseline.objective_usd;
chk("S05 baseline objective == Python within 1e-6", Math.abs(f.objective - base0) / base0 < 1e-6, `${f.ba} ${f.dayId} ${f.objective} vs ${base0}`);
chk("S05 displayed model cost == objective", t.includes("MODEL COST $" + n(f.objective)), "MODEL COST $" + n(f.objective));
// S06 heat wave ledger
await page.evaluate(() => window.__peg.setStress({ layer: "stack" }));
await go("stress", 0.64, 2000); t = await txt("stress"); out.texts.stress = t;
const st = await page.evaluate(() => window.__peg.stress()); out.stress = st;
const sd = res.bas[st.ba ?? "CISO"].days[st.dayId ?? "summer"];
chk("S06 heat-wave ledger cost/CO2/unserved = dispatch_results", t.includes(`$${n(sd.baseline.objective_usd)} → $${n(sd.heat_wave.objective_usd)}`) && t.includes(`${n(sd.baseline.co2_t)} T → ${n(sd.heat_wave.co2_t)} T`) && t.includes(`${n(sd.heat_wave.unserved_mwh)} MWH`), `${n(sd.heat_wave.objective_usd)} ${n(sd.heat_wave.co2_t)} ${n(sd.heat_wave.unserved_mwh)}`);
chk("S06 max price heat = max(price_usd_mwh)", t.includes("$" + Math.max(...sd.heat_wave.price_usd_mwh).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })), String(Math.max(...sd.heat_wave.price_usd_mwh)));
// CTRL: real UI keyboard on real sliders
await go("control", 0, 2500);
const sliders = page.locator("#control input[type=range]");
await sliders.nth(0).focus(); for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
await sliders.nth(1).focus(); for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowRight");
await sliders.nth(3).focus(); for (let i = 0; i < 11; i++) await page.keyboard.press("ArrowRight");
await page.waitForTimeout(6000);
const c = await page.evaluate(() => window.__peg.ctrl()); out.ctrl = c;
const dom = await page.evaluate(() => { const u = document.querySelector("#control .ctrl-lines"); return { obj: +u.dataset.objective, sum: +u.dataset.breakdownSum, text: u.innerText.replace(/\s+/g, " "), status: document.querySelector("#control .ctrl-status").innerText.replace(/\s+/g, " ") }; });
out.ctrlDom = dom;
chk("CTRL non-preset, solved in browser", c.source === "browser" && !Object.values(res.bas[c.ba].days[c.dayId]).some((r) => Math.abs(r.objective_usd - c.objective) < 1), JSON.stringify(c.params));
chk("CTRL displayed cost == objective", dom.text.includes("$" + n(c.objective)), dom.text.slice(0, 120));
chk("CTRL data-objective == solver objective; sum(breakdown) within 1e-6", dom.obj === c.objective && Math.abs(dom.sum - c.objective) / c.objective < 1e-6, `${dom.obj} ${dom.sum} ${c.objective}`);
chk("CTRL status SOLVED IN BROWSER + parity", /SOLVED IN BROWSER/.test(dom.status) && /PARITY/.test(dom.status), dom.status);
// S07
await go("evidence", 0.5, 2500); t = await txt("evidence");
chk("S07 Wires ILLUSTRATIVE, no MW in the SVG", /ILLUSTRATIVE/.test(t) && !/\d+\s?MW/.test(await page.evaluate(() => [...document.querySelectorAll("#evidence svg")].map((s) => s.textContent).join(" "))));
await go("evidence", 0.8, 2000); t = await txt("evidence"); out.texts.evidence = t;
chk("S07 parity answer = session report", sv.parity && t.includes(`${sv.parity.objective}/${sv.parity.n}`), (t.match(/[^.]{0,40}\d+\/\d+[^.]{0,40}/) || [])[0]);
const all = await page.evaluate(() => document.body.innerText);
const live = all.match(/[^.\n]*\blive\b[^.\n]*/gi) || []; out.live = live;
chk("no 'live' claims", live.length === 0, JSON.stringify(live));
chk("no U+2014/U+2015 in rendered text", !/[\u2014\u2015]/.test(all));
await ctx.close();
// phone verdict parity (ED #25, D-009)
for (const [w, h] of [[390, 844], [375, 812], [360, 800]]) {
  const cx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true }); const p = await cx.newPage();
  await p.goto(base + "?quality=high"); await p.waitForTimeout(300); await p.keyboard.press("Escape");
  await p.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
  const v = {};
  for (const ba of ["CISO", "ERCO"]) {
    await p.evaluate((x) => window.__peg.setForecast({ ba: x }), ba);
    await p.evaluate(() => window.__peg.jumpTo("forecast", 0.9)); await p.waitForTimeout(2500);
    v[ba] = await p.evaluate(() => [...document.querySelectorAll("#forecast .fc-card")].filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const r = e.getBoundingClientRect(); return { ba: e.dataset.ba, box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], inView: r.top >= 0 && r.bottom <= innerHeight, titleFs: getComputedStyle(e.querySelector("h3")).fontSize, monoFs: getComputedStyle(e.querySelector(".fc-card__mono")).fontSize, text: e.innerText.replace(/\s+/g, " ") }; }));
    await p.screenshot({ path: new URL(`../screens/verdict-${ba}-${w}.jpg`, import.meta.url).pathname, type: "jpeg", quality: 55 });
  }
  out[`verdict${w}`] = v;
  const allTxt = JSON.stringify(v);
  const cards = v.CISO; const ci = cards.find((c) => c.ba === "CISO"), er = cards.find((c) => c.ba === "ERCO");
  chk(`phone ${w}: each verdict card states its diff + 95% CI`, ci && er && ci.text.includes(pp(cc.mape_diff_pp) + " PP") && /95% CI/.test(ci.text) && er.text.includes(pp(ce.mape_diff_pp) + " PP") && /95% CI/.test(er.text), JSON.stringify(cards.map((c) => [c.ba, c.box, c.titleFs, c.monoFs])));
  chk(`phone ${w}: cards equally prominent (same width, title and mono size, height within 15%)`, ci && er && ci.box[2] === er.box[2] && ci.titleFs === er.titleFs && ci.monoFs === er.monoFs && Math.abs(ci.box[3] - er.box[3]) / Math.max(ci.box[3], er.box[3]) <= 0.15, JSON.stringify(cards.map((c) => [c.ba, c.box, c.titleFs, c.monoFs])));
  await cx.close();
}
// worker blocked: PRECOMPUTED fallback
const c2 = await b.newContext({ viewport: { width: 1440, height: 900 } });
await c2.route(/solver\.worker|\.wasm/, (r) => r.abort());
const p2 = await c2.newPage();
await p2.goto(base + "?quality=high"); await p2.waitForTimeout(300); await p2.keyboard.press("Escape");
await p2.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
await p2.evaluate(() => window.__peg.jumpTo("dispatch", 0.8)); await p2.waitForTimeout(8000);
const t5 = await p2.evaluate(() => document.getElementById("dispatch").innerText.replace(/\s+/g, " "));
await p2.evaluate(() => window.__peg.jumpTo("control", 0)); await p2.waitForTimeout(4000);
const tc = await p2.evaluate(() => document.getElementById("control").innerText.replace(/\s+/g, " "));
chk("worker blocked: S05 PRECOMPUTED, no SOLVED IN BROWSER, no parity", /PRECOMPUTED/.test(t5) && !/SOLVED IN BROWSER/.test(t5) && !/PARITY \d/.test(t5));
chk("worker blocked: CTRL PRECOMPUTED, no parity", /PRECOMPUTED/.test(tc) && !/SOLVED IN BROWSER/.test(tc) && !/PARITY \d/.test(tc));
await b.close();
writeFileSync(new URL("../honesty.json", import.meta.url).pathname, JSON.stringify(out, null, 1));
console.log("passed", out.checks.filter((x) => x.ok).length, "/", out.checks.length);
