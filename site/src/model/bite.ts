/**
 * S03b mean-day stacks (DERIVED from OBSERVED month-hour means). Index: (month - 1) * 24 + local hour.
 * IMPORTS = mean demand - sum of mean fuel generation (net imports plus the EIA balance residual, labelled so);
 * a negative value is drawn as an export sink. NET LOAD removes SUN and WND (the bands slide out, the removed
 * area stays as a dotted outline). Year steps use fuel_mix.month_hour_mean_mw_by_year (demand, SUN, WND); the
 * other sources keep their all-years mix, scaled to that year's net load.
 */
import { OBS_ORDER, type DayStack, type HourStack } from "./stack";
import type { BA, DemandProfile, FuelMix } from "./types";

export function biteStack(fm: FuelMix, dp: DemandProfile, ba: BA, month: number, year: string | null, net: number): DayStack & { demand: number[]; netload: number[] } {
  const f = fm.bas[ba].month_hour_mean_mw;
  const y = year ? fm.bas[ba].month_hour_mean_mw_by_year[year] : null;
  const hours: HourStack[] = [];
  const demand: number[] = [], netload: number[] = [];
  for (let h = 0; h < 24; h++) {
    const i = (month - 1) * 24 + h;
    const v = (k: string) => Math.max(0, f[k]?.[i] ?? 0);
    const D0 = dp.bas[ba].month_hour_mean_mw[i] ?? 0;
    const gen = OBS_ORDER.filter((k) => k !== "IMPORTS").reduce((a, k) => a + v(k), 0);
    const imp0 = D0 - gen;
    const D = y ? (y.demand[i] ?? D0) : D0;
    const sun = y ? (y.SUN[i] ?? v("SUN")) : v("SUN"), wnd = y ? (y.WND[i] ?? v("WND")) : v("WND");
    // the non-solar/wind part of the all-years stack, scaled to this (year's) net load
    const rest0 = D0 - v("SUN") - v("WND");
    const k = rest0 > 0 ? (D - sun - wnd) / rest0 : 1;
    const values = OBS_ORDER.map((key) => {
      if (key === "SUN") return sun * (1 - net);
      if (key === "WND") return wnd * (1 - net);
      if (key === "IMPORTS") return Math.max(0, imp0) * k;
      return v(key) * k;
    });
    const shown = D - (sun + wnd) * net;
    hours.push({ hour: h, values, demand: shown, charge: 0, exports: Math.max(0, -imp0) * k, residual: 0, unserved: 0, curtailed: 0 });
    demand.push(D); netload.push(D - sun - wnd);
  }
  return { keys: [...OBS_ORDER], hours, tag: "OBSERVED", demand, netload };
}
/** Largest mean demand over all months (one R100 for every month, so months compare by area). */
export const bitePeak = (dp: DemandProfile, ba: BA) => Math.max(...(dp.bas[ba].month_hour_mean_mw.filter((x) => x !== null) as number[]));
