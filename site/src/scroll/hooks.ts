import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { getActive, onProgress, subscribeActive } from "./engine";
import { addFrame } from "../motion/loop";
import { motionEnabled, subscribeMotion } from "../state/motion";

/** Progress subscription without React re-renders: fn writes to refs/DOM. */
/** Latest-value ref (updated after render, so handlers never see stale closures). */
export function useLatest<T>(v: T) {
  const r = useRef(v);
  useLayoutEffect(() => { r.current = v; });
  return r;
}

export function useProgress(id: string, fn: (p: number) => void) {
  const ref = useLatest(fn);
  useEffect(() => (id ? onProgress(id, (p) => ref.current(p)) : undefined), [id, ref]);
}

/** Per-frame callback from the single loop. */
export function useFrame(fn: (now: number, dt: number) => void, priority = 100) {
  const ref = useLatest(fn);
  useEffect(() => addFrame((n, d) => ref.current(n, d), priority), [priority, ref]);
}

export const useActiveScene = () => useSyncExternalStore(subscribeActive, getActive, () => null);
export const useMotion = () => useSyncExternalStore(subscribeMotion, motionEnabled, () => true);
