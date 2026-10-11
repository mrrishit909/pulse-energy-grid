/** Tiny external stores shared by the scene DOM (React) and the canvas director (per frame). */
import type { BA } from "../model/types";
import { store } from "./store";
export { store };

/** S03a: GRID / DAY are visitor-set; the hour comes from scroll (integer only). */
export const city = store({ ba: "CISO" as BA, dayId: "winter", hour: 0 });

/** S05 and CTRL: two independent labs (state/lab.ts). */
import { labStore } from "./lab";
export const fill = labStore("CISO", "summer");
export const ctrl = labStore("CISO", "winter");
