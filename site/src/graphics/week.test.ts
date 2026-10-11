import { describe, expect, it } from "vitest";
import { leaveT, unrollPetals, type Plot } from "./week";

describe("S04 unroll (QA D-002: petals separate as they leave, nothing converges on a hub)", () => {
  const rose = { cx: 700, cy: 400, R100: 300 };
  const plot: Plot = { x0: 96, x1: 1344, y0: 300, y1: 590, hours: 168, ymax: 50_000 };
  const mw = Array.from({ length: 168 }, (_, i) => 30_000 + 8_000 * Math.sin((i / 24) * 2 * Math.PI));
  const startR = Array.from({ length: 24 }, (_, h) => 150 + 40 * Math.cos((h / 24) * 2 * Math.PI));
  it("a petal is drawn only once it leaves; until then it belongs to the stack rose", () => {
    expect(unrollPetals(mw, rose, plot, 0, 0, startR)).toHaveLength(0);
    const mid = unrollPetals(mw, rose, plot, 0.2, 0, startR).map((p) => p.h);
    expect(mid).toEqual(Array.from({ length: 24 }, (_, h) => h).filter((h) => leaveT(0.2, h) > 0));
    expect(unrollPetals(mw, rose, plot, 1, 0, startR)).toHaveLength(24);
  });
  it("no piece ever reaches the rose centre (no hub, no centre notch)", () => {
    for (let t = 0.02; t < 1; t += 0.02) {
      const ps = unrollPetals(mw, rose, plot, t, 0, startR);
      // a hub = several pieces meeting near the centre at once; at most two may pass through it in flight
      const near = ps.filter((p) => p.pts.some(([x, y]) => Math.hypot(x - rose.cx, y - rose.cy) < 0.15 * startR[p.h]!));
      expect(near.length, `t ${t.toFixed(2)}`).toBeLessThanOrEqual(2);
      // a leaving piece starts as its own annular piece, clear of the centre
      for (const p of ps) if (p.e < 0.005) for (const [x, y] of p.pts) expect(Math.hypot(x - rose.cx, y - rose.cy)).toBeGreaterThan(0.25 * startR[p.h]!);
    }
  });
});
