/**
 * Geometry states (VISUAL_DESIGN 3.3) per composition class. The table values are exact at
 * the reference viewports (1440x900, 768x1024, 390x844); other sizes scale uniformly from the
 * class's reference box, centred, so the composition (not a reflow) is preserved. G0 scales by
 * height only, so the peak petal diameter stays >= 1.2 x the frame height (criterion 19).
 */
import { currentClass, viewportClass, type ViewportClass } from "../graphics/canvas";

export interface RoseState { cx: number; cy: number; R100?: number; rPeak?: number }
export interface Skyline { x0: number; base: number; win: number; pitch: number; gap: number }
export interface Layout {
  cls: ViewportClass; s: number;
  /** D at 1024-1279 wide or up to 820 tall: the deliberate compact composition (QA L2), one query shared with the CSS */
  compact: boolean;
  G0: { cx: number; cy: number; rPeak: number };
  G1: { cx: number; cy: number; R100: number };
  /** fit: the largest peak-petal radius the free area holds (R100 shrinks for a bigger day, never grows) */
  G2: { cx: number; cy: number; R100: number; fit: number; sky: Skyline };
  G4: { cx: number; cy: number; R100: number; fit: number };
  G3: { cx: number; cy: number; R100: number; fit: number };
  /** L: the S04 week plot box */
  week: { x0: number; x1: number; y0: number; y1: number };
  /** petal gap half-widths: at G0 and elsewhere (VISUAL_DESIGN section 0) */
  gap0: number; gap: number; glow: number; label: number;
}
const REF: Record<ViewportClass, [number, number]> = { D: [1440, 900], T: [768, 1024], M: [390, 844] };
const TABLE = {
  D: { G0: [720, 400, 620], G1: [1030, 450, 380], G2: [1040, 300, 300, 270], sky: [96, 812, 9, 12, 24], G4: [980, 450, 470, 380], G3: [980, 450, 520, 380], week: [96, 1344, 312, 586], gap0: 0.75, gap: 0.5, glow: 22, label: 13 },
  T: { G0: [384, 430, 620], G1: [384, 700, 330], G2: [384, 452, 220, 178], sky: [52, 940, 5, 7, 12], G4: [384, 450, 360, 220], G3: [384, 478, 380, 205], week: [48, 720, 420, 700], gap0: 0.75, gap: 0.5, glow: 14, label: 12 },
  M: { G0: [195, 360, 530], G1: [195, 600, 230], G2: [195, 278, 175, 115], sky: [21, 700, 3, 4, 4], G4: [195, 356, 240, 140], G3: [195, 360, 250, 150], week: [16, 374, 368, 582], gap0: 0.5, gap: 0.375, glow: 10, label: 11 },
} as const;

/** The compact desktop composition: a 1024x768 reference, the text column 48-400, the rose right-anchored. */
const COMPACT = { G1: [790, 420, 300], G2: [770, 250, 240, 205], sky: [48, 700, 7, 9, 18], G4: [730, 390, 400, 280], G3: [730, 400, 400, 280], week: [48, 976, 264, 450] } as const;
export const COMPACT_QUERY = "(min-width: 1024px) and (max-width: 1279px), (min-width: 1024px) and (max-height: 820px)";
export const isCompact = () => typeof matchMedia === "function" && matchMedia(COMPACT_QUERY).matches;

/** `cls` forces a composition (reduced-motion stills draw the page's class into a smaller box). */
export function layout(vw: number, vh: number, force?: ViewportClass): Layout {
  const cls = force ?? (typeof matchMedia === "function" ? currentClass() : viewportClass(vw));
  const [W, H] = REF[cls];
  const s = Math.min(vw / W, vh / H);
  const ox = (vw - W * s) / 2, oy = (vh - H * s) / 2;
  const compact = cls === "D" && !force && isCompact();
  if (compact) {
    // right-anchored rose, left text column fixed by the CSS at 48-400; scale from the 1024x768 reference
    const sc = Math.min(vw / 1024, vh / 768), oyc = (vh - 768 * sc) / 2;
    const Pc = (a: readonly number[]) => ({ cx: vw - (1024 - a[0]!) * sc, cy: oyc + a[1]! * sc, R100: a[2]! * sc, fit: (a[3] ?? Infinity) * sc });
    const t = TABLE.D, sh = vh / 900;
    return {
      cls, s: sc, compact,
      G0: { cx: vw / 2, cy: t.G0[1] * sh, rPeak: t.G0[2] * sh },
      G1: Pc(COMPACT.G1),
      G2: { ...Pc(COMPACT.G2), sky: { x0: COMPACT.sky[0], base: oyc + COMPACT.sky[1] * sc, win: COMPACT.sky[2] * sc, pitch: COMPACT.sky[3] * sc, gap: COMPACT.sky[4] * sc } },
      G4: Pc(COMPACT.G4), G3: Pc(COMPACT.G3),
      week: { x0: COMPACT.week[0], x1: vw - (1024 - COMPACT.week[1]) * sc, y0: oyc + COMPACT.week[2] * sc, y1: oyc + COMPACT.week[3] * sc },
      gap0: t.gap0, gap: t.gap, glow: 18, label: 12,
    };
  }
  const t = TABLE[cls];
  const P = (x: number, y: number) => [ox + x * s, oy + y * s] as const;
  const sh = vh / H; // G0 by height
  const [g0x, g0y, g0r] = t.G0;
  const pt = (a: readonly number[]) => { const [x, y] = P(a[0]!, a[1]!); return { cx: x, cy: y, R100: a[2]! * s, fit: (a[3] ?? Infinity) * s }; };
  return {
    cls, s, compact: false,
    G0: { cx: vw / 2 + (g0x - W / 2) * sh, cy: g0y * sh, rPeak: g0r * sh },
    G1: pt(t.G1),
    G2: { ...pt(t.G2), sky: { x0: ox + t.sky[0] * s, base: oy + t.sky[1] * s, win: t.sky[2] * s, pitch: t.sky[3] * s, gap: t.sky[4] * s } },
    G4: pt(t.G4),
    G3: pt(t.G3),
    week: { x0: ox + t.week[0] * s, x1: ox + t.week[1] * s, y0: oy + t.week[2] * s, y1: oy + t.week[3] * s },
    gap0: t.gap0, gap: t.gap, glow: t.glow, label: t.label,
  };
}
/** Effective R100 for a day: the table value, shrunk only if the day's peak petal would exceed `fit`. */
export const fitR100 = (st: { R100: number; fit: number }, peakMw: number) => Math.min(st.R100, st.fit / Math.sqrt(peakMw / 1e5));

/** S03a: the rose fills its free area for the day shown (one real day; the window city keeps the absolute scale). */
export const fillR100 = (st: { fit: number }, peakMw: number) => st.fit / Math.sqrt(peakMw / 1e5);

/** Camera move between states: centre linear, R100 in log space (MOTION_SYSTEM 5.3). */
export function camera(a: { cx: number; cy: number; R100: number }, b: { cx: number; cy: number; R100: number }, t: number) {
  return { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, R100: Math.exp(Math.log(a.R100) + (Math.log(b.R100) - Math.log(a.R100)) * t) };
}

/*
 * QA L11: below the M reference (390x844) the phone compositions flow (CSS grid per scene) and the canvas follows
 * the measured free slot instead of the fixed table. A scene's RoseSlot reports its box in stage pixels here.
 */
export interface Room { x: number; y: number; w: number; h: number }
const rooms = new Map<string, Room>();
let roomsVer = 0;
const roomSubs = new Set<() => void>();
export const roomsVersion = () => roomsVer;
export function subscribeRooms(fn: () => void) { roomSubs.add(fn); return () => void roomSubs.delete(fn); }
export function setRoom(key: string, r: Room | null) {
  const o = rooms.get(key);
  if (r ? o && Math.abs(o.x - r.x) < 0.5 && Math.abs(o.y - r.y) < 0.5 && Math.abs(o.w - r.w) < 0.5 && Math.abs(o.h - r.h) < 0.5 : !o) return;
  if (r) rooms.set(key, r); else rooms.delete(key);
  roomsVer++;
  roomSubs.forEach((f) => f());
}
/** The rose (with its hour labels and ghost ring, ~28px outside the peak petal) centred in a slot; R100 keeps the table's R100/fit ratio. */
function fitIn<T extends { cx: number; cy: number; R100: number; fit: number }>(g: T, r: Room, pad = 28): T {
  const fit = Math.max(40, Math.min(r.w, r.h) / 2 - pad);
  return { ...g, cx: r.x + r.w / 2, cy: r.y + r.h / 2, fit, R100: (g.R100 * fit) / g.fit };
}
/** layout() for one scene: on M with a measured slot, the scene's rose (and S03a skyline, S04 week plot) sit in it. */
export function sceneLayout(id: string, vw: number, vh: number): Layout {
  const L = layout(vw, vh);
  if (L.cls !== "M") return L;
  const rose = rooms.get(`${id}:rose`), sky = rooms.get(`${id}:sky`), week = rooms.get(`${id}:week`);
  if (id === "demand" && rose) return { ...L, G2: { ...fitIn(L.G2, rose), sky: sky ? { ...L.G2.sky, base: sky.y + sky.h } : L.G2.sky } };
  if (id === "netload" && rose) return { ...L, G3: fitIn(L.G3, rose) };
  if ((id === "dispatch" || id === "stress") && rose) return { ...L, G4: fitIn(L.G4, rose) };
  if (id === "forecast" && week) return { ...L, G3: fitIn(L.G3, week), week: { x0: week.x, x1: week.x + week.w, y0: week.y + 18, y1: week.y + week.h - 16 } };
  return L;
}
