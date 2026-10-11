/**
 * Geometry states (VISUAL_DESIGN 3.3) per composition class. The table values are exact at
 * the reference viewports (1440x900, 768x1024, 390x844); other sizes scale uniformly from the
 * class's reference box, centred, so the composition (not a reflow) is preserved. G0 scales by
 * height only, so the peak petal diameter stays >= 1.2 x the frame height (criterion 19).
 */
import { viewportClass, type ViewportClass } from "../graphics/canvas";

export interface RoseState { cx: number; cy: number; R100?: number; rPeak?: number }
export interface Skyline { x0: number; base: number; win: number; pitch: number; gap: number }
export interface Layout {
  cls: ViewportClass; s: number;
  G0: { cx: number; cy: number; rPeak: number };
  G1: { cx: number; cy: number; R100: number };
  /** fit: the largest peak-petal radius the free area holds (R100 shrinks for a bigger day, never grows) */
  G2: { cx: number; cy: number; R100: number; fit: number; sky: Skyline };
  G4: { cx: number; cy: number; R100: number; fit: number };
  /** petal gap half-widths: at G0 and elsewhere (VISUAL_DESIGN section 0) */
  gap0: number; gap: number; glow: number; label: number;
}
const REF: Record<ViewportClass, [number, number]> = { D: [1440, 900], T: [768, 1024], M: [390, 844] };
const TABLE = {
  D: { G0: [720, 400, 620], G1: [1030, 450, 380], G2: [1040, 300, 300, 270], sky: [96, 812, 9, 12, 24], G4: [980, 450, 470, 380], gap0: 0.75, gap: 0.5, glow: 22, label: 13 },
  T: { G0: [384, 430, 620], G1: [384, 700, 330], G2: [384, 440, 220, 190], sky: [52, 940, 5, 7, 12], G4: [384, 450, 360, 220], gap0: 0.75, gap: 0.5, glow: 14, label: 12 },
  M: { G0: [195, 360, 530], G1: [195, 600, 230], G2: [195, 250, 175, 120], sky: [21, 700, 3, 4, 4], G4: [195, 330, 240, 158], gap0: 0.5, gap: 0.375, glow: 10, label: 11 },
} as const;

/** `cls` forces a composition (reduced-motion stills draw the page's class into a smaller box). */
export function layout(vw: number, vh: number, force?: ViewportClass): Layout {
  const cls = force ?? viewportClass(vw);
  const [W, H] = REF[cls];
  const s = Math.min(vw / W, vh / H);
  const ox = (vw - W * s) / 2, oy = (vh - H * s) / 2;
  const t = TABLE[cls];
  const P = (x: number, y: number) => [ox + x * s, oy + y * s] as const;
  const sh = vh / H; // G0 by height
  const [g0x, g0y, g0r] = t.G0;
  const pt = (a: readonly number[]) => { const [x, y] = P(a[0]!, a[1]!); return { cx: x, cy: y, R100: a[2]! * s, fit: (a[3] ?? Infinity) * s }; };
  return {
    cls, s,
    G0: { cx: vw / 2 + (g0x - W / 2) * sh, cy: g0y * sh, rPeak: g0r * sh },
    G1: pt(t.G1),
    G2: { ...pt(t.G2), sky: { x0: ox + t.sky[0] * s, base: oy + t.sky[1] * s, win: t.sky[2] * s, pitch: t.sky[3] * s, gap: t.sky[4] * s } },
    G4: pt(t.G4),
    gap0: t.gap0, gap: t.gap, glow: t.glow, label: t.label,
  };
}
/** Effective R100 for a day: the table value, shrunk only if the day's peak petal would exceed `fit`. */
export const fitR100 = (st: { R100: number; fit: number }, peakMw: number) => Math.min(st.R100, st.fit / Math.sqrt(peakMw / 1e5));

/** Camera move between states: centre linear, R100 in log space (MOTION_SYSTEM 5.3). */
export function camera(a: { cx: number; cy: number; R100: number }, b: { cx: number; cy: number; R100: number }, t: number) {
  return { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, R100: Math.exp(Math.log(a.R100) + (Math.log(b.R100) - Math.log(a.R100)) * t) };
}
