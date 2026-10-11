import { describe, expect, it } from "vitest";
import { CITY, litCount, windows } from "./city";

describe("window city (interaction 2)", () => {
  it("lights round(demand / 100) windows; 1 window = 100 MW", () => {
    expect(litCount(26_793)).toBe(268);
    expect(litCount(26_749)).toBe(267);
    expect(CITY.mw_per_window).toBe(100);
    expect(CITY.widths.every((w) => CITY.windows_per_building % w === 0)).toBe(true);
    expect(CITY.widths.length * CITY.windows_per_building).toBe(CITY.total_windows);
  });
  it("fills buildings in lighting_order, each to 80 before the next starts, bottom row first", () => {
    const ws = windows({ x0: 96, base: 812, win: 9, pitch: 12, gap: 24 });
    const lit = 200;
    const on = ws.filter((w) => w.rank < lit);
    const per = new Map<number, number>();
    on.forEach((w) => per.set(w.b, (per.get(w.b) ?? 0) + 1));
    const order = CITY.lighting_order;
    expect(per.get(order[0]!)).toBe(80);
    expect(per.get(order[1]!)).toBe(80);
    expect(per.get(order[2]!)).toBe(40);
    expect([...per.keys()].sort()).toEqual([order[0], order[1], order[2]].sort());
    // within the partly lit building, the lit windows are its lowest rows
    const partial = ws.filter((w) => w.b === order[2]);
    const maxLitY = Math.min(...partial.filter((w) => w.rank < lit).map((w) => w.y));
    expect(partial.filter((w) => w.rank >= lit).every((w) => w.y <= maxLitY)).toBe(true);
  });
  it("spans the D skyline x 96-1272 exactly", () => {
    const ws = windows({ x0: 96, base: 812, win: 9, pitch: 12, gap: 24 });
    expect(Math.max(...ws.map((w) => w.x)) + 12).toBe(1272);
  });
});
