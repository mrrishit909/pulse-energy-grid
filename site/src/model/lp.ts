/**
 * The dispatch LP, ported line for line from analytics/dispatch.py (make_lp,
 * to_cplex_lp, package). Same variable and row order, same float operation
 * order, same `%.10g` text, so the browser solves the very LP Python solved.
 * Pure: runs in the solver worker and in Vitest (Node).
 */
import { g10, round4 } from "./fmt";
import type { BAModel, Day, DispatchResult, Params } from "./types";

export const T = 24;

/** Python full_params: defaults from the BA's battery, then the given values (4-decimal inputs). */
export function fullParams(m: BAModel, p: Partial<Params> = {}): Params {
  const base: Params = { renewables_scale: 1, demand_growth_pct: 0, heat_wave_c: 0, battery_power_mw: m.battery.power_mw, battery_hours: m.battery.hours, outage_class: "none", outage_pct: 100 };
  const out = { ...base, ...p };
  for (const k of Object.keys(out) as (keyof Params)[]) if (typeof out[k] === "number") (out as unknown as Record<string, number>)[k] = round4(out[k] as number);
  return out;
}

/** Scenario demand: growth plus the heat-wave shock (Python make_lp, same operation order). */
export function scenarioDemand(m: BAModel, day: Day, p: Params): number[] {
  const Tc = m.heat_wave.cool_base_c, bc = m.heat_wave.b_cool_mw_per_c_by_hour;
  const shock = day.temp_c.map((tv, h) => bc[h]! * (Math.max(tv + p.heat_wave_c - Tc, 0) - Math.max(tv - Tc, 0)));
  return day.demand_mw.map((d, h) => d * (1 + p.demand_growth_pct / 100) + shock[h]!);
}

/** The largest demand of a reference day across its preset scenarios: S05, S06 and S07 share one R100 (G4 = G5, no camera move). */
export function dayPeak(m: BAModel, day: Day) {
  return Math.max(...m.scenarios.flatMap((s) => scenarioDemand(m, day, fullParams(m, s.params))));
}

export interface LP {
  cost: Float64Array; lb: Float64Array; ub: Float64Array;
  rows: { idx: number[]; val: number[]; lo: number; hi: number }[];
  dispIds: string[]; nC: number; off: { CS: number; CW: number; CH: number; DI: number; SO: number; UN: number };
  S: number[]; W: number[]; demand: number[]; E: number; P: number; params: Params;
}

export function makeLp(m: BAModel, day: Day, params: Partial<Params> = {}): LP {
  const p = fullParams(m, params);
  const disp = m.classes.filter((c) => c.kind === "dispatchable");
  const nC = disp.length;
  const nv = (nC + 6) * T;
  const G = (c: number, t: number) => c * T + t;
  const [CS, CW, CH, DI, SO, UN] = [0, 1, 2, 3, 4, 5].map((k) => (nC + k) * T) as [number, number, number, number, number, number];
  const b = m.battery;
  const P = p.battery_power_mw;
  const E = P * p.battery_hours;
  const eta = b.round_trip_eff ** 0.5;
  const rs = p.renewables_scale;
  const S = day.avail_mw.solar.map((v) => v * rs);
  const W = day.avail_mw.wind.map((v) => v * rs);
  const D = scenarioDemand(m, day, p);
  const dnet = D.map((d, h) => d - day.net_imports_mw[h]! - day.fixed_other_mw[h]!);
  const cost = new Float64Array(nv), lb = new Float64Array(nv), ub = new Float64Array(nv).fill(Infinity);
  disp.forEach((c, ci) => {
    const a = p.outage_class === c.id ? 1 - p.outage_pct / 100 : 1;
    for (let t = 0; t < T; t++) {
      cost[G(ci, t)] = c.marginal_cost_usd_mwh;
      ub[G(ci, t)] = c.capacity_mw * a;
      lb[G(ci, t)] = Math.min(c.pmin_frac * c.capacity_mw, ub[G(ci, t)]!);
    }
  });
  for (let t = 0; t < T; t++) {
    ub[CS + t] = S[t]!; ub[CW + t] = W[t]!;
    ub[CH + t] = P; ub[DI + t] = P;
    cost[DI + t] = b.wear_cost_usd_mwh;
    lb[SO + t] = b.soc_min_frac * E; ub[SO + t] = E;
    cost[UN + t] = m.voll_usd_mwh;
  }
  lb[SO + T - 1] = b.soc0_frac * E;
  const soc0 = b.soc0_frac * E;
  const rows: LP["rows"] = [];
  // scipy's coo -> csr canonicalises, so each row's terms are written in ascending column order
  const add = (e: [number, number][], lo: number, hi: number) => {
    e.sort((x, y) => x[0] - y[0]);
    rows.push({ idx: e.map((x) => x[0]), val: e.map((x) => x[1]), lo, hi });
  };
  for (let t = 0; t < T; t++) {
    const rhs = dnet[t]! - S[t]! - W[t]!;
    add([...disp.map((_, ci) => [G(ci, t), 1] as [number, number]), [CS + t, -1], [CW + t, -1], [DI + t, 1], [CH + t, -1], [UN + t, 1]], rhs, rhs);
  }
  for (let t = 0; t < T; t++) {
    const e: [number, number][] = [[SO + t, 1], [CH + t, -eta], [DI + t, 1 / eta]];
    if (t > 0) e.push([SO + t - 1, -1]);
    add(e, t === 0 ? soc0 : 0, t === 0 ? soc0 : 0);
  }
  disp.forEach((c, ci) => {
    if (c.id === "hydro") add(Array.from({ length: T }, (_, t) => [G(ci, t), 1] as [number, number]), -Infinity, day.hydro_energy_mwh);
  });
  disp.forEach((c, ci) => {
    const R = c.ramp_frac_per_h * c.capacity_mw;
    for (let t = 1; t < T; t++) {
      add([[G(ci, t), 1], [G(ci, t - 1), -1]], -Infinity, R);
      add([[G(ci, t - 1), 1], [G(ci, t), -1]], -Infinity, R);
    }
  });
  return { cost, lb, ub, rows, dispIds: disp.map((c) => c.id), nC, off: { CS, CW, CH, DI, SO, UN }, S, W, demand: D, E, P, params: p };
}

/** analytics/dispatch.py::to_cplex_lp, byte for byte. */
export function toCplexLp(lp: LP): string {
  const objTerms: string[] = [];
  lp.cost.forEach((c, j) => { if (c !== 0) objTerms.push(`${g10(c)} x${j}`); });
  const out = ["\\ Pulse Energy Grid dispatch LP (generated); variable order in dispatch_model.json", "Minimize", " obj: " + objTerms.join(" + "), "Subject To"];
  lp.rows.forEach((r, i) => {
    const terms = r.idx.map((j, k) => `${r.val[k]! >= 0 ? "+" : "-"} ${g10(Math.abs(r.val[k]!))} x${j}`).join(" ");
    if (r.lo === r.hi) out.push(` r${i}: ${terms} = ${g10(r.lo)}`);
    else out.push(` r${i}: ${terms} <= ${g10(r.hi)}`);
  });
  out.push("Bounds");
  for (let j = 0; j < lp.cost.length; j++) out.push(` ${g10(lp.lb[j]!)} <= x${j} <= ${lp.ub[j] === Infinity ? "+inf" : g10(lp.ub[j]!)}`);
  out.push("End");
  return out.join("\n") + "\n";
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** analytics/dispatch.py::marginal_class (descriptive, DERIVED from the solution). */
function marginalClass(m: BAModel, lp: LP, x: Float64Array): string[] {
  const disp = m.classes.filter((c) => c.kind === "dispatchable");
  const o = lp.off;
  const out: string[] = [];
  for (let t = 0; t < T; t++) {
    if (x[o.UN + t]! > 0.5) { out.push("unserved"); continue; }
    const pick = (ok: (i: number) => boolean) => {
      let best: [number, number] | null = null;
      disp.forEach((c, i) => { if (ok(i) && (!best || c.marginal_cost_usd_mwh > best[0] || (c.marginal_cost_usd_mwh === best[0] && i > best[1]))) best = [c.marginal_cost_usd_mwh, i]; });
      return best as [number, number] | null;
    };
    const inner = pick((i) => lp.lb[i * T + t]! + 0.5 < x[i * T + t]! && x[i * T + t]! < lp.ub[i * T + t]! - 0.5);
    if (inner) { out.push(disp[inner[1]]!.id); continue; }
    if (x[o.CS + t]! + x[o.CW + t]! > 0.5) { out.push("surplus"); continue; }
    const run = pick((i) => x[i * T + t]! > lp.lb[i * T + t]! + 0.5);
    out.push(run ? disp[run[1]]!.id : "surplus");
  }
  return out;
}

/**
 * analytics/dispatch.py::package: columns by NAME (HiGHS reading LP text
 * orders columns by first appearance, not by index), costs from the primal
 * solution, prices = balance-row duals. Arrays are not rounded here.
 */
export function packageResult(m: BAModel, lp: LP, x: Float64Array, rowDual: number[], objective: number): DispatchResult {
  const o = lp.off;
  const sl = (a: number, n = T) => Array.from(x.subarray(a, a + n));
  const dot = (a: number) => { let s = 0; for (let t = 0; t < T; t++) s += lp.cost[a + t]! * x[a + t]!; return s; };
  const breakdown: Record<string, number> = {};
  const dmw: Record<string, number[]> = {};
  lp.dispIds.forEach((id, ci) => { breakdown[id] = dot(ci * T); dmw[id] = sl(ci * T); });
  breakdown.battery_wear = dot(o.DI);
  breakdown.unserved_voll = dot(o.UN);
  dmw.battery_discharge = sl(o.DI);
  const solarUsed = lp.S.map((s, t) => s - x[o.CS + t]!);
  const windUsed = lp.W.map((w, t) => w - x[o.CW + t]!);
  const soc = [m.battery.soc0_frac * lp.E, ...sl(o.SO)];
  let co2 = 0;
  for (const c of m.classes) if (c.kind === "dispatchable") co2 += dmw[c.id]!.reduce((a, b) => a + b, 0) * c.heat_rate_mmbtu_mwh * c.co2_kg_mmbtu / 1000;
  const dsum = lp.demand.reduce((a, b) => a + b, 0);
  const curt = Array.from({ length: T }, (_, t) => x[o.CS + t]! + x[o.CW + t]!);
  const uns = sl(o.UN);
  return {
    objective_usd: objective, cost_breakdown_usd: breakdown, dispatch_mw: dmw, renewable_used_mw: { solar: solarUsed, wind: windUsed },
    curtailment_mw: curt, unserved_mw: uns, battery: { charge_mw: sl(o.CH), discharge_mw: sl(o.DI), soc_mwh: soc }, price_usd_mwh: rowDual.slice(0, T),
    marginal_class: marginalClass(m, lp, x), co2_t: co2,
    renewable_share_pct: ((solarUsed.reduce((a, b) => a + b, 0) + windUsed.reduce((a, b) => a + b, 0)) / Math.max(dsum, 1e-9)) * 100,
    unserved_mwh: uns.reduce((a, b) => a + b, 0), curtailed_mwh: curt.reduce((a, b) => a + b, 0),
  };
}

/** Rejection criterion 7: cost = objective and the breakdown sums to it (1e-6 relative); SoC within bounds; hourly balance (0.5 MW). */
export function validateResult(m: BAModel, day: Day, lp: LP, r: DispatchResult): string | null {
  const sum = Object.values(r.cost_breakdown_usd).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - r.objective_usd) > 1e-6 * Math.max(1, Math.abs(r.objective_usd))) return "COST BREAKDOWN != OBJECTIVE";
  const lo = m.battery.soc_min_frac * lp.E - 0.5, hi = lp.E + 0.5;
  if (r.battery.soc_mwh.slice(1).some((s) => !(s >= lo && s <= hi))) return "SOC OUT OF BOUNDS";
  for (let t = 0; t < T; t++) {
    let served = r.renewable_used_mw.solar[t]! + r.renewable_used_mw.wind[t]! + day.net_imports_mw[t]! + day.fixed_other_mw[t]! + r.battery.discharge_mw[t]! - r.battery.charge_mw[t]!;
    for (const id of lp.dispIds) served += r.dispatch_mw[id]![t]!;
    if (!(Math.abs(served + r.unserved_mw[t]! - lp.demand[t]!) <= 0.5)) return `BALANCE AT ${String(t).padStart(2, "0")}:00`;
  }
  return null;
}
