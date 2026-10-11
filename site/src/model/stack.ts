/**
 * Petal stacks for the Day Rose (VISUAL_DESIGN section 0 band order, sink and residual rules).
 * Every value is MW; the renderer turns cumulative MW into area-true radii.
 *
 * OBSERVED: positive parts of each EIA fuel (+ imports = -TI where TI < 0) stack centre-out in
 * merit order. Sinks = negative fuel parts (storage charging / station use, as reported) and
 * exports (TI > 0). The EIA balance residual R = D - (P - K) is kept, never absorbed:
 * P - K + R = D exactly (P = stack, K = sinks).
 * SIMULATED: dispatch_model display_order from a dispatch result; R = 0 by the LP balance.
 */
import type { PetalIn } from "../graphics/rose";
import type { Day, DispatchResult } from "./types";

export const OBS_ORDER = ["SUN", "WND", "NUC", "WAT", "IMPORTS", "OTH", "NG", "COL", "OIL"] as const;
export const OBS_LABEL: Record<string, string> = { SUN: "SOLAR", WND: "WIND", NUC: "NUCLEAR", WAT: "HYDRO", IMPORTS: "IMPORTS", OTH: "OTHER", NG: "GAS", COL: "COAL", OIL: "OIL" };

/** One hour's band values (MW, >= 0) plus the petal's non-band quantities. */
export interface HourStack { hour: number; values: number[]; demand: number; charge: number; exports: number; residual: number; unserved: number; curtailed: number }
export interface DayStack { keys: string[]; hours: HourStack[]; tag: "OBSERVED" | "SIMULATED" }

export function observedStack(day: Day, skipEmpty = true): DayStack {
  const gen = day.observed_gen_mw;
  const hours: HourStack[] = day.demand_mw.map((D, h) => {
    let charge = 0;
    const values = OBS_ORDER.map((k) => {
      if (k === "IMPORTS") return Math.max(0, -day.observed_interchange_mw[h]!);
      const v = gen[k]?.[h] ?? 0;
      if (v < 0) charge -= v;
      return Math.max(0, v);
    });
    const exports = Math.max(0, day.observed_interchange_mw[h]!);
    const P = values.reduce((a, b) => a + b, 0);
    return { hour: h, values, demand: D, charge, exports, residual: D - (P - charge - exports), unserved: 0, curtailed: 0 };
  });
  // a band empty in all 24 petals is skipped (its fill time is redistributed)
  const keep = OBS_ORDER.map((_, k) => !skipEmpty || hours.some((x) => x.values[k]! > 0));
  return { keys: OBS_ORDER.filter((_, k) => keep[k]), hours: hours.map((x) => ({ ...x, values: x.values.filter((_, k) => keep[k]) })), tag: "OBSERVED" };
}

export function simulatedStack(order: string[], day: Day, demand: number[], r: DispatchResult): DayStack {
  const val = (k: string, h: number) => {
    if (k === "solar") return r.renewable_used_mw.solar[h]!;
    if (k === "wind") return r.renewable_used_mw.wind[h]!;
    if (k === "imports") return Math.max(0, day.net_imports_mw[h]!);
    if (k === "other") return day.fixed_other_mw[h]!;
    return r.dispatch_mw[k]?.[h] ?? 0;
  };
  return {
    keys: order, tag: "SIMULATED",
    hours: demand.map((D, h) => ({
      hour: h, values: order.map((k) => Math.max(0, val(k, h))), demand: D,
      charge: r.battery.charge_mw[h]!, exports: Math.max(0, -day.net_imports_mw[h]!), residual: 0,
      unserved: r.unserved_mw[h]!, curtailed: r.curtailment_mw[h]!,
    })),
  };
}

/**
 * Petals with band k filled to fraction fill[k] (0..1). Fill is radial: every petal
 * uses the same fill vector, so every petal has the same band set at every frame.
 */
export function petals(s: DayStack, fill: (k: number) => number): PetalIn[] {
  return s.hours.map((x) => {
    let cum = 0;
    const bands = x.values.map((v, k) => {
      const f = fill(k);
      const b: [number, number] = [cum, cum + v * f];
      cum += v;
      return b;
    });
    const P = x.values.reduce((a, b) => a + b, 0);
    const served = s.tag === "SIMULATED" ? x.demand - x.unserved : P - x.charge - x.exports;
    return { hour: x.hour, bands, demand: x.demand, served, charge: x.charge, exports: x.exports, residual: x.residual, unserved: x.unserved, curtailed: x.curtailed };
  });
}

/** Area (r^2) tween between two petal sets with the same keys: band k uses its own progress e(k). */
export function tweenPetals(a: PetalIn[], b: PetalIn[], e: (k: number) => number, eAll: number): PetalIn[] {
  const L = (x: number, y: number, t: number) => x + (y - x) * t;
  return b.map((pb, i) => {
    const pa = a[i] ?? pb;
    return {
      hour: pb.hour,
      bands: pb.bands.map(([i1, o1], k) => { const [i0, o0] = pa.bands[k] ?? [i1, o1]; const t = e(k); return [L(i0, i1, t), L(o0, o1, t)]; }),
      demand: L(pa.demand, pb.demand, eAll), served: L(pa.served, pb.served, eAll), charge: L(pa.charge, pb.charge, eAll), exports: L(pa.exports, pb.exports, eAll),
      residual: L(pa.residual, pb.residual, eAll), unserved: L(pa.unserved, pb.unserved, eAll), curtailed: L(pa.curtailed, pb.curtailed, eAll),
    };
  });
}

/** First band (display order) whose values differ in any petal: the pulse starts there (MOTION_SYSTEM 5.8). */
export function firstChanged(a: PetalIn[], b: PetalIn[]) {
  const n = b[0]?.bands.length ?? 0;
  for (let k = 0; k < n; k++) if (b.some((p, i) => Math.abs(p.bands[k]![1] - p.bands[k]![0] - ((a[i]?.bands[k]?.[1] ?? 0) - (a[i]?.bands[k]?.[0] ?? 0))) > 0.5)) return k;
  return n;
}
