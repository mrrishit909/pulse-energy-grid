/**
 * The live dispatch lab shared by S05 (Fill the Day) and CTRL (the Control Room): one store shape,
 * precomputed presets while the solver loads (labelled PRECOMPUTED), latest-wins live solves once it is
 * ready (labelled SOLVED IN BROWSER), stale results dropped, failures keep the last good result.
 */
import { useEffect } from "react";
import { store } from "./store";
import { requestSolve, type SolverState } from "./solver";
import { fullParams } from "../model/lp";
import type { BA, BAModel, DispatchResult, DispatchResults, Params, RangeControl } from "../model/types";

export interface LabState {
  ba: BA; dayId: string;
  params: Params | null;
  result: DispatchResult | null;
  source: "none" | "browser" | "precomputed";
  presetId: string | null;
  ms: number; check: string | null;
  /** bumped on every new result: the director starts a re-solve pulse */
  resultSeq: number;
  /** HiGHS time_limit in seconds (CTRL control); undefined = none */
  timeLimit?: number;
}
export const labStore = (ba: BA, dayId: string) =>
  store<LabState>({ ba, dayId, params: null, result: null, source: "none", presetId: "baseline", ms: 0, check: null, resultSeq: 0, timeLimit: undefined });
export type LabStore = ReturnType<typeof labStore>;

export const sameParams = (a: Params, b: Params) => (Object.keys(a) as (keyof Params)[]).every((k) => a[k] === b[k]);

export function setPreset(s: LabStore, m: BAModel, rs: DispatchResults, ba: BA, dayId: string, id: string) {
  const sc = m.scenarios.find((x) => x.id === id)!;
  const result = rs.bas[ba].days[dayId]?.[id] ?? null;
  s.set({ ba, dayId, params: fullParams(m, sc.params), result, source: result ? "precomputed" : "none", presetId: id, check: null, resultSeq: s.get().resultSeq + 1 });
}

/** Nearest preset to `p` (normalised distance over the given range controls; enum controls must match or cost 1). */
export function nearestPreset(m: BAModel, p: Params, ids: readonly string[], allowed?: readonly string[]) {
  let best = m.scenarios[0]!, bd = Infinity;
  for (const s of m.scenarios.filter((x) => !allowed || allowed.includes(x.id))) {
    let d = 0;
    for (const id of ids) {
      const c = m.controls.find((x) => x.id === id)!;
      const a = s.params[id as keyof Params], b = p[id as keyof Params];
      d += c.kind === "range" ? (((a as number) - (b as number)) / ((c as RangeControl).max - (c as RangeControl).min)) ** 2 : a === b ? 0 : 1;
    }
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/** First data (the precomputed baseline) and a live solve on every params change once the worker is ready. */
export function useLiveSolve(s: LabStore, st: LabState, sv: SolverState, ready: { model: BAModel | null; results: DispatchResults | null }) {
  useEffect(() => {
    if (ready.model && ready.results && !s.get().result) setPreset(s, ready.model, ready.results, st.ba, st.dayId, "baseline");
  }, [s, ready.model, ready.results, st.ba, st.dayId]);
  const pkey = st.params ? JSON.stringify(st.params) : "";
  useEffect(() => {
    if (sv.status !== "ready" || !st.params) return;
    const { ba, dayId, params, timeLimit } = s.get();
    requestSolve({ ba, dayId, params: params!, timeLimit }, (r) => {
      const cur = s.get();
      if ("error" in r) {
        s.set({ check: r.error === "CANCELLED" ? "SOLVE CANCELLED: SHOWING THE LAST RESULT" : `${r.error}: SHOWING THE LAST OPTIMAL RESULT` });
        return;
      }
      if (cur.ba !== ba || cur.dayId !== dayId || !sameParams(cur.params!, params!)) return; // stale
      if (r.check) { s.set({ check: `SOLVER RESULT FAILED A CHECK: ${r.check}` }); return; }
      s.set({ result: r.result, source: "browser", ms: r.ms, check: null, resultSeq: cur.resultSeq + 1 });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, sv.status, pkey, st.ba, st.dayId, st.timeLimit]);
}
