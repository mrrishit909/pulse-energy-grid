/**
 * The Day Rose renderer (VISUAL_DESIGN section 0, amendment CD-002).
 *
 * - Area is energy: a cumulative stack value c (MW) sits at r = R100 * sqrt(c / 100,000).
 *   Callers pass stack values in MW and every tween happens in MW (= r^2), never in r.
 * - Bands are luminous radial gradients (dark inner stop -> bright outer stop), no strokes.
 * - Petals separate by a black gap that tapers to 0 inside 45% of the day's peak-tip radius
 *   (smoothstep to full width at 80%); where it is 0 neighbours overlap 0.2px (no seam, no hub).
 * - No spokes, no hub, no rings, no radial strokes: every stroke this file makes is an ARC.
 * - Rim glow on the outermost visible band; rim beat brightens it; bloom is a separate pass.
 * Pure drawing: the caller decides what to show (fill progress, tweens, lift).
 */
import { clamp } from "../lib/math";

export const MW100 = 100_000;
/** Radius of a cumulative stack value. Never linear in MW. */
export const radius = (mw: number, R100: number) => R100 * Math.sqrt(Math.max(0, mw) / MW100);
/** Inverse: the MW a radius encloses (used by tests and hooks). */
export const mwAt = (r: number, R100: number) => (r / R100) ** 2 * MW100;
/** Retargetable tweens interpolate area: lerp the MW (= r^2), then take the radius. */
export const areaLerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Sky orientation: noon at the top, dawn left, dusk right; clockwise from 12 o'clock. Canvas angle (0 = +x). */
export function petalAngles(h: number): [number, number] {
  const a0 = ((h - 12) * 15 * Math.PI) / 180;
  return [a0 - Math.PI / 2, a0 + Math.PI / 12 - Math.PI / 2];
}

/** Visible half-width (px) of the inter-petal gap at radius r (0 inside 45% of rref, full at 80%+). */
export function gapHalf(r: number, full: number, rref: number) {
  const t = clamp((r / rref - 0.45) / 0.35);
  return full * t * t * (3 - 2 * t);
}
/**
 * Signed edge offset used for the path. Inside the core neighbours OVERLAP by 1px (a later petal paints
 * over an earlier one, so no anti-aliasing seam can darken into a spoke or a hub); the overlap hands over
 * continuously to the tapered gap: offset = gap(r) - 1px x (1 - t), t the same smoothstep.
 */
const OVERLAP = 1;
const edge = (r: number, full: number, rref: number) => {
  const t = clamp((r / rref - 0.45) / 0.35);
  const s = t * t * (3 - 2 * t);
  return full * s - OVERLAP * (1 - s);
};

// ---------------------------------------------------------------- tokens (VISUAL_DESIGN "Fuel tokens")
export interface Fuel { c0: string; c1: string; hatch?: boolean }
export const FUEL: Record<string, Fuel> = {
  solar: { c0: "#FFC23D", c1: "#FFF3A6" },
  wind: { c0: "#58B8E1", c1: "#8FD9FF" },
  nuclear: { c0: "#8FD9FF", c1: "#F2FBFF" },
  hydro: { c0: "#192CE4", c1: "#58B8E1" },
  imports: { c0: "#192CE4", c1: "#5B6BFF" },
  battery: { c0: "#3A0AA8", c1: "#9B5CFF" },
  other: { c0: "#2E2E2E", c1: "#9A9A9A" },
  gas: { c0: "#3A0F06", c1: "#B8361A" },
  peaker: { c0: "#3A0F06", c1: "#D9481F" },
  coal: { c0: "#1E1E1E", c1: "#5A5A5A" },
  oil: { c0: "#1E1E1E", c1: "#5A5A5A", hatch: true },
};
/** Band key (EIA fuel code or dispatch class id) -> fuel token. */
export const TOKEN: Record<string, keyof typeof FUEL> = {
  SUN: "solar", WND: "wind", NUC: "nuclear", WAT: "hydro", IMPORTS: "imports", OTH: "other", NG: "gas", COL: "coal", OIL: "oil",
  solar: "solar", wind: "wind", nuclear: "nuclear", hydro: "hydro", imports: "imports", other: "other", battery_discharge: "battery",
  ccgt: "gas", peaker: "peaker", coal: "coal", oil: "oil",
};
const SINK_CHARGE = "#9B5CFF", SINK_EXPORT = "#9A9A9A", CURTAIL = "#8FD9FF", UNSERVED_EDGE = "#FF6A4D";

// ---------------------------------------------------------------- input model
/** One petal in MW. bands[k] = [inner, outer] cumulative MW of band k (same keys, same order in every petal). */
export interface PetalIn {
  hour: number;
  bands: [number, number][];
  /** demand MW (petal tip when everything balances) */
  demand: number;
  /** MW actually served by the stack (demand - unserved; or the observed stack net of sinks) */
  served: number;
  /** sink cap beyond the demand line: charging (and station use), then exports */
  charge: number; exports: number;
  /** OBSERVED balance residual (demand - (stack - sinks)); either sign; outline only */
  residual: number;
  /** SIMULATED unserved MW; SIMULATED curtailed MW (outline beyond the tip) */
  unserved: number; curtailed: number;
}
export interface RoseView {
  cx: number; cy: number; R100: number;
  /** the day's peak-tip radius reference for the gap taper (constant through a fill) */
  rref: number;
  /** full gap half-width in px (0.75 at G0, 0.5 elsewhere; M 0.5 / 0.375) */
  gap: number;
  /** demand silhouette (white fill) alpha: 0.06 S00, 0.08 S05, 0.12 empty */
  ghost: number;
  /** 0..1 overall opacity of bands / caps (silhouette-only frames use 0) */
  bands: number;
  /** 0..1 visibility of sink caps, residual and the demand line */
  marks: number;
  /** rim beat 0..1 (+18% brightness on the outermost band at 1) */
  beat: number;
  /** selected hour and its lift 0..1 */
  lift: number | null; liftT: number;
  /** rim glow inner reach in px (22 D, 14 T, 10 M) */
  glow: number;
  /** keys parallel to PetalIn.bands */
  keys: string[];
}

/** What was drawn: the hooks for area-truth / radial-only tests. */
export interface RoseLog {
  R100: number; cx: number; cy: number; rPeakDemand: number;
  petals: { hour: number; drawn: string[]; bands: { key: string; r0: number; r1: number; mw: number }[] }[];
}

// ---------------------------------------------------------------- drawing
export type Ctx = Pick<CanvasRenderingContext2D,
  "beginPath" | "moveTo" | "arc" | "lineTo" | "closePath" | "fill" | "stroke" | "save" | "restore" | "createRadialGradient" | "createPattern" |
  "setLineDash" | "translate" | "fillText"> & {
  fillStyle: string | CanvasGradient | CanvasPattern; strokeStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number; lineWidth: number; font: string; textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline;
  globalCompositeOperation: GlobalCompositeOperation;
};

/** Radii where a petal side bends: the band ends plus samples across the taper (0.45..0.80 of rref). */
function sideRadii(r0: number, r1: number, rref: number) {
  const out = [r0];
  // core: doubling radii keep the 1px overlap parallel to the nominal edge all the way in
  for (let r = 2; r < 0.45 * rref; r *= 2) if (r > r0 && r < r1) out.push(r);
  for (let k = 0; k <= 7; k++) { const r = rref * (0.45 + (0.35 * k) / 7); if (r > r0 && r < r1) out.push(r); }
  out.push(r1);
  return out;
}
/**
 * One petal band as a filled path: outer arc, a side that follows the tapered gap (sampled, so the gap
 * is exactly the smoothstep at every radius, never a wedge), inner arc, the other side. Fill only.
 */
function sectorPath(ctx: Ctx, r0: number, r1: number, h: number, v: RoseView, begin = true) {
  const [a0, a1] = petalAngles(h);
  const ri = Math.max(r0, 0.01);
  // angular offset at radius r; overlaps are capped near the centre (a 1px overlap at r -> 0 is a huge angle)
  const d = (r: number) => Math.max(edge(r, v.gap, v.rref) / r, -0.13);
  const rs = sideRadii(ri, r1, v.rref);
  if (begin) ctx.beginPath();
  // a fresh subpath every time: without it, union paths join petals with stray segments that flip the winding
  ctx.moveTo(Math.cos(a0 + d(r1)) * r1, Math.sin(a0 + d(r1)) * r1);
  ctx.arc(0, 0, r1, a0 + d(r1), a1 - d(r1));
  for (let k = rs.length - 2; k >= 1; k--) { const r = rs[k]!, a = a1 - d(r); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.arc(0, 0, ri, a1 - d(ri), a0 + d(ri), true);
  for (let k = 1; k < rs.length - 1; k++) { const r = rs[k]!, a = a0 + d(r); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.closePath();
}
/** An arc stroke at radius r across the petal (never a radial line). */
function arcStroke(ctx: Ctx, r: number, h: number, v: RoseView) {
  const [a0, a1] = petalAngles(h);
  const d = Math.max(edge(r, v.gap, v.rref) / r, 0);
  ctx.beginPath();
  ctx.arc(0, 0, r, a0 + d, a1 - d);
  ctx.stroke();
}

const gradCache = new Map<string, CanvasGradient>();
function bandGradient(ctx: Ctx, r0: number, r1: number, f: Fuel) {
  const key = `${f.c0}${f.c1}|${r0.toFixed(1)}|${r1.toFixed(1)}`;
  let g = gradCache.get(key);
  if (!g) {
    if (gradCache.size > 4000) gradCache.clear();
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(r1, 0.01));
    g.addColorStop(clamp(r0 / Math.max(r1, 0.01)), f.c0);
    g.addColorStop(1, f.c1);
    gradCache.set(key, g);
  }
  return g;
}
/** Contexts change on resize; gradients belong to one context. */
export const resetRoseCache = () => gradCache.clear();

const patterns = new Map<string, CanvasPattern | null>();
function hatch(ctx: Ctx, color: string, bg: string | null, width = 1.5) {
  const key = `${color}|${bg}|${width}`;
  if (!patterns.has(key)) {
    if (typeof document === "undefined") { patterns.set(key, null); return null; }
    const c = document.createElement("canvas");
    c.width = c.height = 12; // 6px pitch at 45 degrees, tiled
    const g = c.getContext("2d")!;
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, 12, 12); }
    g.strokeStyle = color; g.lineWidth = width;
    for (const o of [-12, -6, 0, 6, 12]) { g.beginPath(); g.moveTo(o, 12); g.lineTo(o + 12, 0); g.stroke(); }
    patterns.set(key, ctx.createPattern(c, "repeat"));
  }
  return patterns.get(key) ?? color;
}

/**
 * Draw one rose. The canvas transform is left as found. Returns the geometry log.
 * Layer order per petal: ghost, bands (gradient), oil hatch, rim glow, beat, lift brighten,
 * then marks: sink caps, residual / unserved / curtailment outlines (arcs only), demand arc.
 */
export function drawRose(ctx: Ctx, petals: PetalIn[], v: RoseView): RoseLog {
  const log: RoseLog = { R100: v.R100, cx: v.cx, cy: v.cy, rPeakDemand: radius(Math.max(...petals.map((p) => p.demand), 0), v.R100), petals: [] };
  if (v.ghost > 0) {
    // the demand silhouette is ONE union path filled once: overlapping petal edges never double the alpha into spokes
    ctx.save();
    ctx.translate(v.cx, v.cy);
    ctx.globalAlpha = v.ghost;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    // no gaps on the silhouette: on a 6-8% white field the taper reads as striping (a fan of lines)
    const solid = { ...v, gap: 0 };
    for (const p of petals) sectorPath(ctx, 0, radius(p.demand, v.R100), p.hour, solid, false);
    ctx.fill();
    ctx.restore();
  }
  for (const p of petals) {
    const h = p.hour;
    const [a0, a1] = petalAngles(h);
    const lifted = v.lift === h ? v.liftT : 0;
    const mid = (a0 + a1) / 2;
    const off = 0.025 * v.R100 * lifted;
    ctx.save();
    ctx.translate(v.cx + Math.cos(mid) * off, v.cy + Math.sin(mid) * off);
    const rD = radius(p.demand, v.R100);
    const entry: RoseLog["petals"][number] = { hour: h, drawn: [], bands: [] };

    // the visible stack ends at what it served (+ nothing beyond the demand line is coloured)
    const top = Math.min(p.served, p.demand);
    let outerVisible = -1, outerR0 = 0, outerR1 = 0;
    if (v.bands > 0) {
      ctx.globalAlpha = v.bands;
      p.bands.forEach(([i, o], k) => {
        const key = v.keys[k]!;
        const r0 = radius(i, v.R100), r1 = radius(o, v.R100);
        entry.bands.push({ key, r0, r1, mw: o - i });
        if (o - i <= 0) return;
        entry.drawn.push(key);
        const vi = Math.min(i, top), vo = Math.min(o, top);
        if (vo - vi <= 0) return;
        const f = FUEL[TOKEN[key] ?? "other"]!;
        const q0 = radius(vi, v.R100), q1 = radius(vo, v.R100);
        ctx.fillStyle = bandGradient(ctx, q0, q1, f);
        sectorPath(ctx, q0, q1, h, v);
        ctx.fill();
        if (f.hatch) { ctx.fillStyle = hatch(ctx, "#000000", null, 2)!; ctx.fill(); }
        outerVisible = k; outerR0 = q0; outerR1 = q1;
      });
    }
    if (outerVisible >= 0) {
      // rim glow: white 0 -> 32% over the last `glow` px of the tip; the beat adds +18%
      const rg = Math.max(outerR0, outerR1 - v.glow);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, outerR1);
      g.addColorStop(clamp(rg / outerR1), "rgba(255,255,255,0)");
      g.addColorStop(1, `rgba(255,255,255,${(0.32 * (1 + v.beat * 0.6)).toFixed(3)})`);
      ctx.fillStyle = g;
      sectorPath(ctx, rg, outerR1, h, v);
      ctx.fill();
      if (v.beat > 0 || lifted > 0) {
        ctx.globalAlpha = v.bands * (0.18 * v.beat + 0.12 * lifted);
        ctx.fillStyle = "#ffffff";
        sectorPath(ctx, outerR0, outerR1, h, v);
        ctx.fill();
      }
    }

    if (v.marks > 0) {
      ctx.globalAlpha = v.marks;
      const sinks = p.charge + p.exports;
      const extra = Math.max(0, -p.residual); // supply beyond demand + sinks: residual of the other sign
      // sink cap: opaque black base, then hatch; charging first, exports outside it
      if (sinks > 0) {
        const rc = radius(p.demand + p.charge, v.R100), re = radius(p.demand + sinks, v.R100);
        if (p.charge > 0) { ctx.fillStyle = "#000"; sectorPath(ctx, rD, rc, h, v); ctx.fill(); ctx.fillStyle = hatch(ctx, hexA(SINK_CHARGE, 0.8), null)!; ctx.fill(); }
        if (p.exports > 0) { ctx.fillStyle = "#000"; sectorPath(ctx, rc, re, h, v); ctx.fill(); ctx.fillStyle = hatch(ctx, hexA(SINK_EXPORT, 0.8), null)!; ctx.fill(); }
        entry.drawn.push("sink");
      }
      ctx.lineWidth = 1;
      if (p.residual > 0.5) {
        // stack net of sinks falls short of demand: dotted outline r(served)..r(demand), no fill
        dotted(ctx, [radius(p.served, v.R100), rD], h, v, "rgba(255,255,255,0.5)");
        entry.drawn.push("residual");
      } else if (extra > 0.5) {
        const r0 = radius(p.demand + sinks, v.R100);
        dotted(ctx, [r0, radius(p.demand + sinks + extra, v.R100)], h, v, "rgba(255,255,255,0.5)");
        entry.drawn.push("residual");
      }
      if (p.unserved > 0.5) {
        const ru = radius(p.served, v.R100);
        ctx.fillStyle = hatch(ctx, "#ffffff", "#000000", 1)!;
        sectorPath(ctx, ru, rD, h, v); ctx.fill();
        ctx.strokeStyle = UNSERVED_EDGE; ctx.setLineDash([]);
        arcStroke(ctx, ru, h, v); arcStroke(ctx, rD, h, v);
        entry.drawn.push("unserved");
      }
      if (p.curtailed > 0.5) {
        const r0 = radius(p.demand + sinks, v.R100);
        dotted(ctx, [r0, radius(p.demand + sinks + p.curtailed, v.R100)], h, v, CURTAIL);
        entry.drawn.push("curtailed");
      }
      if (sinks > 0 || Math.abs(p.residual) > 0.5 || p.unserved > 0.5) {
        ctx.strokeStyle = "#ffffff"; ctx.setLineDash([]);
        arcStroke(ctx, rD, h, v);
      }
    }
    if (lifted > 0) {
      // the selected hour: a 1px white 70% line on the petal TIP only (no radial strokes, criterion 21)
      ctx.globalAlpha = 0.7 * lifted;
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1; ctx.setLineDash([]);
      arcStroke(ctx, Math.max(rD, radius(p.demand + p.charge + p.exports, v.R100)), h, v);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    log.petals.push(entry);
  }
  return log;
}

function dotted(ctx: Ctx, [r0, r1]: [number, number], h: number, v: RoseView, color: string) {
  ctx.strokeStyle = color;
  ctx.setLineDash([1, 3]);
  arcStroke(ctx, r0, h, v);
  arcStroke(ctx, r1, h, v);
  ctx.setLineDash([]);
}
function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Hour labels 00 06 12 18, 16px beyond that petal's own tip (they follow the data). */
export function drawHourLabels(ctx: Ctx, petals: PetalIn[], v: RoseView, size: number, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffffff";
  ctx.font = `400 ${size}px "JetBrains Mono Variable", "JetBrains Mono Fallback", ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const h of [0, 6, 12, 18]) {
    const p = petals.find((x) => x.hour === h);
    if (!p) continue;
    const [a0, a1] = petalAngles(h);
    const mid = (a0 + a1) / 2;
    const r = radius(Math.max(p.demand + p.charge + p.exports, p.demand), v.R100) + 16 + size / 2;
    ctx.fillText(String(h).padStart(2, "0"), v.cx + Math.cos(mid) * r, v.cy + Math.sin(mid) * r);
  }
  ctx.restore();
}

/** The re-solve energy pulse: a soft glow inside each petal's tip (8px falloff, screen blend; never a stroke). */
export function drawEdgeGlow(ctx: Ctx, petals: PetalIn[], v: RoseView, color: string, alpha: number, reach = 8) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.translate(v.cx, v.cy);
  ctx.globalCompositeOperation = "screen";
  const rgb = parseInt(color.slice(1), 16);
  const c = (a: number) => `rgba(${(rgb >> 16) & 255},${(rgb >> 8) & 255},${rgb & 255},${a})`;
  for (const p of petals) {
    const r1 = radius(Math.min(p.served, p.demand), v.R100);
    if (r1 < 1) continue;
    const r0 = Math.max(0, r1 - reach);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r1);
    g.addColorStop(clamp(r0 / r1), c(0));
    g.addColorStop(1, c(alpha));
    ctx.fillStyle = g;
    sectorPath(ctx, r0, r1, p.hour, v);
    ctx.fill();
  }
  ctx.restore();
}
