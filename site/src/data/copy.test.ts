import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cityReadout, co2Line, copyS00, copyS03a, copyS05, deltaLines, ledgerLine, ledgerRows, parityLine, rampNote, statusLine, totalLine } from "./copy";
import { fixed, int, signedInt } from "../model/format";
import { CITY, litCount } from "../model/city";
import type { DispatchModel, DispatchResults, Facts } from "../model/types";

const read = <T,>(f: string): T => JSON.parse(readFileSync(new URL(`../../public/data/${f}`, import.meta.url), "utf-8"));
const facts = read<Facts>("facts.json");
const model = read<DispatchModel>("dispatch_model.json");
const results = read<DispatchResults>("dispatch_results.json");
/** Every number printed in a string, as written. */
const numbers = (s: string) => (s.match(/\d[\d,]*(\.\d+)?/g) ?? []).map((n) => n.replace(/,$/, ""));

describe("copy deck numbers are artifact values (VISUAL_DESIGN 5, 6)", () => {
  const intro = model.bas.CISO.days.find((d) => d.intro)!;
  it("static copy has no number that is not bound to a named field", () => {
    const allowed = new Set([
      // window-city.json: windows per building, MW per building, MW per window
      String(CITY.windows_per_building), int(CITY.windows_per_building * CITY.mw_per_window), String(CITY.mw_per_window),
      // design literals: 1 petal = 1 hour; EIA-930 is the form's name; 24 petals
      "1", "930", "24",
    ]);
    const texts = [...Object.values(copyS00(intro)).filter((t) => !t.startsWith("CISO")), copyS03a.statement, copyS03a.note, copyS03a.windowChip, copyS03a.tempChip, copyS03a.empty, copyS05.s1, copyS05.s2];
    for (const t of texts) for (const n of numbers(t)) expect(allowed, `"${n}" in "${t}"`).toContain(n);
  });
  it("S00 corner prints the intro day's date and its peak demand (dispatch_model days[intro], DR-2)", () => {
    expect(copyS00(intro).corner).toBe(`CISO · ${intro.date} · PEAK ${int(Math.max(...intro.demand_mw))} MW`);
  });
  it("S03a readout prints the day's own hour values; windows = round(MW / 100)", () => {
    for (const ba of ["CISO", "ERCO"] as const) for (const d of model.bas[ba].days) for (const h of [0, 7, 18, 23]) {
      const r = cityReadout(d, h, litCount(d.demand_mw[h]!));
      expect(r.served).toBe(`${int(d.demand_mw[h]!)} MW SERVED`);
      expect(r.lit).toBe(`${int(Math.round(d.demand_mw[h]! / 100))} OF 960 WINDOWS LIT`);
      expect(r.temp).toBe(`${fixed(d.temp_c[h]!, 1)} °C · POP.-WEIGHTED`);
      if (h > 0) expect(r.delta).toBe(`${signedInt(d.demand_mw[h]! - d.demand_mw[h - 1]!)} MW SINCE ${String(h - 1).padStart(2, "0")}:00`);
    }
  });
  it("the evening ramp note is facts.bas[ba].evening_ramp_mw_per_h", () => {
    expect(rampNote(facts, "CISO")).toBe(`TYPICAL EVENING RAMP IN CISO: ${int(facts.bas.CISO.evening_ramp_mw_per_h as number)} MW PER HOUR.`);
    expect(numbers(rampNote(facts, "ERCO"))).toEqual([int(facts.bas.ERCO.evening_ramp_mw_per_h as number)]);
  });
  it("S05 ledger: cost = objective (exactly the solver objective), rows = the result's MWh and breakdown", () => {
    for (const ba of ["CISO", "ERCO"] as const) {
      const m = model.bas[ba];
      for (const d of m.days) {
        const r = results.bas[ba].days[d.id]!.baseline!;
        expect(totalLine(r)).toBe(`MODEL COST $${int(r.objective_usd)} = SOLVER OBJECTIVE`);
        expect(co2Line(r)).toBe(`MODEL CO2 ${int(r.co2_t)} T`);
        const rows = ledgerRows(m, d, r);
        expect(rows.map((x) => x.key)).toEqual(m.display_order);
        const costed = rows.filter((x) => x.cost !== null).reduce((a, x) => a + x.cost!, 0);
        // every costed row comes from cost_breakdown_usd; with unserved_voll they sum to the objective (1e-6 rel)
        expect(Math.abs(costed + (r.cost_breakdown_usd.unserved_voll ?? 0) - r.objective_usd)).toBeLessThanOrEqual(1e-6 * r.objective_usd);
        for (const row of rows) expect(ledgerLine(row).mwh).toBe(`${int(row.mwh)} MWH`);
        expect(copyS05.footer(m)).toBe(`MODEL OF ${m.classes.filter((c) => c.kind === "dispatchable").length} GENERATOR CLASSES. COSTS ARE ASSUMPTIONS, NOT MARKET PRICES.`);
      }
    }
  });
  it("delta lines are scenario minus baseline of the same GRID and DAY", () => {
    const b = results.bas.CISO.days.summer!.baseline!, x = results.bas.CISO.days.summer!.battery_big!;
    const [, curt, cost, co2] = deltaLines(x, b);
    expect(cost).toContain(int(Math.abs(x.objective_usd - b.objective_usd)));
    expect(co2).toBe(`CO2 ${signedInt(x.co2_t - b.co2_t)} T`);
    expect(curt).toBe(`CURTAILED ${signedInt(x.curtailed_mwh - b.curtailed_mwh)} MWH`);
  });
  it("status and parity lines print only measured values, and never claim a browser solve for a preset", () => {
    const rep = { n: 108, objective: 108, priceComparable: 85, price: 85, keys: 107, hash: 108, passed: 108, ms: 900 };
    expect(parityLine(rep)).toBe(`PARITY 108/108 VECTORS · OBJECTIVE WITHIN 1E-6 108/108 · PRICES 85/85 WHERE UNIQUE · CO2, UNSERVED, COST LINES ${rep.keys}/108 · LP TEXT SHA-256 108/108`);
    const base = { version: "1.15.1", pct: null, ms: 4.4, parity: rep, error: null, solving: false };
    expect(statusLine({ ...base, status: "ready", source: "browser" })).toBe("SOLVED IN BROWSER · HiGHS 1.15.1 (highs-js 1.15.3) · 4 MS");
    expect(statusLine({ ...base, status: "ready", source: "precomputed" })).toBe("PRECOMPUTED · PYTHON HiGHS");
    expect(statusLine({ ...base, status: "loading", pct: 42, source: "precomputed" })).toBe("PRECOMPUTED · PYTHON HiGHS · IN-BROWSER SOLVER LOADING · 42%");
    expect(statusLine({ ...base, status: "error", source: "precomputed" })).toBe("IN-BROWSER SOLVER UNAVAILABLE: SHOWING PRECOMPUTED PYTHON RESULTS");
  });
});

describe("site source hygiene", () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(tsx?|css|html|mjs)$/.test(f)) files.push(p); } };
  walk(new URL("..", import.meta.url).pathname);
  walk(new URL("../../tests", import.meta.url).pathname);
  files.push(new URL("../../index.html", import.meta.url).pathname);
  // built from code points so this file never contains the characters it bans
  const banned = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2015)}]`);
  it("has no U+2014 or U+2015 dash anywhere", () => {
    for (const f of files) expect(banned.test(readFileSync(f, "utf-8")), f).toBe(false);
  });
  it("QA L10: no overclaiming words in any user-facing string (say IN-BROWSER, never LIVE)", () => {
    const words = /(?<![.-])\blive\b|every one|\brecomputed\b|real[- ]time/i;
    for (const f of files.filter((x) => /\.(tsx?|html)$/.test(x) && !/\.test\.ts$|\/dev\//.test(x))) {
      // comments stripped; then every string literal and every JSX text run
      const src = readFileSync(f, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
      const strings = [...src.matchAll(/"([^"\n]*)"|`([^`]*)`|>([^<>{}\n]+)</g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "")
        .filter((s) => /\s/.test(s) && !/aria-live|is-live|className/.test(s));
      expect(strings.filter((s) => words.test(s)), f).toEqual([]);
    }
  });
  it("draws the rose with Canvas2D only (no WebGL, no three.js)", () => {
    // site code only: the QA evidence harness in tests/ probes the browser and is not shipped
    for (const f of files.filter((x) => !x.includes("/tests/"))) expect(/getContext\(\s*["']webgl|from\s+["']three["']/.test(readFileSync(f, "utf-8")), f).toBe(false);
  });
  it("has one requestAnimationFrame call site (motion/loop.ts)", () => {
    const hits = files.filter((f) => !f.includes("/tests/") && /requestAnimationFrame\(/.test(readFileSync(f, "utf-8")));
    expect(hits.map((f) => f.split("/src/")[1] ?? f)).toEqual(["motion/loop.ts"]);
  });
});
