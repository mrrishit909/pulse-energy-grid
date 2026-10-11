/**
 * S04 "Tomorrow, unrolled": the rose opens at midnight into bars on the week axis (angle -> x, area -> height),
 * then the bars become the OBSERVED line and the forecasts arrive in the honesty grammar (VISUAL_DESIGN 0):
 * actual solid white 2px, EIA dashed 4/3, seasonal naive dotted 50%, ours P50 #8FA2FF 1.5px, P10-P90 hatch
 * (never a solid fill). No gridlines and no legend box: the legend is a direct mono row in the DOM.
 */
import { clamp } from "../lib/math";
import { petalAngles, radius } from "./rose";

export interface Plot { x0: number; x1: number; y0: number; y1: number; hours: number; ymax: number }
export const px = (p: Plot, i: number) => p.x0 + ((p.x1 - p.x0) * i) / p.hours;
export const py = (p: Plot, mw: number) => p.y1 - ((p.y1 - p.y0) * mw) / p.ymax;

/**
 * The unroll at t (0 = polar petal, 1 = bar), for the first 24 hours shown. Each petal is an outline of 6 outer
 * points (the arc) and 2 inner points (the centre); each point moves on a straight line to its bar corner, keeping
 * its order, so no petal crosses another. The cut is at midnight: 00 lands on the left.
 */
export function drawUnroll(c: CanvasRenderingContext2D, mw: (number | null)[], rose: { cx: number; cy: number; R100: number }, plot: Plot, t: number, first = 0) {
  const bw = (plot.x1 - plot.x0) / plot.hours;
  const tops: [number, number][][] = [];
  c.fillStyle = `rgba(255,255,255,${(0.08 + 0.12 * t).toFixed(3)})`;
  for (let h = 0; h < 24; h++) {
    const v = mw[first + h];
    if (v === null || v === undefined) continue;
    const [a0, a1] = petalAngles(h);
    const r = radius(v, rose.R100);
    const x0 = px(plot, first + h), x1 = x0 + bw * 0.86, top = py(plot, v), bot = plot.y1;
    const L = (a: number, b: number) => a + (b - a) * t;
    c.beginPath();
    const edge: [number, number][] = [];
    for (let i = 0; i <= 5; i++) {
      const a = a0 + ((a1 - a0) * i) / 5;
      const X = L(rose.cx + Math.cos(a) * r, x0 + ((x1 - x0) * i) / 5), Y = L(rose.cy + Math.sin(a) * r, top);
      edge.push([X, Y]);
      if (i === 0) c.moveTo(X, Y); else c.lineTo(X, Y);
    }
    tops.push(edge);
    c.lineTo(L(rose.cx, x1), L(rose.cy, bot));
    c.lineTo(L(rose.cx, x0), L(rose.cy, bot));
    c.closePath();
    c.fill();
  }
  // the lit rim leads the unroll: each petal's tip (it becomes the bar top), never a radial line
  c.save();
  c.strokeStyle = `rgba(255,255,255,${(0.45 + 0.4 * t).toFixed(2)})`; c.lineWidth = 1.5; c.lineCap = "round";
  for (const e of tops) { c.beginPath(); e.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); }
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
  days.forEach((d, i) => c.fillText(d, px(plot, i * per) + 2, plot.y1 + 8));
  c.textBaseline = "bottom";
  c.fillText(`${Math.round(plot.ymax).toLocaleString("en-US")} MW`, plot.x0, plot.y0 - 4);
  c.restore();
}
