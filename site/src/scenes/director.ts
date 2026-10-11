import { canvasMarks } from "../graphics/week";
/**
 * Rose director: ONE fixed Canvas2D carries the Day Rose through the scenes
 * (S00/S01 G0 -> G1, S03a G2 + window city, S05 G4). Each frame it locates the
 * active scene, builds that scene's petals from data + progress + tweens, and
 * redraws only when something changed (dirty signature). Stepped parts (intro
 * clock, hour lift, GRID/DAY re-fill, rim beat, re-solve pulse) live here;
 * scrubbed parts are pure functions of progress.
 */
import { addFrame } from "../motion/loop";
import { Tween } from "../motion/tween";
import { DUR, easePremium, easeSmooth, easeSymmetric, linear } from "../motion/ease";
import { windowed } from "../motion/progress";
import { clamp } from "../lib/math";
import { getProgress, locate } from "../scroll/engine";
import { motionEnabled } from "../state/motion";
import { getStore } from "../data/loader";
import { DEMAND, FUEL_MIX, MODEL } from "../data/artifacts";
import { biteStack, bitePeak } from "../model/bite";
import { city, fill } from "../state/scenes";
import { inspector } from "../state/inspector";
import { drawEdgeGlow, drawHourLabels, drawPriceRose, drawRose, radius, resetRoseCache, type Ctx, type PetalIn, type RoseLog, type RoseView } from "../graphics/rose";
import { observedStack, petals, simulatedStack, tweenPetals, firstChanged, type DayStack } from "../model/stack";
import { dayPeak, scenarioDemand, fullParams } from "../model/lp";
import { litCount, windows, type Win } from "../model/city";
import { camera, fillR100, fitR100, layout, roomsVersion, sceneLayout, type Layout } from "./geometry";
import { SCENES } from "../app/scenes";
import type { BAModel, Day, DispatchModel } from "../model/types";

export const INTRO_MS = 4600;
const SCENE_IDS = SCENES.map((s) => s.id);

// ------------------------------------------------------------------ quality tiers (MOTION_SYSTEM 9.2)
export type Tier = "high" | "low";
const forced = (() => {
  const m = /[?&]quality=(low|high)/.exec(typeof location === "undefined" ? "" : location.search);
  return m ? (m[1] as Tier) : null;
})();
export const quality = { tier: (forced ?? "high") as Tier, forced: !!forced, median: 0, samples: [] as number[] };

// ------------------------------------------------------------------ S00 intro clock
export const intro = { playing: false, start: 0, completeFrom: -1, completeAt: 0, frozen: -1, minR: Infinity, lastR: 0, monotonic: true, firstSilhouette: -1 };
/** Intro clock in ms (0..4600). SKIP / Esc / scroll compress the remainder into 350ms. */
export function introTime(now: number) {
  if (intro.frozen >= 0) return intro.frozen;
  if (!intro.playing) return INTRO_MS;
  if (!intro.start) intro.start = now;
  const t = now - intro.start;
  if (intro.completeFrom < 0) return Math.min(INTRO_MS, t);
  const k = easePremium(clamp((now - intro.completeAt) / DUR.standard));
  return intro.completeFrom + (INTRO_MS - intro.completeFrom) * k;
}
const FILL0 = 900, FILL_MS = 2400;
/** Band k's fill at intro time t (n bands share 900-3300ms; empty bands were skipped). */
export function introBand(t: number, k: number, n: number, compressed: boolean) {
  if (compressed && intro.completeFrom >= 0) {
    // completion: every remaining band snaps together in r^2 over the 350ms
    const from = clamp((intro.completeFrom - FILL0 - (k * FILL_MS) / n) / (FILL_MS / n));
    const k2 = clamp((t - intro.completeFrom) / Math.max(1, INTRO_MS - intro.completeFrom));
    return from + (1 - from) * k2;
  }
  return easeSmooth(clamp((t - FILL0 - (k * FILL_MS) / n) / (FILL_MS / n)));
}
/** Index of the band filling at t (for the corner label), -1 before the fill. */
export const introBandIndex = (t: number, n: number) => (t < FILL0 ? -1 : Math.min(n - 1, Math.floor(((t - FILL0) / FILL_MS) * n)));

// ------------------------------------------------------------------ debug (test + evidence hooks)
export const debug = {
  frames: 0, scene: "", log: null as RoseLog | null, fillK: -1, bandCounts: [] as number[], lit: 0, hour: -1,
  pulse: 0, view: null as null | { cx: number; cy: number; R100: number },
  /** CSS-px boxes of the canvas hour labels (overlap tests against DOM text) */
  labels: [] as { h: number; x: number; y: number; w: number; hgt: number }[],
};

// ------------------------------------------------------------------ state
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let L: Layout | null = null;
let W = 0, H = 0, DPR = 1;
let lastSig = "";
const stackCache = new Map<string, DayStack>();
function obsStack(day: Day, skipEmpty: boolean) {
  const k = `${day.date}|${skipEmpty}`;
  let s = stackCache.get(k);
  if (!s) { s = observedStack(day, skipEmpty); stackCache.set(k, s); }
  return s;
}

// S03a stepped state
const liftTw = new Tween(1, DUR.fast, easeSmooth);
const litTw = new Tween(0, DUR.fast, linear);
let cityHour = -1, cityKey = "", lastHourAt = 0;
let cityFrom: PetalIn[] | null = null, cityTo: PetalIn[] | null = null, cityRFrom = 0, cityRTo = 0;
const cityMix = new Tween(1, DUR.panel, easeSmooth);
let winCache: { key: string; list: Win[] } | null = null;

// S05 stepped state
let fillSeq = -1, pulseAt = -1, pulseK0 = 0, pulseFrom: PetalIn[] | null = null, shown: PetalIn[] | null = null, fillKeyLast = "";
let beatStep = 0, beatAt = -1;

// bloom (S00 only): rendered once per settled state at quarter resolution
let bloom: { key: string; c: HTMLCanvasElement } | null = null;

function resize() {
  if (!canvas) return;
  W = document.documentElement.clientWidth; H = innerHeight;
  const cap = quality.tier === "low" ? 1 : W < 1024 ? 1.5 : 2;
  DPR = Math.min(devicePixelRatio || 1, cap);
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  ctx = canvas.getContext("2d");
  L = layout(W, H);
  resetRoseCache();
  bloom = null; winCache = null;
  lastSig = "";
}

const model = () => { const s = getStore(MODEL).state; return s.status === "ready" ? s.data : null; };

// ------------------------------------------------------------------ per-scene frames
export interface Frame {
  /** null: no rose this frame (e.g. the S04 week plot after the unroll) */
  petals: PetalIn[] | null; view: RoseView; labels: number; bloom: number; glow: { color: string; a: number; reach?: number } | null;
  sky: { list: Win[]; lit: number; win: number; base: number; x1: number; drop?: number } | null; sig: string;
  /** canvas CSS opacity (S02 backdrop 25%, S07 15%) */
  opacity?: number;
  /** a second real state crossfaded over the first (month changes, 200ms; never a per-petal interpolation) */
  mixB?: { petals: PetalIn[]; view: RoseView; mix: number };
  /** PRICE layer: one Spectral bin per petal instead of the class stack (S06, CTRL) */
  price?: (number | null)[];
  /** the petals' own prices (light inside a bin) */
  prices?: number[];
  /** scene-specific marks drawn after the rose (CSS px) */
  extra?: (c: CanvasRenderingContext2D) => void;
}
export interface FrameEnv { now: number; p: number; L: Layout; W: number; H: number; model: DispatchModel }
/** Stage B scenes register their frame builders here (scenes/frames-*.ts). */
const registry = new Map<string, (env: FrameEnv) => Frame | null>();
export const registerFrame = (id: string, fn: (env: FrameEnv) => Frame | null) => void registry.set(id, fn);
export const baseView = (keys: string[], v: Partial<RoseView>): RoseView => ({
  cx: 0, cy: 0, R100: 100, rref: 100, gap: 0.5, ghost: 0, bands: 1, marks: 1, beat: 0, lift: null, liftT: 0, glow: L?.glow ?? 22, keys, ...v,
});

function pulseFrame(now: number, m: BAModel, p: number): Frame | null {
  const day = m.days.find((d) => d.intro);
  if (!day || !L) return null;
  const s = obsStack(day, true);
  const n = s.keys.length;
  const playing = intro.playing || intro.frozen >= 0;
  const t = playing ? introTime(now) : INTRO_MS;
  const compressed = intro.completeFrom >= 0 && intro.frozen < 0;
  const fillK = (k: number) => (playing ? introBand(t, k, n, compressed) : 1);
  const ps = petals(s, fillK);
  const peak = Math.max(...day.demand_mw);
  const R0 = L.G0.rPeak / Math.sqrt(peak / 1e5);
  const e = easeSymmetric(windowed(p, 0, 0.4));
  const cam = camera({ cx: L.G0.cx, cy: L.G0.cy, R100: R0 }, L.G1, e);
  const ghost = 0.06 * (playing ? easePremium(clamp((t - 400) / 500)) : 1);
  const beat = playing && !compressed && t >= 3300 && t < 3800 ? (t < 3550 ? easeSmooth((t - 3300) / 250) : 1 - easeSmooth((t - 3550) / 250)) : 0;
  const view = baseView(s.keys, { ...cam, rref: radius(peak, cam.R100), gap: L.gap0 + (L.gap - L.gap0) * e, ghost, marks: fillK(n - 1), beat });
  debug.fillK = playing ? introBandIndex(t, n) : n - 1;
  // giant-geometry rule: from the first silhouette frame (400ms) the peak petal is >= G0 and never shrinks during S00
  if (playing && t >= 400 && e === 0) {
    const r = radius(peak, cam.R100);
    if (intro.firstSilhouette < 0) intro.firstSilhouette = t;
    intro.minR = Math.min(intro.minR, r);
    if (r < intro.lastR - 1e-6) intro.monotonic = false;
    intro.lastR = r;
  }
  const bl = (playing ? 0.35 * easeSmooth(clamp((t - 3300) / 400)) : 0.35) * (1 - clamp(e * 4));
  return { petals: ps, view, labels: windowed(p, 0.2, 0.4), bloom: bl, glow: null, sky: null, sig: `pulse|${t.toFixed(0)}|${p.toFixed(4)}` };
}

function demandFrame(now: number, m: BAModel): Frame | null {
  const c = city.get();
  const day = m.days.find((d) => d.id === c.dayId) ?? m.days[0];
  if (!day || !L) return null;
  const s = obsStack(day, false);
  const target = petals(s, () => 1);
  const key = `${c.ba}|${day.id}`;
  const motion = motionEnabled() && quality.tier === "high";
  const peak = Math.max(...day.demand_mw);
  if (key !== cityKey) {
    // GRID / DAY: every petal re-fills as a keyed area transition (600ms); first entry snaps.
    // The per-day scale moves on the same clock, in log space, so no frame draws the old day at the new scale.
    cityRFrom = cityKey ? cityRTo : fillR100(L.G2, peak);
    cityRTo = fillR100(L.G2, peak);
    cityFrom = cityKey && cityTo ? cityTo : target;
    cityTo = target;
    cityKey = key;
    cityMix.value = 0; cityMix.retarget(1, now, motion ? DUR.panel : 0);
  }
  cityMix.update(now);
  const ps = cityFrom && cityMix.value < 1 ? tweenPetals(cityFrom, target, () => cityMix.value, cityMix.value) : target;
  const hour = clamp(c.hour, 0, 23);
  if (hour !== cityHour) {
    // rapid scrub (> 6 hours/s): hard steps, no sweep (MOTION_SYSTEM 5.5)
    const rate = cityHour < 0 ? 0 : Math.abs(hour - cityHour) / Math.max(1, now - lastHourAt) * 1000;
    const ms = motion && rate <= 6 ? DUR.fast : 0;
    lastHourAt = now; cityHour = hour;
    liftTw.value = 0; liftTw.retarget(1, now, ms);
    litTw.retarget(litCount(day.demand_mw[hour]!), now, ms);
  } else if (litTw.target !== litCount(day.demand_mw[hour]!)) litTw.retarget(litCount(day.demand_mw[hour]!), now, motion ? DUR.fast : 0);
  liftTw.update(now); litTw.update(now);
  cityRTo = fillR100(L.G2, peak); // resize keeps the target current
  const R2 = Math.exp(Math.log(cityRFrom || cityRTo) + (Math.log(cityRTo) - Math.log(cityRFrom || cityRTo)) * cityMix.value);
  const view = baseView(s.keys, { cx: L.G2.cx, cy: L.G2.cy, R100: R2, rref: radius(peak, R2), gap: L.gap, lift: hour, liftT: liftTw.value });
  const sky = L.G2.sky;
  const wkey = `${W}x${H}|${sky.x0}|${sky.base}`;
  if (!winCache || winCache.key !== wkey) winCache = { key: wkey, list: windows(sky) };
  debug.lit = Math.round(litTw.value); debug.hour = hour;
  // exit (p 0.94-1): the skyline sinks, the rose moves G2 -> G3 and becomes S03b's first state (January's mean day)
  const p = getProgress("demand");
  const x = motionEnabled() ? easeSymmetric(windowed(p, 0.94, 1)) : 0;
  const fm = getStore(FUEL_MIX).state, dp = getStore(DEMAND).state;
  let outPs = ps, outView = view;
  if (x > 0 && fm.status === "ready" && dp.status === "ready" && L) {
    const b = petals(biteStack(fm.data, dp.data, c.ba, 1, null, 0), () => 1);
    outPs = tweenPetals(ps, b, () => x, x);
    const cam = camera({ cx: view.cx, cy: view.cy, R100: view.R100 }, { cx: sceneLayout("netload", W, H).G3.cx, cy: sceneLayout("netload", W, H).G3.cy, R100: fitR100(sceneLayout("netload", W, H).G3, bitePeak(dp.data, c.ba)) }, x);
    outView = { ...view, ...cam, rref: radius(Math.max(...b.map((q) => q.demand)), cam.R100), lift: x > 0.5 ? null : view.lift };
  }
  return {
    petals: outPs, view: outView, labels: 1, bloom: 0, glow: null,
    sky: { list: winCache.list, lit: litTw.value, win: sky.win, base: sky.base, x1: Math.max(...winCache.list.map((w) => w.x)) + sky.pitch, drop: x * 320 },
    sig: `demand|${key}|${hour}|${liftTw.value.toFixed(3)}|${litTw.value.toFixed(2)}|${cityMix.value.toFixed(3)}|${x.toFixed(4)}`,
  };
}

function dispatchFrame(now: number, m: BAModel, p: number): Frame | null {
  const f = fill.get();
  const day = m.days.find((d) => d.id === f.dayId);
  if (!day || !L) return null;
  const params = f.params ?? fullParams(m);
  const D = scenarioDemand(m, day, params);
  const peak = Math.max(...D);
  const motion = motionEnabled();
  let ps: PetalIn[];
  let keys = m.display_order;
  let fk = -1;
  let glowA = 0;
  if (!f.result) {
    ps = D.map((d, h) => ({ hour: h, bands: keys.map(() => [0, 0] as [number, number]), demand: d, served: d, charge: 0, exports: 0, residual: 0, unserved: 0, curtailed: 0 }));
  } else {
    const s = simulatedStack(m.display_order, day, D, f.result);
    keys = s.keys;
    const n = keys.length, w = 0.52 / n;
    const fillOf = (k: number) => (motion ? easeSymmetric(windowed(p, 0.08 + k * w, 0.08 + (k + 1) * w)) : 1);
    fk = motion ? Math.min(n - 1, Math.floor((p - 0.08) / w)) : n - 1;
    const full = petals(s, () => 1);
    const fkey = `${f.ba}|${f.dayId}`;
    if (f.resultSeq !== fillSeq) {
      // re-solve pulse (5.8): from the band that changed, outward, 40ms per band; retargets from what is on screen
      const same = fkey === fillKeyLast && shown !== null;
      pulseFrom = same && motion && quality.tier === "high" ? shown : null;
      pulseK0 = pulseFrom ? firstChanged(pulseFrom, full) : 0;
      pulseAt = pulseFrom ? now : -1;
      fillSeq = f.resultSeq; fillKeyLast = fkey;
    }
    if (p < 0.6 || !pulseFrom || pulseAt < 0) {
      ps = p < 0.6 ? petals(s, fillOf) : full;
      if (p >= 0.6) shown = full;
    } else {
      const el = now - pulseAt;
      const e = (k: number) => (k < pulseK0 ? 1 : easeSmooth(clamp((el - (k - pulseK0) * 40) / DUR.panel)));
      const total = DUR.panel + (n - pulseK0) * 40;
      ps = tweenPetals(pulseFrom, full, e, easeSmooth(clamp(el / DUR.panel)));
      glowA = el < total ? 0.6 * Math.sin(Math.PI * clamp(el / total)) : 0;
      shown = el < total ? ps : full;
      if (el >= total) { pulseFrom = null; pulseAt = -1; }
    }
  }
  // the rim beat: stepped once per down-crossing of p 0.6
  const step = p > 0.62 ? 1 : p < 0.58 ? 0 : beatStep;
  if (step === 1 && beatStep === 0 && motion) beatAt = now;
  beatStep = step;
  const bel = beatAt < 0 ? 1e9 : now - beatAt;
  const beat = bel < DUR.panel ? (bel < 300 ? easeSmooth(bel / 300) : 1 - easeSmooth((bel - 300) / 300)) : 0;
  const silhouette = !f.result || p < 0.08;
  const ins = inspector.get();
  const view = baseView(keys, {
    lift: ins.scene === "dispatch" ? ins.hour : null, liftT: 1,
    cx: L.G4.cx, cy: L.G4.cy, R100: fitR100(L.G4, dayPeak(m, day)), rref: radius(peak, fitR100(L.G4, dayPeak(m, day))), gap: L.gap,
    ghost: 0.08, marks: f.result ? (motion ? windowed(p, 0.55, 0.6) : 1) : 0, beat,
  });
  debug.fillK = fk; debug.pulse = glowA;
  return {
    petals: ps, view, labels: silhouette ? 0 : 0.7, bloom: 0, glow: glowA > 0 ? { color: "#FF4C25", a: glowA } : null, sky: null,
    sig: `dispatch|${ins.scene}${ins.hour}|${f.ba}|${f.dayId}|${f.resultSeq}|${p.toFixed(4)}|${beat.toFixed(3)}|${glowA.toFixed(3)}|${pulseAt}`,
  };
}

// ------------------------------------------------------------------ drawing
function drawSky(c: CanvasRenderingContext2D, s: NonNullable<Frame["sky"]>) {
  const on = Math.floor(s.lit);
  c.save();
  c.translate(0, s.drop ?? 0);
  for (const w of s.list) {
    c.fillStyle = w.rank < on ? "#FFF3A6" : "#1A1A1A";
    c.fillRect(w.x, w.y, s.win, s.win);
  }
  c.fillStyle = "rgba(255,255,255,0.24)";
  c.fillRect(s.list[0]!.x, s.base + 2, s.x1 - s.list[0]!.x, 1);
  // one box per window column (from its top window to the base line), so text above a low building is not flagged
  const cols = new Map<number, number>();
  for (const w of s.list) cols.set(w.x, Math.min(cols.get(w.x) ?? Infinity, w.y));
  for (const [x, y] of cols) canvasMarks.push({ name: "skyline", x, y: y + (s.drop ?? 0), w: s.win, h: s.base + 3 - y });
  c.restore();
}

const layers: HTMLCanvasElement[] = [];
/** Offscreen layer i at the canvas's device size, cleared, with the CSS-px transform set. */
function layer(i: number) {
  const c = (layers[i] ??= document.createElement("canvas"));
  if (c.width !== canvas!.width || c.height !== canvas!.height) { c.width = canvas!.width; c.height = canvas!.height; }
  const g = c.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(DPR, 0, 0, DPR, 0, 0);
  return c;
}

function renderBloom(f: Frame, key: string) {
  if (bloom?.key === key) return bloom.c;
  const q = 4;
  const small = document.createElement("canvas");
  small.width = Math.ceil(W / q); small.height = Math.ceil(H / q);
  const sc = small.getContext("2d")!;
  sc.scale(1 / q, 1 / q);
  drawRose(sc as unknown as Ctx, f.petals!, { ...f.view, ghost: 0, marks: 0, beat: 0 });
  const blur = document.createElement("canvas");
  blur.width = small.width; blur.height = small.height;
  const bc = blur.getContext("2d")!;
  bc.filter = `blur(${36 / q}px)`;
  bc.drawImage(small, 0, 0);
  bloom = { key, c: blur };
  return blur;
}

/**
 * QA L11: on a phone each scene's rose sits in its own measured slot, so neighbouring scenes no longer share one
 * geometry. Over the first 8% of a scene; S04 needs none, it opens on the S03b rose itself the camera eases from the previous scene's slot to its own, keeping the seam.
 */
const HANDOFF: Record<string, [string, "G2" | "G3" | "G4", number]> = { demand: ["source", "G2", 0.08], stress: ["dispatch", "G4", 0.08], evidence: ["stress", "G4", 0.08] };
function handoff(id: string, f: Frame): Frame {
  const h = HANDOFF[id];
  const p = getProgress(id);
  if (!h || !L || L.cls !== "M" || p >= h[2]) return f;
  const from = sceneLayout(h[0], W, H)[h[1]], to = L[h[1]];
  const e = 1 - easeSymmetric(Math.max(0, p) / h[2]);
  if (e <= 0 || (Math.abs(from.cx - to.cx) < 0.5 && Math.abs(from.cy - to.cy) < 0.5 && Math.abs(from.fit - to.fit) < 0.5)) return f;
  const k = 1 + (from.fit / to.fit - 1) * e;
  const move = (v: RoseView): RoseView => ({ ...v, cx: to.cx + (v.cx - to.cx) * k + (from.cx - to.cx) * e, cy: to.cy + (v.cy - to.cy) * k + (from.cy - to.cy) * e, R100: v.R100 * k, rref: v.rref * k });
  return { ...f, view: move(f.view), mixB: f.mixB ? { ...f.mixB, view: move(f.mixB.view) } : undefined, sig: `${f.sig}|h${e.toFixed(3)}` };
}

function draw(now: number) {
  if (!canvas || !ctx || !L) return;
  if (!motionEnabled()) { canvasMarks.length = 0; if (lastSig !== "off") { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); lastSig = "off"; } return; }
  const m = model();
  const loc = locate(SCENE_IDS);
  const id = loc?.id ?? "pulse";
  debug.scene = id;
  L = sceneLayout(id, W, H); // QA L11: the scene's measured phone slot, if any
  const ba = id === "demand" ? city.get().ba : id === "dispatch" ? fill.get().ba : "CISO";
  const bm = m?.bas[ba] ?? null;
  let f: Frame | null = null;
  if (bm && m) {
    if (id === "pulse") f = pulseFrame(now, m.bas.CISO, getProgress("pulse"));
    else if (id === "demand") f = demandFrame(now, bm);
    else if (id === "dispatch") f = dispatchFrame(now, bm, getProgress("dispatch"));
    else if (registry.has(id)) f = registry.get(id)!({ now, p: getProgress(id), L, W, H, model: m });
  }
  if (f) f = handoff(id, f);
  const opacity = f?.opacity ?? 1;
  if (canvas.style.opacity !== String(opacity)) canvas.style.opacity = String(opacity);
  const sig = `${W}x${H}|${roomsVersion()}|${f ? f.sig : `none|${id}`}`;
  if (sig === lastSig) return;
  lastSig = sig;
  debug.frames++;
  canvasMarks.length = 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!f) { debug.log = null; debug.labels = []; debug.view = null; return; }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (f.sky) drawSky(ctx, f.sky);
  debug.view = { cx: f.view.cx, cy: f.view.cy, R100: f.view.R100 };
  debug.labels = [];
  if (f.petals) {
    const draw1 = (c: CanvasRenderingContext2D, ps: PetalIn[], v: RoseView) =>
      f!.price ? drawPriceRose(c as unknown as Ctx, ps, v, f!.price, f!.prices) : drawRose(c as unknown as Ctx, ps, v);
    let log: RoseLog;
    if (f.mixB && f.mixB.mix > 0 && f.mixB.mix < 1) {
      // crossfade two real states through offscreen layers
      const a = layer(0), b = layer(1);
      draw1(a.getContext("2d")!, f.petals, f.view);
      log = draw1(b.getContext("2d")!, f.mixB.petals, f.mixB.view);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1 - f.mixB.mix; ctx.drawImage(a, 0, 0);
      ctx.globalAlpha = f.mixB.mix; ctx.drawImage(b, 0, 0);
      ctx.restore();
    } else log = draw1(ctx, f.mixB && f.mixB.mix >= 1 ? f.mixB.petals : f.petals, f.mixB && f.mixB.mix >= 1 ? f.mixB.view : f.view);
    debug.log = log;
    // radial-only hook: per petal, the outermost band index with any area (must never exceed the band being filled)
    debug.bandCounts = log.petals.map((p) => p.bands.reduce((a, b, k) => (b.r1 > b.r0 ? k : a), -1));
    if (f.glow) drawEdgeGlow(ctx as unknown as Ctx, f.petals, f.view, f.glow.color, f.glow.a, f.glow.reach);
    debug.labels = f.labels > 0 ? drawHourLabels(ctx as unknown as Ctx, f.petals, f.view, L.label, f.labels * 0.7) : [];
    for (const b of debug.labels) canvasMarks.push({ name: `hour ${b.h}`, x: b.x, y: b.y, w: b.w, h: b.hgt });
  } else debug.log = null;
  if (f.extra) { ctx.save(); f.extra(ctx); ctx.restore(); }
  if (!f.petals) return;
  if (f.bloom > 0.001 && f.view.marks >= 1) {
    const b = renderBloom(f, `${W}x${H}|${f.view.R100.toFixed(2)}|${f.view.cx.toFixed(1)}`);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = f.bloom;
    ctx.drawImage(b, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ tier sampling: median frame time over 60 consecutive ticks after the intro
let lastTick = 0;
function sample(now: number) {
  if (quality.forced || intro.playing || quality.samples.length >= 60) { lastTick = now; return; }
  if (lastTick && document.visibilityState === "visible") quality.samples.push(now - lastTick);
  lastTick = now;
  if (quality.samples.length === 60) {
    const s = [...quality.samples].sort((a, b) => a - b);
    quality.median = s[30]!;
    const limit = W < 768 ? 40 : 22;
    if (quality.median > limit) { quality.tier = "low"; resize(); }
    document.documentElement.dataset.tier = quality.tier;
  }
}

export function startDirector(el: HTMLCanvasElement) {
  canvas = el;
  document.documentElement.dataset.tier = quality.tier;
  resize();
  addEventListener("resize", resize);
  addEventListener("peg:snap", resize);
  addFrame((now) => { sample(now); draw(now); }, 50);
  (window as unknown as { __pulseQuality: typeof quality }).__pulseQuality = quality;
}
