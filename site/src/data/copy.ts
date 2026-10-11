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
