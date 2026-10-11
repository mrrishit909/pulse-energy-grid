/**
 * One LP solve through highs-js (legacy string API), mapped back to the
 * dispatch_results shape, plus the parity check of one test vector. Shared by
 * the solver worker and the Node Vitest, so the badge and the test run the same code.
 */
import { makeLp, packageResult, sha256, toCplexLp, validateResult } from "./lp";
import type { BAModel, DispatchModel, DispatchResult, Params, Vector } from "./types";

/** The slice of the highs-js API used here (legacy `solve`). */
export interface HighsLike {
  solve(lp: string, opts?: Record<string, unknown>): {
    Status: string; ObjectiveValue: number;
    Columns: Record<string, { Primal: number }>; Rows: { Dual: number; Name?: string }[];
  };
}
/** Same options as the Python solve (simplex, presolve on, 1 thread, seed 0). */
export const SOLVE_OPTS = { solver: "simplex", presolve: "on", threads: 1, random_seed: 0 } as const;

export interface Solved { result: DispatchResult; status: string; ms: number; text: string; check: string | null }

/** timeLimit (s): HiGHS time_limit; a non-Optimal status (e.g. "Time limit reached") throws, never returns a result. */
export function solveDay(h: HighsLike, m: BAModel, dayId: string, params: Partial<Params>, timeLimit?: number): Solved {
  const day = m.days.find((d) => d.id === dayId);
  if (!day) throw new Error(`UNKNOWN DAY ${dayId}`);
  const lp = makeLp(m, day, params);
  const text = toCplexLp(lp);
  const t0 = performance.now();
  const s = h.solve(text, timeLimit ? { ...SOLVE_OPTS, time_limit: timeLimit } : SOLVE_OPTS);
  const ms = performance.now() - t0;
  if (s.Status !== "Optimal") throw new Error(`SOLVER STATUS ${s.Status.toUpperCase()}`);
  const x = new Float64Array(lp.cost.length);
  for (let j = 0; j < x.length; j++) x[j] = s.Columns[`x${j}`]?.Primal ?? 0;
  const result = packageResult(m, lp, x, s.Rows.map((r) => r.Dual), s.ObjectiveValue);
  return { result, status: s.Status, ms, text, check: validateResult(m, day, lp, result) };
}

export interface VectorCheck { objective: boolean; price: boolean | null; keys: boolean; hash: boolean }

/** tolRel = dispatch_test_vectors.tolerance_rel (1e-6; published unrounded since the Data fix of P04-FE-002). */
export async function checkVector(h: HighsLike, model: DispatchModel, v: Vector, tolAbs: number, tolPrice: number, tolRel: number): Promise<VectorCheck> {
  const TOL_REL = tolRel;
  const s = solveDay(h, model.bas[v.ba], v.day, v.params);
  const e = v.expected, r = s.result;
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(TOL_REL * Math.abs(b), tolAbs);
  const objective = Math.abs(r.objective_usd - e.objective_usd) <= TOL_REL * Math.max(1, Math.abs(e.objective_usd));
  const price = e.price_comparable ? r.price_usd_mwh.every((p, t) => Math.abs(p - e.price_usd_mwh[t]!) <= tolPrice) : null;
  const keys = near(r.unserved_mwh, e.unserved_mwh) && near(r.co2_t, e.co2_t) &&
    Object.entries(e.cost_breakdown_usd).every(([k, val]) => near(r.cost_breakdown_usd[k] ?? NaN, val));
  const hash = (await sha256(s.text)) === v.lp_text_sha256;
  return { objective, price, keys, hash };
}

export interface ParityReport {
  n: number; objective: number; priceComparable: number; price: number; keys: number; hash: number;
  /** passed = objective within 1e-6 rel AND price within tolerance where price_comparable */
  passed: number; ms: number;
}
export function tally(checks: VectorCheck[], ms: number): ParityReport {
  const c = (f: (x: VectorCheck) => boolean) => checks.filter(f).length;
  return {
    n: checks.length, objective: c((x) => x.objective), priceComparable: c((x) => x.price !== null), price: c((x) => x.price === true),
    keys: c((x) => x.keys), hash: c((x) => x.hash), passed: c((x) => x.objective && x.price !== false), ms,
  };
}
