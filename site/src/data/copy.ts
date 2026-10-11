/**
 * Copy deck (VISUAL_DESIGN 5). Every number on screen is formatted here from a named field
 * (facts.json, dispatch_model.json, a dispatch result, the parity report, window-city.json),
 * so the copy-parity Vitest can check rendered strings against the artifacts.
 * Mono copy is uppercase; serif statements are sentence case. No U+2014/U+2015.
 */
import { fixed, hh, int, signedInt, signedUsd, usd } from "../model/format";
import { CITY } from "../model/city";
import { OBS_LABEL } from "../model/stack";
import type { BAModel, Day, DispatchResult, Facts } from "../model/types";
import type { ParityReport } from "../model/solve";

export const BA_NAME = { CISO: "CALIFORNIA (CAISO)", ERCO: "TEXAS (ERCOT)" } as const;

/** dispatch_model.bas.CISO.days[intro]: the S00 day (DR-2). */
export function copyS00(day: Day) {
  const peak = Math.max(...day.demand_mw);
  return {
    headline: "The invisible machine that powers everything.",
    wordmark: "PULSE ENERGY GRID",
    corner: `CISO · ${day.date} · PEAK ${int(peak)} MW`,
    chip: "EIA-930 · 1 PETAL = 1 HOUR",
    note: "AREA = MW · NOON AT TOP · CLEANEST AT THE CENTRE",
    alt: "Animated introduction: one day of California's grid drawn as 24 petals, one per hour, noon at the top. Each petal's area is the electricity used in that hour. It fills from the centre with solar, wind, nuclear, hydro, imports and other sources, and gas burns at the rim.",
  };
}
export const fuelName = (key: string) => OBS_LABEL[key] ?? key.toUpperCase();

export const copyS03a = {
  statement: "Every window is a hundred megawatts.",
  kicker: (ba: string) => `DEMAND · ${ba} · ONE REAL DAY, HOUR BY HOUR`,
  note: `BUILDINGS ARE GROUPS OF ${CITY.windows_per_building} WINDOWS (${int(CITY.windows_per_building * CITY.mw_per_window)} MW), NOT PLACES.`,
  windowChip: `EIA-930 · DERIVED: 1 WINDOW = ${CITY.mw_per_window} MW`,
  tempChip: "NOAA ISD · DERIVED WEIGHTS",
  empty: "FUEL BREAKDOWN NOT PUBLISHED FOR THIS DAY",
  scale: "THE ROSE IS SCALED TO THIS DAY'S PEAK; THE WINDOWS KEEP ONE SCALE FOR EVERY DAY.",
};
/** S03a readout for one integer hour of a reference day (dispatch_model days[]). */
export function cityReadout(day: Day, hour: number, lit: number) {
  const mw = day.demand_mw[hour]!;
  const prev = hour > 0 ? day.demand_mw[hour - 1]! : null;
  return {
    hour: hh(hour),
    served: `${int(mw)} MW SERVED`,
    lit: `${int(lit)} OF ${int(CITY.total_windows)} WINDOWS LIT`,
    temp: `${fixed(day.temp_c[hour]!, 1)} °C · POP.-WEIGHTED`,
    delta: prev === null ? "FIRST HOUR OF THE DAY" : `${signedInt(mw - prev)} MW SINCE ${hh(hour - 1)}`,
  };
}
/** facts.bas[ba].evening_ramp_mw_per_h (DERIVED). */
export const rampNote = (f: Facts, ba: "CISO" | "ERCO") =>
  `TYPICAL EVENING RAMP IN ${ba}: ${int(f.bas[ba].evening_ramp_mw_per_h as number)} MW PER HOUR.`;

export const copyS05 = {
  s1: "The cheapest power goes first.",
  s2: "A battery moves noon into the evening.",
  footer: (m: BAModel) => `MODEL OF ${m.classes.filter((c) => c.kind === "dispatchable").length} GENERATOR CLASSES. COSTS ARE ASSUMPTIONS, NOT MARKET PRICES.`,
};
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
/** Ledger rows (display order) for a result: MWh and MODEL cost per class. */
export function ledgerRows(m: BAModel, day: Day, r: DispatchResult) {
  const label = (k: string) => k === "battery_discharge" ? "BATTERY" : k === "imports" ? "IMPORTS (OBSERVED)" : k === "other" ? "OTHER MUST-RUN" : (m.classes.find((c) => c.id === k)?.label ?? k).toUpperCase();
  const mwh = (k: string) => k === "solar" ? sum(r.renewable_used_mw.solar) : k === "wind" ? sum(r.renewable_used_mw.wind) : k === "imports" ? sum(day.net_imports_mw.map((v) => Math.max(0, v))) : k === "other" ? sum(day.fixed_other_mw) : sum(r.dispatch_mw[k] ?? []);
  return m.display_order.map((k) => {
    // imports and other are fixed OBSERVED inputs (not costed); solar and wind cost 0 (classes[].marginal_cost_usd_mwh)
    const cost = k === "battery_discharge" ? (r.cost_breakdown_usd.battery_wear ?? 0) : k === "imports" || k === "other" ? null : (r.cost_breakdown_usd[k] ?? 0);
    return { key: k, label: label(k), mwh: mwh(k), cost };
  });
}
export const ledgerLine = (row: { mwh: number; cost: number | null }) => ({ mwh: `${int(row.mwh)} MWH`, cost: row.cost === null ? "OBSERVED INPUT" : `MODEL ${usd(row.cost)}` });
export const totalLine = (r: DispatchResult) => `MODEL COST ${usd(r.objective_usd)} = SOLVER OBJECTIVE`;
export const co2Line = (r: DispatchResult) => `MODEL CO2 ${int(r.co2_t)} T`;
export const unservedLine = (r: DispatchResult) => r.unserved_mwh > 0.5 ? `MODEL UNSERVED ${int(r.unserved_mwh)} MWH` : null;
/** Δ vs the precomputed baseline of the same GRID and DAY. */
export function deltaLines(r: DispatchResult, base: DispatchResult) {
  const gas = (x: DispatchResult) => Object.entries(x.dispatch_mw).filter(([k]) => k === "ccgt" || k === "peaker").reduce((a, [, v]) => a + sum(v.slice(17, 23)), 0);
  return [
    `EVENING GAS 17-22H ${signedInt(gas(r) - gas(base))} MWH`,
    `CURTAILED ${signedInt(r.curtailed_mwh - base.curtailed_mwh)} MWH`,
    `COST ${signedUsd(r.objective_usd - base.objective_usd)}`,
    `CO2 ${signedInt(r.co2_t - base.co2_t)} T`,
  ];
}
export function parityLine(p: ParityReport) {
  return `PARITY ${p.passed}/${p.n} VECTORS · OBJECTIVE WITHIN 1E-6 ${p.objective}/${p.n} · PRICES ${p.price}/${p.priceComparable} WHERE UNIQUE · LP TEXT SHA-256 ${p.hash}/${p.n}`;
}
export const parityShort = (p: ParityReport) => `PARITY ${p.passed}/${p.n} VECTORS ON THIS BUILD · LP TEXT SHA ${p.hash}/${p.n}`;
export function statusLine(s: { status: string; version: string; pct: number | null; source: string; ms: number; parity: ParityReport | null; error: string | null; solving: boolean }) {
  if (s.source === "browser") {
    return `SOLVED IN BROWSER · HiGHS ${s.version} (highs-js 1.15.3) · ${s.ms < 1 ? "<1" : int(s.ms)} MS`;
  }
  if (s.status === "loading") return `PRECOMPUTED · PYTHON HiGHS · LIVE SOLVER LOADING${s.pct === null ? "" : ` · ${s.pct}%`}`;
  if (s.status === "error") return "LIVE SOLVER UNAVAILABLE: SHOWING PRECOMPUTED PYTHON RESULTS";
  if (s.status === "disabled") return "LIVE SOLVER DISABLED FOR THIS SESSION: SHOWING PRECOMPUTED PYTHON RESULTS";
  return "PRECOMPUTED · PYTHON HiGHS";
}

// ---------------------------------------------------------------- Hour Inspector (interaction 9)
export interface InspectorCopy { chip: string; title: string; tag: "OBSERVED" | "SIMULATED"; rows: { label: string; value: string; key?: string }[]; check: { text: string; ok: boolean } }
/** OBSERVED (S03a): positive bands - sinks + the balance residual = demand; the residual is shown, never absorbed. */
export function inspectorObserved(ba: string, day: Day, h: number): InspectorCopy {
  const gen = day.observed_gen_mw;
  const rows: InspectorCopy["rows"] = [];
  let P = 0, K = 0;
  for (const k of ["SUN", "WND", "NUC", "WAT", "OTH", "NG", "COL", "OIL"]) {
    const v = gen[k]?.[h];
    if (v === undefined) continue;
    if (v > 0) { P += v; rows.push({ key: k, label: fuelName(k), value: `${int(v)} MW` }); } else if (v < 0) K -= v;
  }
  const ti = day.observed_interchange_mw[h]!;
  if (ti < 0) { P += -ti; rows.push({ key: "IMPORTS", label: "IMPORTS", value: `${int(-ti)} MW` }); }
  const ex = Math.max(0, ti);
  if (K > 0.5) rows.push({ label: "CHARGING, STATION USE (SINK)", value: `−${int(K)} MW` });
  if (ex > 0.5) rows.push({ label: "EXPORTS (SINK)", value: `−${int(ex)} MW` });
  const D = day.demand_mw[h]!;
  const R = D - (P - K - ex);
  rows.push({ label: "BALANCE RESIDUAL (AS REPORTED)", value: `${signedInt(R)} MW` });
  rows.push({ label: "TEMPERATURE · POP.-WEIGHTED", value: `${fixed(day.temp_c[h]!, 1)} °C` });
  return {
    chip: `HOUR ${hh(h)} · ${ba} · ${day.date}`, title: hh(h), tag: "OBSERVED", rows,
    check: { text: `BANDS ${int(P)} − SINKS ${int(K + ex)} + RESIDUAL ${signedInt(R)} = DEMAND ${int(D)} MW`, ok: Math.abs(P - K - ex + R - D) <= 0.5 },
  };
}
/** SIMULATED (S05, S06, CTRL): positive bands - sinks = served; served + unserved = demand (0.5 MW). */
export function inspectorSimulated(ba: string, m: BAModel, day: Day, demand: number[], r: DispatchResult, h: number): InspectorCopy {
  const rows: InspectorCopy["rows"] = [];
  let P = 0;
  for (const k of m.display_order) {
    const v = k === "solar" ? r.renewable_used_mw.solar[h]! : k === "wind" ? r.renewable_used_mw.wind[h]! : k === "imports" ? Math.max(0, day.net_imports_mw[h]!) : k === "other" ? day.fixed_other_mw[h]! : (r.dispatch_mw[k]?.[h] ?? 0);
    P += v;
    if (v > 0.5) rows.push({ key: k, label: ledgerRows(m, day, r).find((x) => x.key === k)!.label, value: `${int(v)} MW` });
  }
  const ch = r.battery.charge_mw[h]!, ex = Math.max(0, -day.net_imports_mw[h]!), un = r.unserved_mw[h]!, cu = r.curtailment_mw[h]!;
  if (ch > 0.5) rows.push({ label: "BATTERY CHARGING (SINK)", value: `−${int(ch)} MW` });
  if (ex > 0.5) rows.push({ label: "EXPORTS (SINK)", value: `−${int(ex)} MW` });
  const D = demand[h]!, served = P - ch - ex;
  rows.push({ label: "PRICE (SHADOW, MODEL)", value: `$${fixed(r.price_usd_mwh[h]!, 2)}/MWH` });
  rows.push({ label: "SET BY", value: r.marginal_class[h]!.toUpperCase() });
  rows.push({ label: "MODEL SOC", value: `${int(r.battery.soc_mwh[h]!)} → ${int(r.battery.soc_mwh[h + 1]!)} MWH` });
  rows.push({ label: "CURTAILED", value: `${int(cu)} MW` });
  rows.push({ label: "UNSERVED", value: `${int(un)} MW` });
  return {
    chip: `HOUR ${hh(h)} · ${ba} · ${day.date}`, title: hh(h), tag: "SIMULATED", rows,
    check: { text: `SERVED ${int(served)} + UNSERVED ${int(un)} = DEMAND ${int(D)} MW`, ok: Math.abs(served + un - D) <= 0.5 },
  };
}

// ---------------------------------------------------------------- S06 Stress
export const STRESS_ORDER = ["renewables_up", "demand_growth", "battery_big", "heat_wave", "outage"] as const;
export const copyS06 = { kicker: "STRESS · FIVE WAYS TO PUSH THE MACHINE", missing: "SCENARIO NOT PUBLISHED FOR THIS DAY", ghost: "DASHED: BASELINE DEMAND" };
/** BASELINE → SCENARIO (Δ) rows; every value is a dispatch_results field of the same (ba, day). */
export function stressRows(b: DispatchResult, x: DispatchResult) {
  const maxP = (r: DispatchResult) => Math.max(...r.price_usd_mwh);
  const row = (label: string, a: number, c: number, f: (v: number) => string, df: (v: number) => string) => ({ label, text: `${f(a)} → ${f(c)} (${df(c - a)})` });
  return [
    row("MODEL COST", b.objective_usd, x.objective_usd, usd, signedUsd),
    row("MODEL CO2", b.co2_t, x.co2_t, (v) => `${int(v)} T`, (v) => `${signedInt(v)} T`),
    row("UNSERVED", b.unserved_mwh, x.unserved_mwh, (v) => `${int(v)} MWH`, (v) => `${signedInt(v)} MWH`),
    row("CURTAILED", b.curtailed_mwh, x.curtailed_mwh, (v) => `${int(v)} MWH`, (v) => `${signedInt(v)} MWH`),
    row("MAX PRICE", maxP(b), maxP(x), (v) => `$${fixed(v, 1)}`, (v) => `${v >= 0 ? "+" : "−"}$${fixed(Math.abs(v), 1)}`),
    row("RENEWABLE SHARE", b.renewable_share_pct, x.renewable_share_pct, (v) => `${fixed(v, 1)}%`, (v) => `${v >= 0 ? "+" : "−"}${fixed(Math.abs(v), 1)} PP`),
  ];
}

// ---------------------------------------------------------------- CTRL
export const copyCtrl = {
  kicker: "THE CONTROL ROOM",
  line: "Run tomorrow yourself.",
  note: "A SINGLE-NODE, 24-HOUR LINEAR PROGRAM. NO NETWORK LIMITS, NO START-UP DECISIONS, NO RESERVES. SEE LIMITATIONS.",
  timeLimit: "TIME LIMIT",
};
/** CTRL ledger: each line with its Δ vs the precomputed baseline of the same GRID and DAY. */
export function ctrlLedger(r: DispatchResult, b: DispatchResult | null) {
  const d = (x: number, y: number | undefined, f: (v: number) => string) => (y === undefined ? "" : ` (${f(x - y)} VS BASELINE)`);
  const maxP = (x: DispatchResult) => Math.max(...x.price_usd_mwh);
  return [
    { id: "cost", text: `MODEL COST ${usd(r.objective_usd)} = SOLVER OBJECTIVE ✓${d(r.objective_usd, b?.objective_usd, signedUsd)}` },
    { id: "co2", text: `MODEL CO2 ${int(r.co2_t)} T${d(r.co2_t, b?.co2_t, (v) => `${signedInt(v)} T`)}` },
    { id: "unserved", text: `UNSERVED ${int(r.unserved_mwh)} MWH${d(r.unserved_mwh, b?.unserved_mwh, (v) => `${signedInt(v)} MWH`)}` },
    { id: "curtailed", text: `CURTAILED ${int(r.curtailed_mwh)} MWH${d(r.curtailed_mwh, b?.curtailed_mwh, (v) => `${signedInt(v)} MWH`)}` },
    { id: "renewable", text: `RENEWABLE SHARE ${fixed(r.renewable_share_pct, 1)}%${d(r.renewable_share_pct, b?.renewable_share_pct, (v) => `${v >= 0 ? "+" : "−"}${fixed(Math.abs(v), 1)} PP`)}` },
    { id: "price", text: `MAX PRICE $${fixed(maxP(r), 1)}/MWH${d(maxP(r), b ? maxP(b) : undefined, (v) => `${v >= 0 ? "+" : "−"}$${fixed(Math.abs(v), 1)}`)}` },
  ];
}
export const fmtControl = (unit: string, v: number) => (unit === "x" ? `×${v.toFixed(2)}` : unit === "%" ? `${v > 0 ? "+" : ""}${int(v)}%` : unit === "C" ? `+${fixed(v, 1)} °C` : unit === "h" ? `${int(v)} H` : unit === "MW" ? `${int(v)} MW` : `${int(v)}%`);

// ---------------------------------------------------------------- S04 Forecast
import type { ForecastEval, ForecastSamples, Week } from "../model/types";
export const MODEL_LABEL: Record<string, string> = {
  actual: "ACTUAL (OBSERVED)", seasonal_naive: "SEASONAL NAIVE", eia_day_ahead: "EIA DAY-AHEAD (PUBLISHED BY THE BA)", gbm: "OURS P50",
  eia_debiased: "EIA, BIAS-CORRECTED (PREDICTED)", gbm_stacked: "OURS, STACKED ON EIA", gbm_perfect_weather: "OURS WITH PERFECT WEATHER",
};
export const copyS04 = {
  statement: "Tomorrow, unrolled.",
  legend: "ACTUAL ━ · EIA DAY-AHEAD ╌ · SEASONAL NAIVE ┈ · OURS P50 ━ / P10-P90 ▨",
  table: "DATA TABLE FOR THIS WEEK",
};
const pp = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : "±"}${fixed(Math.abs(x), 2)}`;
/**
 * The verdict for one BA (VISUAL_DESIGN S04 copy): the comparisons[] row where model = best_model and
 * baseline = eia_day_ahead; when no such row exists (ERCO's best model is eia_debiased itself), the headline
 * comparison_vs_eia (our gbm vs EIA) is used and labelled so. A row whose CI crosses 0 says no clear winner.
 */
export function verdict(fe: ForecastEval, ba: "CISO" | "ERCO") {
  const b = fe.bas[ba];
  const best = b.comparison_vs_eia.best_model;
  const row = b.comparisons.find((c) => c.model === best && c.baseline === "eia_day_ahead");
  const gbmRow = b.comparisons.find((c) => c.model === "gbm" && c.baseline === "eia_day_ahead")!;
  const used = row ?? gbmRow;
  const beats = row ? row.mape_diff_pp < 0 : b.comparison_vs_eia.beats_eia;
  const serif = !used.significant ? "No clear winner over the operator's forecast." : beats ? "Our model beat the operator's own forecast." : "The operator's own forecast is still better.";
  const ours = b.models.gbm!.mape_pct, eia = b.models.eia_day_ahead!.mape_pct;
  const ci = `95% CI ${pp(used.ci95[0])} TO ${pp(used.ci95[1])}`;
  return {
    ba, serif,
    mono: `${ba}: MAPE OURS ${fixed(ours, 2)}% VS EIA ${fixed(eia, 2)}% OVER ${int(b.common_test_hours)} TEST HOURS. DIFFERENCE ${pp(gbmRow.mape_diff_pp)} PP (${`95% CI ${pp(gbmRow.ci95[0])} TO ${pp(gbmRow.ci95[1])}`}).${beats ? "" : " WE SAY SO."}`,
    basis: row ? `BEST MODEL ${MODEL_LABEL[best] ?? best}: ${pp(row.mape_diff_pp)} PP VS EIA (${ci})` : `BEST MODEL HERE IS ${MODEL_LABEL[best] ?? best}; THE VERDICT USES OUR GBM VS EIA (comparison_vs_eia)`.toUpperCase(),
    beats, significant: used.significant,
  };
}
/** ED #25: the drift of EIA's CISO day-ahead series, bound to facts and the eia_debiased comparison. */
export function biasLine(f: Facts & { eia_ciso_dayahead_bias_pct?: number; eia_ciso_dayahead_bias_year?: number }, fe: ForecastEval) {
  const deb = fe.bas.CISO.comparisons.find((c) => c.model === "gbm" && c.baseline === "eia_debiased")!;
  return `EIA'S CISO DAY-AHEAD SERIES DRIFTED TO ${pp(f.eia_ciso_dayahead_bias_pct!)}% BIAS IN ${f.eia_ciso_dayahead_bias_year} (PARTIAL YEAR), SO PART OF OUR CISO MARGIN IS THAT DRIFT. BIAS-CORRECTED, EIA SCORES ${fixed(fe.bas.CISO.models.eia_debiased!.mape_pct, 2)}%; OURS IS STILL ${fixed(Math.abs(deb.mape_diff_pp), 2)} PP LOWER (95% CI ${pp(deb.ci95[0])} TO ${pp(deb.ci95[1])}).`;
}
/** Week-level numbers, computed in the client from the sample arrays and labelled THIS WEEK. */
export function weekStats(w: Week, interval: "raw" | "cqr") {
  const mape = (pred: (number | null)[]) => {
    let s = 0, n = 0;
    w.actual_mw.forEach((a, i) => { const p = pred[i]; if (a !== null && p !== null && p !== undefined && a > 0) { s += Math.abs(p - a) / a; n++; } });
    return n ? (s / n) * 100 : null;
  };
  const lo = interval === "raw" ? w.gbm_p10_mw : w.gbm_p10_cqr_mw, hi = interval === "raw" ? w.gbm_p90_mw : w.gbm_p90_cqr_mw;
  let covered = 0, hours = 0;
  w.actual_mw.forEach((a, i) => { if (a === null || lo[i] === null || hi[i] === null) return; hours++; if (lo[i]! <= a && a <= hi[i]!) covered++; });
  const missing = w.actual_mw.filter((a) => a === null).length;
  return { mape: { seasonal_naive: mape(w.naive_mw), eia_day_ahead: mape(w.eia_mw), gbm: mape(w.gbm_mw), best: mape(w.best_mw) }, covered, hours, missing };
}
export function coverageLine(fe: ForecastEval, ba: "CISO" | "ERCO", interval: "raw" | "cqr", week: { covered: number; hours: number }) {
  const iv = fe.bas[ba].intervals.gbm!;
  const whole = interval === "raw" ? iv.raw_coverage_pct : iv.cqr_coverage_pct;
  return {
    week: `THIS WEEK: ${week.covered} OF ${week.hours} HOURS INSIDE THE BAND (${fixed((week.covered / Math.max(1, week.hours)) * 100, 1)}% · NOMINAL ${fixed(iv.nominal_pct, 0)}%)`,
    whole: `WHOLE TEST PERIOD (${int(fe.bas[ba].common_test_hours)} H): ${fixed(whole, 1)}% INSIDE THE ${interval === "raw" ? "RAW" : "CALIBRATED"} BAND`,
  };
}
export function calendarCaption(fs: ForecastSamples, ba: "CISO" | "ERCO") {
  const d = fs.bas[ba].daily_test;
  let k = 0, n = 0;
  d.mape_gbm.forEach((g, i) => { const e = d.mape_eia[i]; if (g === null || e === null || e === undefined) return; n++; if (g < e) k++; });
  return { k, n, text: `OURS LOWER ON ${k} OF ${n} TEST DAYS` };
}

// ---------------------------------------------------------------- S03b The Bite
export const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export const copyS03b = {
  demand: "Every month draws a different day.",
  net: "The sun takes a bite out of noon.",
  mix: "IMPORTS AND BALANCE = MEAN DEMAND − MEAN GENERATION (DERIVED). IN YEAR STEPS THE OTHER SOURCES KEEP THEIR ALL-YEARS MIX, SCALED TO THAT YEAR'S NET LOAD.",
  noYears: "PER-YEAR PROFILES NOT PUBLISHED",
};
/** The bite ledger from a mean day's net load (24 values): midday (10-15h) minimum, evening (16-23h) maximum, the ramp between. */
export function biteLedger(net: number[]) {
  let mi = 10, ma = 16;
  for (let h = 10; h <= 15; h++) if (net[h]! < net[mi]!) mi = h;
  for (let h = 16; h <= 23; h++) if (net[h]! > net[ma]!) ma = h;
  return {
    min: `MIDDAY NET LOAD MIN ${int(net[mi]!)} MW AT ${hh(mi)}`,
    max: `EVENING NET LOAD MAX ${int(net[ma]!)} MW AT ${hh(ma)}`,
    ramp: `RAMP ${int(net[ma]! - net[mi]!)} MW IN ${ma - mi} H`,
    minMw: net[mi]!, minH: mi,
  };
}
export const yearCaption = (year: string, mon: number, mw: number, partial: boolean) =>
  `${year}: MIDDAY NET LOAD FELL TO ${int(mw)} MW IN ${MONTHS[mon - 1]} (MEAN DAY).${partial ? " PARTIAL YEAR." : ""}`;

// ---------------------------------------------------------------- S01 Big Idea
export const copyS01 = { statement: "A grid keeps no stock. Every hour, supply has to meet demand exactly." };
/** The two notification cards (facts.json, DR-9). */
export function s01Cards(f: Facts) {
  const c = f.bas.CISO, e = f.bas.ERCO;
  return [
    { from: "FROM: EIA-930 / CISO", when: String(c.peak_demand_local), body: `PEAK DEMAND ${int(c.peak_demand_mw)} MW. EVERY MEGAWATT WAS MADE OR IMPORTED IN THAT SAME HOUR.` },
    { from: "FROM: EIA-930 / ERCO", when: String(e.peak_demand_local), body: `ERCOT PEAKED AT ${int(e.peak_demand_mw)} MW, WITH NET INTERCHANGE AVERAGING ${fixed(e.interchange_abs_mean_pct_of_demand as number, 2)}% OF DEMAND.` },
  ];
}

// ---------------------------------------------------------------- S02 Ledger Deck
import type { Quality, Reconciliation, WeatherRelation, Meta } from "../model/types";
export const copyS02 = {
  kicker: "SOURCE · WHERE EVERY NUMBER COMES FROM",
  c1: { title: "One hour, one petal.", body: "EIA-930 REPORTS, FOR EVERY HOUR AND EVERY BALANCING AUTHORITY, HOW MUCH POWER WAS USED, WHAT THE OPERATOR EXPECTED, AND WHAT EACH FUEL MADE.",
    fields: ["BA", "HOUR (UTC)", "DEMAND", "DAY-AHEAD FORECAST", "NET GENERATION", "INTERCHANGE", "GENERATION BY FUEL ×8"] },
  c2: { title: "Two grids, two weathers.", body: "CALIFORNIA RUNS ON SUN AND IMPORTS. TEXAS RUNS ON GAS AND WIND AND BARELY TRADES WITH ITS NEIGHBOURS." },
  c3: { title: "Heat leans on the load." },
  c4: { title: "Every row is counted.", body: "RAW ROWS = KEPT + EXCLUDED, FOR EVERY SERIES. NOTHING IS SILENTLY DROPPED." },
};
export const sharesLine = (f: Facts, ba: "CISO" | "ERCO") => `SOLAR ${fixed(f.bas[ba].solar_share_pct as number, 1)}% · WIND ${fixed(f.bas[ba].wind_share_pct as number, 1)}% · GAS ${fixed(f.bas[ba].gas_share_pct as number, 1)}%`;
export function heatCopy(w: WeatherRelation, ba: "CISO" | "ERCO") {
  const b = w.bas[ba];
  return {
    readout: `+${fixed(b.pct_demand_per_c_above_base, 2)}% DEMAND PER °C ABOVE ${fixed(b.cool_base_c, 0)} °C (95% CI ${fixed(b.pct_ci[0], 2)} TO ${fixed(b.pct_ci[1], 2)})`,
    body: `ABOVE ${fixed(b.cool_base_c, 0)} °C, EVERY EXTRA DEGREE ADDS ABOUT ${fixed(b.pct_demand_per_c_above_base, 1)}% TO DEMAND. AN ASSOCIATION FITTED ON ${int(b.n)} HOURS, NOT A FORECAST.`,
  };
}
/** Card 4: the ledger identities recomputed in the client (a failed identity shows ✗), and the data's own quirks. */
export function ledgerCopy(r: Reconciliation, q: Quality, f: Facts, meta: Meta) {
  const rows = (["CISO", "ERCO"] as const).map((ba) => {
    const L = r.ledger.filter((x) => x.ba === ba);
    const a = L.every((x) => x.grid_slots === x.raw_rows + x.missing_slots), b = L.every((x) => x.raw_rows === x.kept + x.null_value + x.flagged_outlier);
    const dst = q.dst[ba].days_23h + q.dst[ba].days_25h;
    return { ba, n: L.length, a, b, text: `${ba} · ${L.length} SERIES · SLOTS = RAW + MISSING ${a ? "✓" : "✗"} · RAW = KEPT + NULL + FLAGGED ${b ? "✓" : "✗"} · DST DAYS ${dst}` };
  });
  const sp = q.spike_examples.CISO[0];
  const quirks = [
    `CISO: NET GENERATION − DEMAND − INTERCHANGE AVERAGES ${int(r.balance.CISO.mean_abs_resid_mw)} MW IN SIZE (EIA'S OWN BALANCE, KEPT AS REPORTED)`,
    `ERCO: THE FUELS MISS THE TOTAL BY MORE THAN 2% IN ${int(r.generation_vs_total.ERCO.hours_gt_2pct)} HOURS`,
    ...(sp ? [`FLAGGED SPIKE: CISO ${sp.series === "D" ? "DEMAND" : sp.series} ${sp.ts_utc.replace("T", " ")}:00 UTC ${int(sp.value)} MW VS ${int(sp.reference)} MW TYPICAL`] : []),
  ];
  const g = f.global as Record<string, number>;
  return {
    rows, quirks,
    totals: `${int(g.raw_rows_total!)} ROWS IN · ${int(g.kept_rows_total!)} KEPT · ${int(g.flagged_rows_total!)} FLAGGED`,
    footer: `PIPELINE v${meta.pipeline_version} · GENERATED ${meta.generated_at}`,
  };
}

// ---------------------------------------------------------------- S07 Evidence (objection, answer)
export const OBJECTIONS = [
  "ISN'T YOUR FORECAST JUST EIA'S?", "DO YOUR INTERVALS MEAN ANYTHING?", "DID YOU PEEK AT THE WEATHER?", "WHERE ARE THE WIRES?",
  "ARE THESE REAL COSTS?", "DOES YOUR BROWSER REALLY SOLVE IT?", "IS EVERY HOUR ACCOUNTED FOR?",
];
export const answerIntervals = (fe: ForecastEval, ba: "CISO" | "ERCO") => {
  const iv = fe.bas[ba].intervals.gbm!;
  return `${ba}: THE RAW BAND HELD ${fixed(iv.raw_coverage_pct, 1)}% OF HOURS; CALIBRATED, ${fixed(iv.cqr_coverage_pct, 1)}%. WE PROMISED ${fixed(iv.nominal_pct, 0)}%.`;
};
export const answerWeather = (fe: ForecastEval, ba: "CISO" | "ERCO") =>
  `${ba}: NO. EVERY FEATURE IS KNOWN AT FORECAST TIME (${fixed(fe.bas[ba].models.gbm!.mape_pct, 2)}%). A VERSION THAT CHEATS WITH TOMORROW'S REAL WEATHER SCORES ${fixed(fe.bas[ba].models.gbm_perfect_weather!.mape_pct, 2)}%: AN UPPER BOUND, NOT A MODEL.`;
export const answerWires = "NOT IN OUR MODEL. EACH GRID IS TREATED AS ONE COPPER PLATE. THIS IS WHAT A NETWORK LOOKS LIKE: A 14-BUS TEST SYSTEM, NOT CALIFORNIA OR TEXAS.";
export const wiresCaption = "IEEE 14-BUS TEST SYSTEM · pglib-opf v23.07 · CC BY 4.0 · ILLUSTRATIVE: NOT THE CAISO OR ERCOT NETWORK. OUR DISPATCH IGNORES NETWORK LIMITS.";
export const answerCosts = "NO. THEY ARE STATED ASSUMPTIONS. CHANGE THEM AND THE ANSWER CHANGES.";
export const answerSolve = (p: ParityReport | null) => (p ? `YES. SAME LP, SAME SOLVER. ${p.passed} OF ${p.n} TEST VECTORS MATCH THE PYTHON RESULT ON THIS BUILD.` : "SAME LP, SAME SOLVER. THE PARITY CHECK RUNS WHEN THE SOLVER LOADS (FROM THE FORECAST CHAPTER ON).");
export const answerLp = (refObj: number, cost: number) => `REFERENCE LP (CISO SUMMER, BASELINE): SOLVER OBJECTIVE ${usd(refObj)} = PUBLISHED MODEL COST ${usd(cost)} ${Math.abs(refObj - cost) <= 1e-6 * Math.abs(cost) ? "✓" : "✗"}`;
export const answerRows = (f: Facts) => { const g = f.global as Record<string, number>; return `${int(g.raw_rows_total!)} ROWS IN, ${int(g.kept_rows_total!)} KEPT, ${int(g.flagged_rows_total!)} FLAGGED. EVERY ONE COUNTED.`; };
export const fmtAssumption = (v: unknown) => (typeof v === "number" ? fixed(v, Number.isInteger(v) ? 0 : 2) : typeof v === "string" ? v.toUpperCase() : Object.entries(v as Record<string, number>).map(([k, x]) => `${k.toUpperCase()} ${x}`).join(" · "));

// ---------------------------------------------------------------- S08
export const copyS08 = {
  paragraph: "Tonight it will happen again: twenty-four times, someone will decide what to burn so the lights stay on. The cheapest answer is known in milliseconds. The cleanest one is a choice.",
  methodology: "https://github.com/mrrishit909/pulse-energy-grid/blob/main/docs/METHODOLOGY.md",
  source: "https://github.com/mrrishit909/pulse-energy-grid",
};
export const closingCaption = (d: { date: string; ba: string; served: number; tag: string }) => `${d.date} · ${d.ba} · ${int(d.served)} MWH SERVED`;
