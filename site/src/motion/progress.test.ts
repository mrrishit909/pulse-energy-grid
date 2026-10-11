import { describe, expect, it } from "vitest";
import { resolveState, stepState, trackProgress, windowed } from "./progress";
import { cubicBezier, easeSmooth } from "./ease";
import { Tween } from "./tween";
import { shortestDelta } from "../lib/math";
import { deckK, cardLanding } from "../components/StoryDeck";

describe("trackProgress", () => {
  it("is 0 at the track top, 1 at top + height - vh, clamped outside", () => {
    expect(trackProgress(1000, 1000, 2700, 900)).toBe(0);
    expect(trackProgress(1000 + 1800, 1000, 2700, 900)).toBe(1);
    expect(trackProgress(1000 + 900, 1000, 2700, 900)).toBeCloseTo(0.5);
    expect(trackProgress(0, 1000, 2700, 900)).toBe(0);
    expect(trackProgress(99999, 1000, 2700, 900)).toBe(1);
  });
  it("does not divide by zero for a track no taller than the viewport", () => {
    expect(trackProgress(10, 0, 900, 900)).toBe(1);
  });
});

describe("windowed scrub", () => {
  it("maps [a, b] to 0..1 and clamps", () => {
    expect(windowed(0.2, 0.2, 0.6)).toBe(0);
    expect(windowed(0.4, 0.2, 0.6)).toBeCloseTo(0.5);
    expect(windowed(0.9, 0.2, 0.6)).toBe(1);
  });
});

describe("threshold steps with hysteresis (+-0.02)", () => {
  const T = [0.25, 0.5, 0.75];
  it("advances only past t + h going forward", () => {
    expect(stepState(0, 0.26, T)).toBe(0);
    expect(stepState(0, 0.271, T)).toBe(1);
  });
  it("releases only below t - h going backward", () => {
    expect(stepState(1, 0.24, T)).toBe(1);
    expect(stepState(1, 0.229, T)).toBe(0);
  });
  it("does not flicker while hovering on a boundary", () => {
    let s = 0;
    for (const p of [0.26, 0.24, 0.265, 0.235, 0.26]) s = stepState(s, p, T);
    expect(s).toBe(0);
  });
  it("resolves a rapid multi-threshold jump in one call (no chaining)", () => {
    expect(stepState(0, 0.95, T)).toBe(3);
    expect(stepState(3, 0.01, T)).toBe(0);
  });
  it("S03b: p = 0.6 is state 2 (Brooklyn) forward and backward", () => {
    expect(stepState(0, 0.6, T)).toBe(2);
    expect(stepState(3, 0.6, T)).toBe(2);
    expect(resolveState(0.6, T)).toBe(2);
  });
});

describe("cubic-bezier easing", () => {
  it("hits the endpoints and is monotonic", () => {
    expect(easeSmooth(0)).toBe(0);
    expect(easeSmooth(1)).toBe(1);
    let last = 0;
    for (let x = 0.01; x <= 1; x += 0.01) {
      const y = easeSmooth(x);
      expect(y).toBeGreaterThanOrEqual(last);
      last = y;
    }
  });
  it("matches the linear curve exactly and solves x correctly", () => {
    const lin = cubicBezier(0, 0, 1, 1);
    for (const x of [0.1, 0.37, 0.8]) expect(lin(x)).toBeCloseTo(x, 5);
    // (.33,1,.68,1) is an ease-out: well past half-way at x = .5
    expect(easeSmooth(0.5)).toBeGreaterThan(0.85);
  });
});

describe("retargetable tween", () => {
  it("retargets from the current interpolated value with the full duration", () => {
    const t = new Tween(0, 1000, (x) => x);
    t.retarget(100, 0);
    t.update(500);
    expect(t.value).toBeCloseTo(50);
    t.retarget(0, 500);
    t.update(500);
    expect(t.value).toBeCloseTo(50); // no jump
    t.update(1000);
    expect(t.value).toBeCloseTo(25);
    t.update(1500);
    expect(t.value).toBe(0);
    expect(t.active).toBe(false);
  });
  it("angles take the shortest signed path", () => {
    expect(shortestDelta(350, 10)).toBe(20);
    expect(shortestDelta(10, 350)).toBe(-20);
    expect(shortestDelta(0, 180)).toBe(180);
    const t = new Tween(350, 1200, (x) => x, true);
    t.retarget(10, 0);
    t.update(600);
    expect(t.value).toBeCloseTo(360);
  });
  it("snap() finishes immediately (resize path)", () => {
    const t = new Tween(0, 1000);
    t.retarget(1, 0);
    t.snap();
    expect(t.value).toBe(1);
  });
});

describe("story deck position", () => {
  it("holds each card on its plateau, then eases to the next", () => {
    expect(deckK(0.05, 4).k).toBe(0);
    expect(deckK(cardLanding(1, 4), 4).k).toBe(1);
    expect(deckK(cardLanding(2, 4) - 0.01, 4).k).toBeGreaterThan(1);
    expect(deckK(cardLanding(2, 4) - 0.01, 4).k).toBeLessThan(2);
    expect(deckK(1, 4).k).toBe(3);
  });
  it("is monotonic in progress", () => {
    let last = -1;
    for (let p = 0; p <= 1; p += 0.005) {
      const { k } = deckK(p, 4);
      expect(k).toBeGreaterThanOrEqual(last);
      last = k;
    }
  });
});
