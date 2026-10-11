/// <reference lib="webworker" />
/**
 * The HiGHS solver worker (MOTION_SYSTEM 9.1). Loads highs@1.15.3 with real
 * byte progress (the wasm is fetched here with a stream reader and handed to
 * Emscripten as wasmBinary), runs every parity vector once, then answers solve
 * requests. Parity yields between vectors so a visitor's solve never waits
 * behind the whole set. Every failure is posted back, never swallowed.
 */
import highsLoader from "highs";
import wasmUrl from "highs/runtime?url";
import { checkVector, solveDay, tally, type HighsLike, type VectorCheck } from "../model/solve";
import type { DispatchModel, Params, TestVectors } from "../model/types";

declare const self: DedicatedWorkerGlobalScope;

export type ToWorker =
  | { type: "init"; model: DispatchModel }
  | { type: "parity"; vectors: TestVectors }
  | { type: "solve"; id: number; ba: "CISO" | "ERCO"; dayId: string; params: Params };
export type FromWorker =
  | { type: "progress"; loaded: number; total: number | null }
  | { type: "ready"; version: string; loadMs: number }
  | { type: "parity"; report: ReturnType<typeof tally> }
  | { type: "result"; id: number; result: ReturnType<typeof solveDay>["result"]; ms: number; check: string | null }
  | { type: "error"; where: "load" | "solve" | "parity"; id?: number; message: string };

const post = (m: FromWorker) => self.postMessage(m);
let highs: HighsLike | null = null;
let model: DispatchModel | null = null;
let ready: Promise<void> | null = null;
const queue: ToWorker[] = [];

async function load() {
  const t0 = performance.now();
  const res = await fetch(wasmUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length"));
  // Content-Length counts compressed bytes when encoded; the stream yields raw bytes, so use the build-time raw size then
  const total = !res.headers.get("content-encoding") && len > 0 ? len : __HIGHS_WASM_BYTES__ || null;
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  const reader = res.body!.getReader();
  post({ type: "progress", loaded, total });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    post({ type: "progress", loaded, total });
  }
  const bin = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) { bin.set(c, o); o += c.byteLength; }
  const mod = (await highsLoader({ wasmBinary: bin.buffer } as never)) as unknown as HighsLike & { version?: { string: string } };
  highs = mod;
  post({ type: "ready", version: mod.version?.string ?? "1.15.3", loadMs: performance.now() - t0 });
}

function solve(m: Extract<ToWorker, { type: "solve" }>) {
  try {
    const s = solveDay(highs!, model!.bas[m.ba], m.dayId, m.params);
    post({ type: "result", id: m.id, result: s.result, ms: s.ms, check: s.check });
  } catch (e) {
    post({ type: "error", where: "solve", id: m.id, message: (e as Error).message });
  }
}

/** Latest-wins: only the newest pending solve runs. */
function drain() {
  const solves = queue.filter((q) => q.type === "solve");
  queue.length = 0;
  const last = solves.at(-1);
  if (last && last.type === "solve") solve(last);
}

async function parity(tv: TestVectors) {
  try {
    const checks: VectorCheck[] = [];
    const t0 = performance.now();
    for (const v of tv.vectors) {
      checks.push(await checkVector(highs!, model!, v, tv.tolerance_abs, tv.tolerance_price_usd_mwh));
      await new Promise((r) => setTimeout(r, 0)); // let a visitor's solve in
      drain();
    }
    post({ type: "parity", report: tally(checks, performance.now() - t0) });
  } catch (e) {
    post({ type: "error", where: "parity", message: (e as Error).message });
  }
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === "init") {
    model = m.model;
    ready = load().catch((err: Error) => post({ type: "error", where: "load", message: err.message.toUpperCase() }));
    return;
  }
  if (!ready) return;
  if (m.type === "parity") void ready.then(() => highs && parity(m.vectors));
  else { queue.push(m); void ready.then(() => highs && drain()); }
};
