import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FUEL, areaLerp, drawRose, gapHalf, radius, type Ctx, type RoseView } from "./rose";
import { observedStack, petals, simulatedStack } from "../model/stack";
import type { DispatchModel, DispatchResults } from "../model/types";

const read = <T,>(f: string): T => JSON.parse(readFileSync(new URL(`../../public/data/${f}`, import.meta.url), "utf-8"));
const model = read<DispatchModel>("dispatch_model.json");
const results = read<DispatchResults>("dispatch_results.json");
const intro = model.bas.CISO.days.find((d) => d.intro)!;

/** A recording Canvas2D stand-in: every path's segments and what was done with it. */
function mockCtx() {
  const gradients = new Set<object>();
  let path: string[] = [];
  const strokes: string[][] = [];
  const fills: { style: unknown; path: string[] }[] = [];
  const ctx = {
    fillStyle: "" as unknown, strokeStyle: "" as unknown, globalAlpha: 1, lineWidth: 1, font: "", textAlign: "left", textBaseline: "alphabetic", globalCompositeOperation: "source-over",
    beginPath: () => { path = []; },
    arc: () => { path.push("arc"); },
    lineTo: () => { path.push("line"); },
    closePath: () => { path.push("close"); },
    fill: () => { fills.push({ style: ctx.fillStyle, path: [...path] }); },
    stroke: () => { strokes.push([...path]); },
    save() {}, restore() {}, translate() {}, setLineDash() {}, fillText() {},
    createRadialGradient: () => { const g = { addColorStop() {} }; gradients.add(g); return g; },
    createPattern: () => ({}),
  };
  return { ctx: ctx as unknown as Ctx, gradients, strokes, fills };
}

const view = (keys: string[], R100: number, rref: number): RoseView => ({
  cx: 720, cy: 400, R100, rref, gap: 0.75, ghost: 0.06, bands: 1, marks: 1, beat: 0, lift: 14, liftT: 1, glow: 22, keys,
});

describe("Day Rose geometry (VISUAL_DESIGN section 0)", () => {
  it("is area-true: every band's (r1^2 - r0^2) / R100^2 x 100,000 equals its MW", () => {
    const s = observedStack(intro);
    const ps = petals(s, () => 1);
    const peak = Math.max(...intro.demand_mw);
    const R100 = 620 / Math.sqrt(peak / 1e5);
    const { ctx } = mockCtx();
    const log = drawRose(ctx, ps, view(s.keys, R100, 620));
    let n = 0;
    log.petals.forEach((p, h) => p.bands.forEach((b, k) => {
      expect(((b.r1 ** 2 - b.r0 ** 2) / R100 ** 2) * 1e5).toBeCloseTo(s.hours[h]!.values[k]!, 6);
      n++;
    }));
    expect(n).toBe(24 * s.keys.length);
    expect(log.rPeakDemand).toBeCloseTo(620, 9); // G0: the intro day's peak petal is exactly 620px on D
  });
  it("is never linear in MW, and tweens interpolate area: the midpoint of 20 and 40 GW is R100 x sqrt(0.3)", () => {
    expect(radius(areaLerp(20_000, 40_000, 0.5), 470)).toBeCloseTo(470 * Math.sqrt(0.3), 9);
    expect(radius(40_000, 470) / radius(10_000, 470)).toBeCloseTo(2, 9);
  });
  it("tapers the petal gap: 0 at 0.4 x the peak-tip radius, full width at 0.9 x (within 0.1px)", () => {
    for (const full of [0.75, 0.5, 0.375]) {
      expect(gapHalf(0.4 * 600, full, 600)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(gapHalf(0.9 * 600, full, 600) - full)).toBeLessThanOrEqual(0.1);
    }
  });
  it("follows the taper exactly along each petal side (sampled, so no gap wedge opens inside a band)", () => {
    const pts: [number, number][] = [];
    const ctx = { ...mockCtx().ctx, lineTo: (x: number, y: number) => pts.push([x, y]) } as unknown as Ctx;
    const v = view(["SUN"], 470, 600);
    const one = { hour: 12, bands: [[0, 1e5 * (590 / 470) ** 2] as [number, number]], demand: 1e5 * (590 / 470) ** 2, served: 1e5 * (590 / 470) ** 2, charge: 0, exports: 0, residual: 0, unserved: 0, curtailed: 0 };
    drawRose(ctx, [one], { ...v, ghost: 0, marks: 0 });
    // petal 12 spans canvas angles -pi/2 .. -pi/2 + pi/12: each side point's distance inside its nominal edge equals the gap
    const A0 = -Math.PI / 2, A1 = A0 + Math.PI / 12;
    const side = pts.map(([x, y]) => {
      const r = Math.hypot(x, y), ang = Math.atan2(y, x);
      const o0 = (ang - A0) * r, o1 = (A1 - ang) * r;
      return { r, off: Math.abs(o0) < Math.abs(o1) ? o0 : o1 };
    });
    expect(side.length).toBeGreaterThan(4);
    for (const { r, off } of side.filter((x) => x.r > 8)) { // inside 8px the overlap angle is capped
      const t = Math.min(1, Math.max(0, (r / 600 - 0.45) / 0.35)), s = t * t * (3 - 2 * t);
      expect(off).toBeCloseTo(0.75 * s - 1 * (1 - s), 3);
    }
  });
  it("draws no radial strokes, no rings: every stroke is a single arc, every band a gradient (never a flat fuel swatch)", () => {
    const sim = model.bas.CISO;
    const day = sim.days.find((d) => d.id === "summer")!;
    const r = results.bas.CISO.days.summer!.battery_big!;
    for (const s of [observedStack(intro), simulatedStack(sim.display_order, day, day.demand_mw, r)]) {
      const { ctx, gradients, strokes, fills } = mockCtx();
      const log = drawRose(ctx, petals(s, () => 1), view(s.keys, 470, 300));
      expect(strokes.length).toBeGreaterThan(0);
      for (const st of strokes) expect(st).toEqual(["arc"]);
      const flat = new Set(Object.values(FUEL).flatMap((f) => [f.c0, f.c1]));
      expect(fills.filter((f) => typeof f.style === "string" && flat.has(f.style as string))).toEqual([]);
      const drawn = log.petals.reduce((a, p) => a + p.drawn.filter((k) => s.keys.includes(k)).length, 0);
      expect(fills.filter((f) => gradients.has(f.style as object)).length).toBeGreaterThanOrEqual(drawn);
    }
  });
});

describe("stack rules", () => {
  it("OBSERVED: stack - sinks + residual = demand in every hour; sinks are never inside demand", () => {
    for (const ba of ["CISO", "ERCO"] as const) for (const d of model.bas[ba].days) {
      const s = observedStack(d);
      s.hours.forEach((x) => {
        const P = x.values.reduce((a, b) => a + b, 0);
        expect(P - x.charge - x.exports + x.residual).toBeCloseTo(x.demand, 6);
      });
    }
    // COL is empty all day on the intro day: skipped; OIL is not
    expect(observedStack(intro).keys).toEqual(["SUN", "WND", "NUC", "WAT", "IMPORTS", "OTH", "NG", "OIL"]);
  });
  it("SIMULATED: positive bands - sinks = served, served + unserved = demand (0.5 MW)", () => {
    for (const ba of ["CISO", "ERCO"] as const) {
      const m = model.bas[ba];
      for (const d of m.days) for (const [, r] of Object.entries(results.bas[ba].days[d.id]!)) {
        if (r !== results.bas[ba].days[d.id]!.baseline && r !== results.bas[ba].days[d.id]!.battery_big) continue;
        const s = simulatedStack(m.display_order, d, d.demand_mw, r);
        petals(s, () => 1).forEach((p, h) => {
          const P = s.hours[h]!.values.reduce((a, b) => a + b, 0);
          expect(Math.abs(P - p.charge - p.exports - p.served)).toBeLessThan(0.5);
          expect(Math.abs(p.served + p.unserved - p.demand)).toBeLessThan(0.5);
        });
      }
    }
  });
  it("fill is radial: at any fill vector no petal shows a band beyond the one being filled", () => {
    const s = observedStack(intro);
    for (const k of [0.5, 2.5, 5.2, 7.9]) {
      const ps = petals(s, (j) => Math.max(0, Math.min(1, k - j)));
      for (const p of ps) p.bands.forEach(([i, o], j) => { if (j > Math.floor(k)) expect(o - i).toBe(0); });
    }
  });
});
