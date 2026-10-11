/**
 * Artifact loader with real operational states (VISUAL_DESIGN "Shared state UI",
 * MOTION_SYSTEM 7): initial -> loading (real byte progress) -> ready | empty |
 * error; retry re-runs the same fetch. One store per artifact so every scene
 * that needs one artifact shares a single request. No artificial delays.
 */
export type LoadState<T> =
  | { status: "initial"; attempt: 0 }
  | { status: "loading"; attempt: number; loaded: number; total: number | null; retrying: boolean }
  | { status: "ready"; attempt: number; data: T }
  | { status: "empty"; attempt: number; data: T }
  | { status: "error"; attempt: number; reason: string };

export type LoadEvent<T> =
  | { type: "start" }
  | { type: "progress"; loaded: number; total: number | null }
  | { type: "success"; data: T; empty: boolean }
  | { type: "fail"; reason: string };

/** Pure state machine (unit-tested). */
export function reduce<T>(s: LoadState<T>, e: LoadEvent<T>): LoadState<T> {
  switch (e.type) {
    case "start":
      if (s.status === "loading") return s; // already in flight: no duplicate request
      return { status: "loading", attempt: s.attempt + 1, loaded: 0, total: null, retrying: s.status === "error" };
    case "progress":
      return s.status === "loading" ? { ...s, loaded: e.loaded, total: e.total } : s;
    case "success":
      return s.status === "loading" ? { status: e.empty ? "empty" : "ready", attempt: s.attempt, data: e.data } : s;
    case "fail":
      return s.status === "loading" ? { status: "error", attempt: s.attempt, reason: e.reason } : s;
  }
}

/** Integer percent, or null when the total is unknown. Never reports 100 before done. */
export function percent(loaded: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.min(99, Math.floor((loaded / total) * 100));
}

export class LoadError extends Error {}

/**
 * fetch + stream reader. Content-Length is only trusted when the response is
 * not content-encoded (gzip lengths are compressed bytes while the stream
 * yields decompressed bytes, so a % would overshoot).
 */
export async function fetchJson(
  url: string,
  onProgress: (loaded: number, total: number | null) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url);
  } catch {
    throw new LoadError("NETWORK ERROR");
  }
  if (!res.ok) throw new LoadError(`HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length"));
  const total = !res.headers.get("content-encoding") && len > 0 ? len : null;
  let text: string;
  if (res.body) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    onProgress(0, total);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
    const all = new Uint8Array(loaded);
    let o = 0;
    for (const c of chunks) { all.set(c, o); o += c.byteLength; }
    text = new TextDecoder().decode(all);
  } else {
    text = await res.text();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new LoadError("INVALID JSON");
  }
}

export interface ArtifactSpec<T> {
  /** File name under site/public/data, e.g. "example.json". */
  file: string;
  guard: (v: unknown) => v is T;
  isEmpty?: (v: T) => boolean;
}

type Listener = () => void;
export class ArtifactStore<T> {
  state: LoadState<T> = { status: "initial", attempt: 0 };
  private listeners = new Set<Listener>();
  constructor(
    readonly spec: ArtifactSpec<T>,
    private url: string,
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}
  private dispatch(e: LoadEvent<T>) {
    const next = reduce(this.state, e);
    if (next !== this.state) {
      this.state = next;
      this.listeners.forEach((l) => l());
    }
  }
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  getState = () => this.state;
  /** Start only if never started: prefetch/autoload must not silently retry a failure (RETRY is the visitor's). */
  prefetch = () => {
    if (this.state.status === "initial") void this.load();
  };
  /** Starts the request if idle; retry when in error re-runs the same fetch. */
  load = async () => {
    if (this.state.status === "loading" || this.state.status === "ready" || this.state.status === "empty") return;
    this.dispatch({ type: "start" });
    try {
      const raw = await fetchJson(this.url, (loaded, total) => this.dispatch({ type: "progress", loaded, total }), this.fetchImpl);
      if (!this.spec.guard(raw)) throw new LoadError("SCHEMA MISMATCH");
      this.dispatch({ type: "success", data: raw, empty: this.spec.isEmpty?.(raw) ?? false });
    } catch (err) {
      this.dispatch({ type: "fail", reason: err instanceof LoadError ? err.message : "UNEXPECTED ERROR" });
    }
  };
}

const stores = new Map<string, ArtifactStore<unknown>>();
export const dataUrl = (file: string) => `${import.meta.env.BASE_URL}data/${file}`;

export function getStore<T>(spec: ArtifactSpec<T>): ArtifactStore<T> {
  let s = stores.get(spec.file) as ArtifactStore<T> | undefined;
  if (!s) {
    s = new ArtifactStore(spec, dataUrl(spec.file));
    stores.set(spec.file, s as ArtifactStore<unknown>);
  }
  return s;
}
