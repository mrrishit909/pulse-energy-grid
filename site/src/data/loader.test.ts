import { describe, expect, it, vi } from "vitest";
import { ArtifactStore, fetchJson, percent, reduce, type LoadState } from "./loader";

const enc = new TextEncoder();
function streamResponse(body: string, headers: Record<string, string> = {}, status = 200, chunk = 7) {
  const bytes = enc.encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += chunk) c.enqueue(bytes.slice(i, i + chunk));
      c.close();
    },
  });
  return new Response(stream, { status, headers });
}

describe("loader state machine", () => {
  const init: LoadState<number> = { status: "initial", attempt: 0 };
  it("initial -> loading -> ready", () => {
    let s = reduce(init, { type: "start" });
    expect(s).toMatchObject({ status: "loading", attempt: 1, retrying: false });
    s = reduce(s, { type: "progress", loaded: 5, total: 10 });
    expect(s).toMatchObject({ loaded: 5, total: 10 });
    s = reduce(s, { type: "success", data: 1, empty: false });
    expect(s).toEqual({ status: "ready", attempt: 1, data: 1 });
  });
  it("empty is its own state", () => {
    const s = reduce(reduce(init, { type: "start" }), { type: "success", data: 0, empty: true });
    expect(s.status).toBe("empty");
  });
  it("error -> retry increments the attempt and flags retrying", () => {
    const err = reduce(reduce(init, { type: "start" }), { type: "fail", reason: "HTTP 404" });
    expect(err).toEqual({ status: "error", attempt: 1, reason: "HTTP 404" });
    const again = reduce(err, { type: "start" });
    expect(again).toMatchObject({ status: "loading", attempt: 2, retrying: true });
  });
  it("ignores a second start while in flight and stray events", () => {
    const l = reduce(init, { type: "start" });
    expect(reduce(l, { type: "start" })).toBe(l);
    expect(reduce(init, { type: "progress", loaded: 1, total: 2 })).toBe(init);
  });
});

describe("percent", () => {
  it("is null when the total is unknown and never 100 before done", () => {
    expect(percent(10, null)).toBeNull();
    expect(percent(42, 100)).toBe(42);
    expect(percent(100, 100)).toBe(99);
  });
});

describe("fetchJson", () => {
  it("reports real byte progress against Content-Length", async () => {
    const body = JSON.stringify({ a: [1, 2, 3] });
    const seen: [number, number | null][] = [];
    const data = await fetchJson("x", (l, t) => seen.push([l, t]), async () => streamResponse(body, { "content-length": String(body.length) }));
    expect(data).toEqual({ a: [1, 2, 3] });
    expect(seen.at(-1)).toEqual([body.length, body.length]);
    expect(seen.length).toBeGreaterThan(2);
  });
  it("does not trust Content-Length when the body is content-encoded", async () => {
    const seen: (number | null)[] = [];
    await fetchJson("x", (_, t) => seen.push(t), async () => streamResponse("{}", { "content-length": "1", "content-encoding": "gzip" }));
    expect(seen.every((t) => t === null)).toBe(true);
  });
  it("maps HTTP, network and parse failures to readable reasons", async () => {
    await expect(fetchJson("x", () => {}, async () => new Response("nope", { status: 404 }))).rejects.toThrow("HTTP 404");
    await expect(fetchJson("x", () => {}, async () => { throw new TypeError("offline"); })).rejects.toThrow("NETWORK ERROR");
    await expect(fetchJson("x", () => {}, async () => streamResponse("<html>"))).rejects.toThrow("INVALID JSON");
  });
});

describe("ArtifactStore", () => {
  const spec = { file: "t.json", guard: (v: unknown): v is { n: number } => typeof (v as { n?: unknown })?.n === "number" };
  it("RETRY re-runs the same fetch and can succeed", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response("x", { status: 500 }))
      .mockResolvedValueOnce(streamResponse('{"n":3}'));
    const s = new ArtifactStore(spec, "/data/t.json", f);
    await s.load();
    expect(s.state).toMatchObject({ status: "error", reason: "HTTP 500", attempt: 1 });
    await s.load();
    expect(f).toHaveBeenCalledTimes(2);
    expect(f).toHaveBeenNthCalledWith(2, "/data/t.json");
    expect(s.state).toEqual({ status: "ready", attempt: 2, data: { n: 3 } });
  });
  it("does not refetch once ready, and rejects schema mismatches", async () => {
    const f = vi.fn().mockImplementation(async () => streamResponse('{"n":"three"}'));
    const s = new ArtifactStore(spec, "u", f);
    await s.load();
    expect(s.state).toMatchObject({ status: "error", reason: "SCHEMA MISMATCH" });
    const ok = new ArtifactStore(spec, "u", vi.fn().mockImplementation(async () => streamResponse('{"n":1}')));
    await ok.load();
    await ok.load();
    expect(ok.state.status).toBe("ready");
  });
  it("prefetch never silently retries a failure (RETRY belongs to the visitor)", async () => {
    const f = vi.fn().mockResolvedValue(new Response("x", { status: 503 }));
    const s = new ArtifactStore(spec, "u", f);
    s.prefetch();
    await vi.waitFor(() => expect(s.state.status).toBe("error"));
    s.prefetch();
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("notifies subscribers on every transition", async () => {
    const s = new ArtifactStore(spec, "u", async () => streamResponse('{"n":1}', { "content-length": "7" }));
    const statuses: string[] = [];
    s.subscribe(() => statuses.push(s.state.status));
    await s.load();
    expect(statuses[0]).toBe("loading");
    expect(statuses.at(-1)).toBe("ready");
  });
});
