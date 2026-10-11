import { clamp } from "../lib/math";
import { linear } from "./ease";

/** Normalized track progress (MOTION_SYSTEM 4). */
export function trackProgress(scrollY: number, trackTop: number, trackHeight: number, viewportH: number) {
  return clamp((scrollY - trackTop) / Math.max(1, trackHeight - viewportH));
}

/** Scrub helper: local window [a, b] of a progress value, eased and clamped. */
export function windowed(p: number, a: number, b: number, ease: (t: number) => number = linear) {
  return ease(clamp((p - a) / (b - a)));
}

/**
 * Threshold-stepped state with hysteresis. `thresholds` are the boundaries
 * between states (sorted), so there are thresholds.length + 1 states.
 * Forward: enter state k+1 when p > t_k + h. Backward: release when p < t_k - h.
 * Any jump (rapid scroll) resolves to the final state in one call: no chaining.
 */
export function stepState(prev: number, p: number, thresholds: readonly number[], h = 0.02) {
  let s = prev;
  while (s < thresholds.length && p > thresholds[s]! + h) s++;
  while (s > 0 && p < thresholds[s - 1]! - h) s--;
  return s;
}

/** Hysteresis-free resolution used after a direct jump (6.2 step 3). */
export const resolveState = (p: number, thresholds: readonly number[]) =>
  thresholds.filter((t) => p >= t).length;
