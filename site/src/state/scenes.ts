/** Tiny external stores shared by the scene DOM (React) and the canvas director (per frame). */
import type { BA, DispatchResult, Params } from "../model/types";

export function store<T extends object>(init: T) {
  let v = init;
  let version = 0;
  const ls = new Set<() => void>();
  return {
    get: () => v,
    version: () => version,
    set: (p: Partial<T>) => { v = { ...v, ...p }; version++; ls.forEach((l) => l()); },
    subscribe: (l: () => void) => { ls.add(l); return () => void ls.delete(l); },
  };
}

/** S03a: GRID / DAY are visitor-set; the hour comes from scroll (integer only). */
export const city = store({ ba: "CISO" as BA, dayId: "winter", hour: 0 });

/** S05: the lab. `result` is what the rose shows; `source` says where it came from (never mixed up). */
export const fill = store({
  ba: "CISO" as BA, dayId: "summer",
  params: null as Params | null,
  result: null as DispatchResult | null,
  source: "none" as "none" | "browser" | "precomputed",
  presetId: "baseline" as string | null,
  ms: 0, check: null as string | null,
  /** bumped on every new result: the director starts a re-solve pulse */
  resultSeq: 0,
});
