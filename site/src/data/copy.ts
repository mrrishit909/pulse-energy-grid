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
