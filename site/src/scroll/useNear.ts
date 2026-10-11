import { useActiveScene, useMotion } from "./hooks";
import { SCENES } from "../app/scenes";

/** True once the visitor is within one scene of `id` (or has passed it), or under reduced motion (all frames are static and shown).
 * Lazy artifacts (forecast_samples, forecast_eval, grid_topology) load from here, never on the first-paint path. */
export function useNear(id: string) {
  const active = useActiveScene();
  const motion = useMotion();
  const i = SCENES.findIndex((s) => s.id === id), a = SCENES.findIndex((s) => s.id === active);
  return !motion || (a >= 0 && a >= i - 1);
}
