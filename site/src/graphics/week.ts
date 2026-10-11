/**
 * S04 "Tomorrow, unrolled": the rose opens at midnight into bars on the week axis (angle -> x, area -> height),
 * then the bars become the OBSERVED line and the forecasts arrive in the honesty grammar (VISUAL_DESIGN 0):
 * actual solid white 2px, EIA dashed 4/3, seasonal naive dotted 50%, ours P50 #8FA2FF 1.5px, P10-P90 hatch
 * (never a solid fill). No gridlines and no legend box: the legend is a direct mono row in the DOM.
 */
import { clamp } from "../lib/math";
import { petalAngles, radius } from "./rose";

/** QA L13: CSS-px boxes of what the fixed canvas drew this frame (labels, axis, skyline), for the collision test. */
export interface Mark { name: string; x: number; y: number; w: number; h: number }
export const canvasMarks: Mark[] = [];
export interface Plot { x0: number; x1: number; y0: number; y1: number; hours: number; ymax: number }
export const px = (p: Plot, i: number) => p.x0 + ((p.x1 - p.x0) * i) / p.hours;
export const py = (p: Plot, mw: number) => p.y1 - ((p.y1 - p.y0) * mw) / p.ymax;

/**
 * The unroll at t (0 = polar petal, 1 = bar), for the first 24 hours shown. Each petal is its own piece (6 points on its
 * outer arc, 2 on an inner chord clear of the centre) that leaves in turn from the midnight cut: its centroid travels
 * from the rose to its bar while its shape morphs about that centroid, so petals separate as they leave and no edge
 * ever converges on a hub (QA D-002). The cut is at midnight: 00 lands on the left.
 * `startR` (px) starts each petal at the rose it unrolls from (S04 opens the S03b rose); otherwise r(mw).
 */
/** Hour h's own progress at unroll t: petals leave one by one from the midnight cut. */
export const leaveT = (t: number, h: number) => clamp((t - h * 0.015) / (1 - 23 * 0.015));
export function unrollPetals(mw: (number | null)[], rose: { cx: number; cy: number; R100: number }, plot: Plot, t: number, first = 0, startR?: number[]) {
  const bw = (plot.x1 - plot.x0) / plot.hours;
  const out: { h: number; e: number; pts: [number, number][] }[] = [];
  for (let h = 0; h < 24; h++) {
    const v = mw[first + h];
    if (v === null || v === undefined) continue;
    const th = leaveT(t, h);
    if (startR && th <= 0) continue; // still part of the rose it leaves from
    const e = th * th * (3 - 2 * th);
    const [a0, a1] = petalAngles(h);
    const inset = (a1 - a0) * 0.08, b0 = a0 + inset, b1 = a1 - inset;
    const r = startR?.[h] ?? radius(v, rose.R100), rIn = r * 0.3;
    const x0 = px(plot, first + h), x1 = x0 + bw * 0.86, top = py(plot, v), bot = plot.y1;
    const P: [number, number][] = [], B: [number, number][] = [];
    for (let i = 0; i <= 5; i++) {
      const a = b0 + ((b1 - b0) * i) / 5;
      P.push([rose.cx + Math.cos(a) * r, rose.cy + Math.sin(a) * r]);
      B.push([x0 + ((x1 - x0) * i) / 5, top]);
    }
    P.push([rose.cx + Math.cos(b1) * rIn, rose.cy + Math.sin(b1) * rIn], [rose.cx + Math.cos(b0) * rIn, rose.cy + Math.sin(b0) * rIn]);
    B.push([x1, bot], [x0, bot]);
    const mean = (q: [number, number][]) => [q.reduce((s2, z) => s2 + z[0], 0) / q.length, q.reduce((s2, z) => s2 + z[1], 0) / q.length] as const;
    const [px0, py0] = mean(P), [bx0, by0] = mean(B);
    // the flight bows outward (away from the rose centre), so no two pieces cross the hub together
    const ux = px0 - rose.cx, uy = py0 - rose.cy, ul = Math.hypot(ux, uy) || 1, bow = Math.sin(Math.PI * e) * 0.9 * r;
    const cx = px0 + (bx0 - px0) * e + (ux / ul) * bow, cy = py0 + (by0 - py0) * e + (uy / ul) * bow;
    out.push({ h, e, pts: P.map(([x, y], i) => [cx + (x - px0) + ((B[i]![0] - bx0) - (x - px0)) * e, cy + (y - py0) + ((B[i]![1] - by0) - (y - py0)) * e]) });
  }
  return out;
}
/** A leaving petal's own STACK bands, in px along its radius: [r0, r1, c0, c1] from the centre outward. */
export type BandRun = [number, number, string, string][];
const mixHex = (a: string, b: string, k: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i]! - v) * k)).join(",")})`;
};
const BAR = "#383838"; // drawBars: white 22% on black
export function drawUnroll(c: CanvasRenderingContext2D, mw: (number | null)[], rose: { cx: number; cy: number; R100: number }, plot: Plot, t: number, first = 0, startR?: number[], alpha = 1, bands?: (BandRun | undefined)[]) {
  const ps = unrollPetals(mw, rose, plot, t, first, startR);
  c.save();
  c.globalAlpha = alpha;
  for (const { h, pts, e } of ps) {
    const run = bands?.[h];
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
    if (run && run.length) {
      // the piece keeps its own band gradients (QA D-002) along its axis, from the inner chord to the outer arc,
      // and settles to the bar's grey as it lands
      const r = startR?.[h] ?? 1, rIn = r * 0.3;
      const ix = (pts[6]![0] + pts[7]![0]) / 2, iy = (pts[6]![1] + pts[7]![1]) / 2;
      const ox = (pts[2]![0] + pts[3]![0]) / 2, oy = (pts[2]![1] + pts[3]![1]) / 2;
      const g = c.createLinearGradient(ix, iy, ox, oy);
      const land = clamp((e - 0.7) / 0.3);
      let last = 0;
      for (const [r0, r1, c0, c1] of run) {
        if (r1 <= rIn) continue;
        const f0 = Math.max(last, clamp((r0 - rIn) / (r - rIn))), f1 = Math.max(f0, clamp((r1 - rIn) / (r - rIn)));
        g.addColorStop(f0, mixHex(c0, BAR, land)); g.addColorStop(f1, mixHex(c1, BAR, land));
        last = f1;
      }
      c.fillStyle = g;
    } else c.fillStyle = `rgba(255,255,255,${(0.42 - 0.18 * e).toFixed(3)})`;
    c.fill();
  }
  // the lit rim leads the unroll: each petal's tip (it becomes the bar top), never a radial line
  c.strokeStyle = `rgba(255,255,255,${(0.45 + 0.4 * t).toFixed(2)})`; c.lineWidth = 1.5; c.lineCap = "round";
  for (const { pts } of ps) { c.beginPath(); pts.slice(0, 6).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); }
  c.restore();
}

/** Bars for hours [from, to) rising from the axis (scaleY 0..1, 4ms-equivalent stagger folded into `rise`). */
export function drawBars(c: CanvasRenderingContext2D, mw: (number | null)[], plot: Plot, from: number, to: number, rise: (i: number) => number, alpha: number) {
  const bw = (plot.x1 - plot.x0) / plot.hours;
  c.fillStyle = `rgba(255,255,255,${(0.22 * alpha).toFixed(3)})`;
  for (let i = from; i < to; i++) {
    const v = mw[i];
    if (v === null || v === undefined) continue;
    const k = rise(i);
    if (k <= 0) continue;
    const top = py(plot, v * k);
    c.fillRect(px(plot, i), top, bw * 0.86, plot.y1 - top);
  }
}

export interface SeriesStyle { color: string; width: number; dash: number[] }
export const STYLE: Record<string, SeriesStyle> = {
  actual: { color: "#ffffff", width: 2, dash: [] },
  seasonal_naive: { color: "rgba(255,255,255,0.5)", width: 1, dash: [1, 3] },
  eia_day_ahead: { color: "#ffffff", width: 1, dash: [4, 3] },
  best: { color: "#ffffff", width: 1, dash: [6, 3, 1, 3] },
  gbm: { color: "#8FA2FF", width: 1.5, dash: [] },
};

/** A series as a line through hour centres; nulls break the line (never joined). `upTo` reveals left to right (0..1). */
export function drawSeries(c: CanvasRenderingContext2D, y: (number | null)[], plot: Plot, st: SeriesStyle, upTo = 1, first = 0, last = y.length) {
  const xMax = px(plot, first) + (px(plot, last) - px(plot, first)) * clamp(upTo);
  c.save();
  c.beginPath(); c.rect(plot.x0 - 4, 0, xMax - plot.x0 + 4, 1e5); c.clip();
  c.strokeStyle = st.color; c.lineWidth = st.width; c.setLineDash(st.dash); c.lineJoin = "round";
  c.beginPath();
  let pen = false;
  const half = (plot.x1 - plot.x0) / plot.hours / 2;
  for (let i = first; i < last; i++) {
    const v = y[i];
    if (v === null || v === undefined) { pen = false; continue; }
    const X = px(plot, i) + half, Y = py(plot, v);
    if (pen) c.lineTo(X, Y); else c.moveTo(X, Y);
    pen = true;
  }
  c.stroke();
  c.restore();
}

let bandPattern: CanvasPattern | null = null;
/** P10-P90 as a 45-degree #8FA2FF hatch (1px at a 6px pitch, 50%), clipped to the band, no edge line. */
export function drawBand(c: CanvasRenderingContext2D, lo: (number | null)[], hi: (number | null)[], plot: Plot, upTo = 1, first = 0, last = lo.length) {
  if (!bandPattern && typeof document !== "undefined") {
    const t = document.createElement("canvas"); t.width = t.height = 12;
    const g = t.getContext("2d")!; g.strokeStyle = "rgba(143,162,255,0.5)"; g.lineWidth = 1;
    for (const o of [-12, -6, 0, 6, 12]) { g.beginPath(); g.moveTo(o, 12); g.lineTo(o + 12, 0); g.stroke(); }
    bandPattern = c.createPattern(t, "repeat");
  }
  const half = (plot.x1 - plot.x0) / plot.hours / 2;
  const xMax = px(plot, first) + (px(plot, last) - px(plot, first)) * clamp(upTo);
  c.save();
  c.beginPath(); c.rect(plot.x0 - 4, 0, xMax - plot.x0 + 4, 1e5); c.clip();
  c.fillStyle = bandPattern ?? "rgba(143,162,255,0.2)";
  let i = first;
  while (i < last) {
    while (i < last && (lo[i] == null || hi[i] == null)) i++;
    const s = i;
    while (i < last && lo[i] != null && hi[i] != null) i++;
    if (i - s < 1) continue;
    c.beginPath();
    for (let k = s; k < i; k++) { const X = px(plot, k) + half; if (k === s) c.moveTo(X, py(plot, hi[k]!)); else c.lineTo(X, py(plot, hi[k]!)); }
    for (let k = i - 1; k >= s; k--) c.lineTo(px(plot, k) + half, py(plot, lo[k]!));
    c.closePath(); c.fill();
  }
  c.restore();
}

/** The axis and the day labels (mono, no gridlines), plus the 0 and top MW labels at the left. */
export function drawAxis(c: CanvasRenderingContext2D, plot: Plot, days: string[], label: number, alpha: number) {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = "rgba(255,255,255,0.32)";
  c.fillRect(plot.x0, plot.y1 + 1, plot.x1 - plot.x0, 1);
  c.fillStyle = "rgba(255,255,255,0.75)";
  c.font = `400 ${label}px "JetBrains Mono Variable", "JetBrains Mono Fallback", ui-monospace, monospace`;
  c.textBaseline = "top";
  const per = plot.hours / days.length;
  days.forEach((d, i) => { c.fillText(d, px(plot, i * per) + 2, plot.y1 + 8); canvasMarks.push({ name: `day ${d}`, x: px(plot, i * per) + 2, y: plot.y1 + 8, w: c.measureText(d).width, h: label }); });
  c.textBaseline = "bottom";
  const top = `${Math.round(plot.ymax).toLocaleString("en-US")} MW`;
  c.fillText(top, plot.x0, plot.y0 - 4);
  if (alpha > 0.3) canvasMarks.push({ name: "week axis", x: plot.x0, y: plot.y1, w: plot.x1 - plot.x0, h: 3 }, { name: "week top label", x: plot.x0, y: plot.y0 - 4 - label, w: c.measureText(top).width, h: label });
  c.restore();
}
