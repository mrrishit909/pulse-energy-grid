import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  copyCtrl, copyS03b, answerWires, wiresCaption, OBJECTIONS,
  answerIntervals, answerLp, answerRows, answerWeather, biasLine, biteLedger, calendarCaption, ctrlLedger, ledgerCopy, s01Cards, stressRows, verdict, weekStats,
} from "./copy";
import { biteStack } from "../model/bite";
import { fixed, int } from "../model/format";
import type { DemandProfile, DispatchModel, DispatchResults, Facts, ForecastEval, ForecastSamples, FuelMix, Meta, Quality, Reconciliation } from "../model/types";

const read = <T,>(f: string): T => JSON.parse(readFileSync(new URL(`../../public/data/${f}`, import.meta.url), "utf-8"));
const facts = read<Facts & { eia_ciso_dayahead_bias_pct: number; eia_ciso_dayahead_bias_year: number }>("facts.json");
const fe = read<ForecastEval>("forecast_eval.json"), fs = read<ForecastSamples>("forecast_samples.json");
const model = read<DispatchModel>("dispatch_model.json"), results = read<DispatchResults>("dispatch_results.json");
const fm = read<FuelMix>("fuel_mix.json"), dp = read<DemandProfile>("demand_profile.json");
const rc = read<Reconciliation>("reconciliation.json"), q = read<Quality>("quality.json"), meta = read<Meta>("meta.json");

describe("Stage B copy is bound to artifact fields", () => {
  it("static Stage B copy has no number that is not a design literal", () => {
    const numbers = (s: string) => (s.match(/\d[\d,]*(\.\d+)?/g) ?? []).map((n) => n.replace(/,$/, ""));
    // literals: 24-hour LP, IEEE 14-bus, pglib-opf v23.07, CC BY 4.0, the TIME LIMIT choices (seconds)
    const allowed = new Set(["24", "14", "23.07", "4.0", "10", "0.000001"]);
    for (const t of [copyS03b.mix, copyS03b.demand, copyS03b.net, copyCtrl.note, copyCtrl.line, answerWires, wiresCaption, ...OBJECTIONS, "10 S", "0.000001 S (TOO SHORT)"])
      for (const n of numbers(t)) expect(allowed, `"${n}" in "${t}"`).toContain(n);
  });
  it("S01 cards print facts.json peaks and the ERCO interchange share", () => {
    const [c, e] = s01Cards(facts);
    expect(c!.body).toContain(int(facts.bas.CISO.peak_demand_mw));
    expect(e!.body).toContain(`${fixed(facts.bas.ERCO.interchange_abs_mean_pct_of_demand as number, 2)}%`);
  });
  it("S04 verdicts follow the comparisons (CISO: ours better; ERCO: the operator, via the labelled fallback)", () => {
    const c = verdict(fe, "CISO"), e = verdict(fe, "ERCO");
    expect(c.serif).toBe("Our model beat the operator's own forecast.");
    expect(e.serif).toBe("The operator's own forecast is still better.");
    expect(e.basis).toContain("COMPARISON_VS_EIA");
    expect(c.mono).toContain(`${fixed(fe.bas.CISO.models.gbm!.mape_pct, 2)}%`);
    expect(e.mono).toContain("WE SAY SO.");
    // a CI that crosses zero reads as no clear winner, whatever the sign
    const flat = structuredClone(fe); flat.bas.CISO.comparisons.find((x) => x.model === "gbm" && x.baseline === "eia_day_ahead")!.significant = false;
    expect(verdict(flat, "CISO").serif).toBe("No clear winner over the operator's forecast.");
  });
  it("the EIA drift line prints facts.eia_ciso_dayahead_bias_pct (never a typed number)", () => {
    expect(biasLine(facts, fe)).toContain(`−${fixed(Math.abs(facts.eia_ciso_dayahead_bias_pct), 2)}% BIAS IN ${facts.eia_ciso_dayahead_bias_year}`);
    expect(biasLine({ ...facts, eia_ciso_dayahead_bias_pct: -3.21 }, fe)).toContain("−3.21%");
    // the "part of our margin is that drift" claim appears only when bias correction actually helps EIA
    const m = fe.bas.CISO.models;
    expect(biasLine(facts, fe).includes("PART OF OUR CISO MARGIN IS THAT DRIFT")).toBe(m.eia_debiased!.mape_pct < m.eia_day_ahead!.mape_pct);
  });
  it("week numbers are computed from the arrays: covered = count(p10 <= actual <= p90)", () => {
    const w = fs.bas.CISO.weeks[0]!;
    const s = weekStats(w, "cqr");
    const n = w.actual_mw.filter((a, i) => a !== null && w.gbm_p10_cqr_mw[i]! <= a && a <= w.gbm_p90_cqr_mw[i]!).length;
    expect(s.covered).toBe(n);
    const cal = calendarCaption(fs, "CISO");
    expect(cal.k).toBe(fs.bas.CISO.daily_test.mape_gbm.filter((g, i) => g !== null && fs.bas.CISO.daily_test.mape_eia[i] !== null && g < fs.bas.CISO.daily_test.mape_eia[i]!).length);
  });
  it("S03b: net load = demand - SUN - WND per hour; the ledger minimum and maximum are those of the array", () => {
    const s = biteStack(fm, dp, "CISO", 5, "2024", 1);
    const y = fm.bas.CISO.month_hour_mean_mw_by_year["2024"]!;
    s.netload.forEach((v, h) => expect(v).toBeCloseTo(y.demand[96 + h]! - y.SUN[96 + h]! - y.WND[96 + h]!, 6));
    const L = biteLedger(s.netload);
    expect(L.minMw).toBe(Math.min(...s.netload.slice(10, 16)));
  });
  it("S06 rows are scenario - baseline of the same (ba, day)", () => {
    const b = results.bas.CISO.days.summer!.baseline!, x = results.bas.CISO.days.summer!.heat_wave!;
    const rows = stressRows(b, x);
    expect(rows[0]!.text).toContain(int(x.objective_usd - b.objective_usd));
    expect(rows[2]!.text).toContain(`${int(x.unserved_mwh)} MWH`);
  });
  it("CTRL cost line equals the solver objective and states it", () => {
    const r = results.bas.ERCO.days.summer!.outage!;
    expect(ctrlLedger(r, null)[0]!.text).toBe(`MODEL COST $${int(r.objective_usd)} = SOLVER OBJECTIVE ✓`);
  });
  it("S07 answers print forecast_eval, reference_lp and facts values", () => {
    expect(answerIntervals(fe, "CISO")).toContain(`${fixed(fe.bas.CISO.intervals.gbm!.cqr_coverage_pct, 1)}%`);
    expect(answerWeather(fe, "ERCO")).toContain(`${fixed(fe.bas.ERCO.models.gbm_perfect_weather!.mape_pct, 2)}%`);
    expect(answerLp(model.reference_lp.objective_usd, results.bas.CISO.days.summer!.baseline!.objective_usd)).toMatch(/✓$/);
    expect(answerRows(facts)).toContain(int((facts.global as Record<string, number>).raw_rows_total!));
  });
  it("the S02 ledger recomputes both identities for every series and they hold", () => {
    const l = ledgerCopy(rc, q, facts, meta);
    expect(l.rows.every((r) => r.a && r.b)).toBe(true);
    expect(l.rows[0]!.text).toContain(`DST DAYS ${q.dst.CISO.days_23h + q.dst.CISO.days_25h}`);
    // c1f6277: rows excluded within a day of a timing-convention change are part of the identity and the totals
    expect(l.rows[0]!.text).toContain("RAW = KEPT + NULL + FLAGGED + TIMING ✓");
    const timing = rc.ledger.reduce((t, x) => t + (x.timing_excluded ?? 0), 0);
    if (timing) expect(l.totals).toContain(`${timing.toLocaleString("en-US")} EXCLUDED AT A TIMING CHANGE`);
  });
});
