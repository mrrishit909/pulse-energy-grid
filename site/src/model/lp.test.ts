import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import highsLoader from "highs";
import { makeLp, sha256, toCplexLp } from "./lp";
import { checkVector, tally, type HighsLike, type VectorCheck } from "./solve";
import type { DispatchModel, DispatchResults, TestVectors } from "./types";

const read = <T,>(f: string): T => JSON.parse(readFileSync(new URL(`../../public/data/${f}`, import.meta.url), "utf-8"));
const model = read<DispatchModel>("dispatch_model.json");
const tv = read<TestVectors>("dispatch_test_vectors.json");
const results = read<DispatchResults>("dispatch_results.json");

describe("CPLEX LP text (browser builder vs Python to_cplex_lp)", () => {
  it("is byte-identical to reference_lp.cplex_lp", () => {
    const r = model.reference_lp;
    const m = model.bas[r.ba];
    const text = toCplexLp(makeLp(m, m.days.find((d) => d.id === r.day)!, {}));
    expect(text.length).toBe(r.cplex_lp.length);
    expect(text).toBe(r.cplex_lp);
  });
  it("reproduces lp_text_sha256 for the 108 parity vectors", async () => {
    let match = 0;
    const miss: string[] = [];
    for (const v of tv.vectors) {
      const m = model.bas[v.ba];
      const h = await sha256(toCplexLp(makeLp(m, m.days.find((d) => d.id === v.day)!, v.params)));
      if (h === v.lp_text_sha256) match++; else miss.push(`${v.ba}/${v.day}/${v.scenario}`);
    }
    console.log(`lp_text_sha256 match ${match}/${tv.vectors.length}`, miss.slice(0, 5));
    expect(tv.vectors.length).toBe(108);
    expect(match).toBe(108);
  });
});

describe("HiGHS-wasm (highs@1.15.3) parity on all 108 vectors", () => {
  it("objective within 1e-6 relative on every vector; prices where price_comparable", async () => {
    const h = (await highsLoader()) as unknown as HighsLike;
    const checks: VectorCheck[] = [];
    const t0 = performance.now();
    for (const v of tv.vectors) checks.push(await checkVector(h, model, v, tv.tolerance_abs, tv.tolerance_price_usd_mwh));
    const rep = tally(checks, performance.now() - t0);
    console.log("parity", JSON.stringify(rep));
    expect(rep.objective).toBe(108);
    expect(rep.price).toBe(rep.priceComparable);
    expect(rep.passed).toBe(108);
  });
  it("preset objectives equal dispatch_results (cost == objective)", () => {
    for (const v of tv.vectors.filter((x) => x.kind === "preset")) {
      expect(results.bas[v.ba].days[v.day]![v.scenario]!.objective_usd).toBe(v.expected.objective_usd);
    }
  });
});
