/**
 * Main-thread client of the solver worker (MOTION_SYSTEM 9.1, 6.3).
 * - created lazily (S04 entry prefetch, or S05/CTRL entry)
 * - latest-wins: at most 1 solve in flight and 1 pending
 * - real states: idle | loading (byte %) | ready | error; RETRY re-creates the
 *   worker; after 2 failures the session is preset-only (PRECOMPUTED)
 * - the parity badge only ever shows the report this build's worker computed
 */
import type { FromWorker, ToWorker } from "../workers/solver.worker";
import type { BA, DispatchModel, DispatchResult, Params, TestVectors } from "../model/types";
import type { ParityReport } from "../model/solve";

export interface SolverState {
  status: "idle" | "loading" | "ready" | "error" | "disabled";
  loaded: number; total: number | null;
  version: string; loadMs: number;
  parity: ParityReport | null; parityError: string | null;
  error: string | null; attempt: number;
  /** a solve is in flight longer than 150ms (no flicker) */
  solving: boolean;
}
export interface Solve { ba: BA; dayId: string; params: Params; timeLimit?: number }
type Done = (r: { result: DispatchResult; ms: number; check: string | null } | { error: string }) => void;

let state: SolverState = { status: "idle", loaded: 0, total: null, version: "", loadMs: 0, parity: null, parityError: null, error: null, attempt: 0, solving: false };
const listeners = new Set<() => void>();
const set = (p: Partial<SolverState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export const getSolver = () => state;
export const subscribeSolver = (l: () => void) => { listeners.add(l); return () => void listeners.delete(l); };

let worker: Worker | null = null;
let model: DispatchModel | null = null;
let vectors: TestVectors | null = null;
let nextId = 1;
let inflight: { id: number; done: Done; at: number } | null = null;
let pending: { req: Solve; done: Done } | null = null;
let solvingTimer = 0;
let failures = 0;

function fail(message: string) {
  failures++;
  worker?.terminate();
  worker = null;
  const err = { error: message };
  inflight?.done(err); pending?.done(err);
  inflight = pending = null;
  set({ status: failures >= 2 ? "disabled" : "error", error: message, solving: false });
}

function onMessage(e: MessageEvent<FromWorker>) {
  const m = e.data;
  if (m.type === "progress") set({ loaded: m.loaded, total: m.total });
  else if (m.type === "ready") {
    set({ status: "ready", version: m.version, loadMs: m.loadMs, error: null });
    // the parity report is cached for the session: a cancel (worker re-created) never re-runs or blanks it
    if (vectors && !state.parity) worker?.postMessage({ type: "parity", vectors } satisfies ToWorker);
    pump();
  } else if (m.type === "parity") set({ parity: m.report });
  else if (m.type === "result" || (m.type === "error" && m.where === "solve")) {
    if (inflight && m.id === inflight.id) {
      const d = inflight.done;
      inflight = null;
      clearTimeout(solvingTimer);
      set({ solving: false });
      d(m.type === "result" ? { result: m.result, ms: m.ms, check: m.check } : { error: m.message });
    }
    pump();
  } else if (m.type === "error" && m.where === "parity") set({ parityError: m.message });
  else if (m.type === "error") fail(`SOLVER ${m.where.toUpperCase()} FAILED (${m.message})`);
}

function create() {
  if (!model || worker || state.status === "disabled") return;
  set({ status: "loading", loaded: 0, total: null, attempt: state.attempt + 1, error: null });
  try {
    worker = new Worker(new URL("../workers/solver.worker.ts", import.meta.url), { type: "module", name: "highs-solver" });
  } catch (e) {
    fail(`WORKER COULD NOT START (${(e as Error).message})`);
    return;
  }
  worker.onmessage = onMessage;
  worker.onerror = (e) => { e.preventDefault(); fail("WORKER COULD NOT LOAD"); };
  worker.postMessage({ type: "init", model } satisfies ToWorker);
}

function pump() {
  if (!worker || state.status !== "ready" || inflight || !pending) return;
  const { req, done } = pending;
  pending = null;
  const id = nextId++;
  inflight = { id, done, at: performance.now() };
  solvingTimer = window.setTimeout(() => set({ solving: true }), 150);
  worker.postMessage({ type: "solve", id, ...req } satisfies ToWorker);
}

/** Start loading the solver (idempotent). Vectors may arrive later; parity runs when both exist. */
export function startSolver(m: DispatchModel, tv?: TestVectors | null) {
  model = m;
  if (tv && !vectors) {
    vectors = tv;
    if (state.status === "ready" && !state.parity) worker?.postMessage({ type: "parity", vectors } satisfies ToWorker);
  }
  if (state.status === "idle") create();
}
/**
 * CANCEL: highs.solve is synchronous inside the worker, so cancelling means terminating it and starting a
 * fresh one (wasm from the HTTP cache). Not a failure: it never counts toward "disabled". The caller keeps its last result.
 */
export function cancelSolve() {
  if (!inflight || !worker) return false;
  const d = inflight.done;
  inflight = null; pending = null;
  clearTimeout(solvingTimer);
  worker.terminate();
  worker = null;
  set({ status: "idle", solving: false });
  d({ error: "CANCELLED" });
  create();
  return true;
}
export const solveInFlight = () => !!inflight;

export function retrySolver() {
  if (state.status !== "error") return;
  create();
}
/** Latest-wins solve: a newer request replaces the pending one (its callback gets nothing). */
export function requestSolve(req: Solve, done: Done) {
  pending = { req, done };
  pump();
}
