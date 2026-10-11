/**
 * The window city (VISUAL_DESIGN 3.4 S03a, design/window-city.json): a unit chart, not geography.
 * 1 window = 100 MW of OBSERVED demand; buildings are groups of 80 windows, lit one building at a
 * time in lighting_order, bottom row first, left to right.
 */
import CITY from "../data/window-city.json";
import type { Skyline } from "../scenes/geometry";

export { CITY };
export const litCount = (demandMw: number) => Math.min(CITY.total_windows, Math.round(demandMw / CITY.mw_per_window));

/** Window i of building b is lit when its rank in the lighting sequence is below `lit`. */
export function windowRank(b: number, slot: number) {
  return CITY.lighting_order.indexOf(b) * CITY.windows_per_building + slot;
}

export interface Win { x: number; y: number; b: number; slot: number; rank: number }
/** Window rectangles for a skyline box (slot 0 = bottom-left; rows fill left to right). */
export function windows(sky: Skyline): Win[] {
  const out: Win[] = [];
  let x = sky.x0;
  CITY.widths.forEach((w, b) => {
    for (let slot = 0; slot < CITY.windows_per_building; slot++) {
      const row = Math.floor(slot / w), col = slot % w;
      out.push({ x: x + col * sky.pitch, y: sky.base - (row + 1) * sky.pitch, b, slot, rank: windowRank(b, slot) });
    }
    x += w * sky.pitch + sky.gap;
  });
  return out;
}
