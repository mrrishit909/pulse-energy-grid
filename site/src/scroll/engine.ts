import Lenis from "lenis";
import { addFrame } from "../motion/loop";
import { trackProgress } from "../motion/progress";
import { clamp } from "../lib/math";
import { motionEnabled, subscribeMotion } from "../state/motion";

/**
 * Scroll engine (MOTION_SYSTEM 4 + 6). Tracks register their <section>; their
 * geometry is cached and re-measured only on resize. Once per frame (from the
 * single loop) it reads the scroll position, computes each track's normalized
 * progress and notifies subscribers directly: no React render per frame.
 */
type ProgressFn = (p: number) => void;
interface Track {
  id: string;
  el: HTMLElement;
  landing: number;
  top: number;
  height: number;
  p: number;
  subs: Set<ProgressFn>;
  /** last written hand-off opacity (QA D-012) */
  hand?: number;
}

const tracks = new Map<string, Track>();
const activeSubs = new Set<() => void>();
let active: string | null = null;
let vh = typeof innerHeight === "number" ? innerHeight : 0;
let lenis: Lenis | null = null;
let lastY = -1;
let measured = false;

function ordered() {
  return [...tracks.values()].sort((a, b) => a.top - b.top);
}

export function measure() {
  vh = innerHeight;
  lenis?.resize(); // Lenis caches the scroll limit; a stale limit would clamp jumps
  const sy = scrollY;
  for (const t of tracks.values()) {
    if (t.el === document.body) continue; // subscriber stub, track not mounted yet
    const r = t.el.getBoundingClientRect();
    t.top = r.top + sy;
    t.height = r.height;
  }
  measured = true;
  lastY = -1; // force a progress pass
}

function tick() {
  if (!measured) measure();
  const y = scrollY;
  if (y === lastY) return;
  lastY = y;
  const centre = y + vh / 2;
  let nextActive: string | null = null;
  for (const t of tracks.values()) {
    if (t.el === document.body) continue;
    const p = trackProgress(y, t.top, t.height, vh);
    if (p !== t.p) {
      t.p = p;
      t.subs.forEach((fn) => fn(p));
    }
    if (centre >= t.top && centre < t.top + t.height) nextActive = t.id;
    // QA D-012: while a pinned stage slides in or out (not yet / no longer stuck), its text panels fade, so a
    // caption backing never drags across the fixed rose; the canvas is not inside the stage and is unaffected
    if (t.height > vh + 1) {
      const d = y < t.top ? t.top - y : Math.max(0, y - (t.top + t.height - vh));
      const hand = Math.round(clamp(1 - d / (0.22 * vh)) * 100) / 100;
      if (hand !== t.hand) { t.hand = hand; t.el.style.setProperty("--hand", String(hand)); }
    }
  }
  if (nextActive !== active) {
    active = nextActive;
    activeSubs.forEach((fn) => fn());
    if (active && location.hash !== `#${active}`) history.replaceState(history.state, "", `#${active}`);
  }
}

export function registerTrack(id: string, el: HTMLElement, landing = 0) {
  tracks.set(id, { id, el, landing, top: 0, height: 0, p: -1, subs: tracks.get(id)?.subs ?? new Set() });
  measured = false;
  return () => {
    if (tracks.get(id)?.el === el) tracks.delete(id);
    measured = false;
  };
}

/** Subscribe to a track's progress; called immediately with the current value. */
export function onProgress(id: string, fn: ProgressFn) {
  let t = tracks.get(id);
  if (!t) {
    // Track not mounted yet: park the subscriber on a stub that registerTrack adopts.
    t = { id, el: document.body, landing: 0, top: 0, height: 0, p: -1, subs: new Set() };
    tracks.set(id, t);
  }
  const subs = t.subs;
  subs.add(fn);
  if (t.p >= 0) fn(t.p);
  return () => void subs.delete(fn);
}

export const getProgress = (id: string) => Math.max(0, tracks.get(id)?.p ?? 0);

/**
 * Which of `ids` (in page order) owns the viewport: the last whose top is at or
 * above scrollY. Between a pinned stage's end and the next track's top the
 * outgoing scene holds p = 1, so consecutive scenes must agree at that seam.
 */
export function locate(ids: readonly string[]): { id: string; p: number; after: number } | null {
  let found: Track | null = null;
  for (const id of ids) {
    const t = tracks.get(id);
    if (!t || t.el === document.body) continue;
    if (t.top <= scrollY + 0.5) found = t;
  }
  if (!found) {
    const first = tracks.get(ids[0]!);
    return first ? { id: first.id, p: 0, after: 0 } : null;
  }
  // `after`: px scrolled beyond the pinned range (stage leaving the viewport)
  return { id: found.id, p: Math.max(0, found.p), after: Math.max(0, scrollY - (found.top + found.height - vh)) };
}
export const viewportH = () => vh;

/** OBS EXPLORE: lock page scroll (Lenis + overflow) and restore the exact scrollY on exit. */
let lockedY = -1;
export function lockScroll(on: boolean) {
  if (on && lockedY < 0) {
    lockedY = scrollY;
    lenis?.stop();
    document.documentElement.style.overflow = "hidden";
  } else if (!on && lockedY >= 0) {
    document.documentElement.style.overflow = "";
    lenis?.start();
    setScroll(lockedY);
    lockedY = -1;
  }
}
export const getActive = () => active;
export function subscribeActive(fn: () => void) {
  activeSubs.add(fn);
  return () => void activeSubs.delete(fn);
}

function setScroll(y: number) {
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
  else window.scrollTo(0, y);
}

/**
 * Direct chapter jump (6.2): instant, the stage content fades in, stepped
 * states resolve against the new progress (subscribers receive it this frame),
 * the hash updates (pushState for user jumps, so Back works) and focus moves to
 * the scene heading.
 */
export function jumpTo(id: string, p?: number, opts: { push?: boolean; focus?: boolean } = {}) {
  measure();
  const t = tracks.get(id);
  if (!t) return;
  const prog = p ?? t.landing;
  const y = Math.round(t.top + prog * Math.max(0, t.height - vh));
  // push before tick(): tick's scroll-driven replaceState must not overwrite the previous entry
  if (opts.push) history.pushState({ scene: id }, "", `#${id}`);
  window.dispatchEvent(new CustomEvent("peg:jump", { detail: { id, p: prog } }));
  setScroll(y);
  tick();
  const stage = t.el.querySelector<HTMLElement>("[data-stage-content]");
  if (stage && motionEnabled()) {
    stage.classList.remove("stage-enter");
    void stage.offsetWidth; // restart the CSS animation
    stage.classList.add("stage-enter");
  }
  if (opts.focus) t.el.querySelector<HTMLElement>("[data-scene-heading]")?.focus({ preventScroll: true });
}

function setupLenis() {
  lenis?.destroy();
  lenis = motionEnabled() ? new Lenis({ autoRaf: false, lerp: 0.1, syncTouch: false }) : null;
  measured = false;
}

/** Unclamped offset ratio into the active track, so restoring never yanks the visitor. */
function rawProgress(id: string) {
  const t = tracks.get(id);
  return t ? (scrollY - t.top) / Math.max(1, t.height - vh) : 0;
}
/** Silent restore (no fade, no focus, no history): resize and layout changes only. */
function restore(id: string, raw: number) {
  const t = tracks.get(id);
  if (!t) return;
  setScroll(Math.round(t.top + raw * Math.max(1, t.height - vh)));
  tick();
}

let resizeTimer = 0;
let lastW = typeof innerWidth === "number" ? innerWidth : 0;
let pending: { id: string; raw: number } | null = null;
function onResize() {
  // 6.3: record scene + p before anything moves, then re-measure and restore; nothing animates.
  if (!pending && active) pending = { id: active, raw: rawProgress(active) };
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const widthChanged = innerWidth !== lastW;
    lastW = innerWidth;
    const rec = pending;
    pending = null;
    measure();
    // Height-only changes (mobile URL bar, content growth) just re-measure.
    if (!widthChanged || !rec) return;
    window.dispatchEvent(new Event("peg:snap"));
    restore(rec.id, rec.raw);
  }, 150);
}

let started = false;
/** Start the engine once. Lenis runs first in the loop, then progress. */
export function startEngine() {
  if (started) return;
  started = true;
  history.scrollRestoration = "manual";
  setupLenis();
  subscribeMotion(() => {
    const id = active;
    const p = id ? getProgress(id) : 0;
    setupLenis();
    // Tracks collapse/expand: restore the same scene at the same progress, silently.
    measure();
    if (id) restore(id, p);
  });
  addFrame((now) => lenis?.raf(now), 0);
  addFrame(tick, 10);
  let first = true; // ResizeObserver always fires once on observe(): not a resize
  new ResizeObserver(() => (first ? (first = false) : onResize())).observe(document.documentElement);
  addEventListener("resize", onResize);
  addEventListener("popstate", () => {
    const id = location.hash.slice(1);
    if (tracks.has(id)) jumpTo(id, undefined, { focus: true });
  });
}

// the deep link as loaded: the scroll-driven replaceState may rewrite the hash before the app mounts
const initialHash = typeof location === "undefined" ? "" : location.hash;
/** After first mount: honour a deep link (#dispatch). */
export function resolveInitialHash() {
  const id = initialHash.slice(1);
  if (id && tracks.has(id)) jumpTo(id, undefined, { focus: true });
}

export const trackIds = () => ordered().map((t) => t.id);
