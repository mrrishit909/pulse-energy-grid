import { clamp } from "../lib/math";
import { easeSmooth } from "./ease";
import { motionEnabled } from "../state/motion";

/**
 * Word blur reveal (MOTION_SYSTEM 5.2). Works on any element whose words are
 * `.wr-word` spans, so the static LCP headline in index.html and React-rendered
 * headings share one implementation. CSS paints the ghost state (opacity .32,
 * blur 12px) from first paint; this only sharpens.
 */
export const OVERLAP = 3;
/** Ghost opacity: the blur does the ghosting, so unrevealed text still passes AA (about 6:1 on black). */
export const GHOST = 0.55;

/** Scrubbed: word i's eased value at window progress t (0..1) for n words. */
export function scrubWord(t: number, i: number, n: number, w = OVERLAP) {
  return easeSmooth(clamp(t * (n + w) - i, 0, w) / w);
}

/** Timed: word i at `elapsed` ms, per-word 600ms with a 120ms stagger. */
export function timedWord(elapsed: number, i: number, per = 600, stagger = 120) {
  return easeSmooth(clamp((elapsed - i * stagger) / per));
}

export class Reveal {
  private words: HTMLElement[];
  private last: number[];
  constructor(el: HTMLElement, private blur = 12) {
    this.words = [...el.querySelectorAll<HTMLElement>(".wr-word")];
    this.last = this.words.map(() => -1);
  }
  get count() { return this.words.length; }
  private apply(i: number, e: number) {
    const q = Math.round(e * 200) / 200; // skip sub-pixel rewrites
    if (q === this.last[i]) return;
    this.last[i] = q;
    const s = this.words[i]!.style;
    if (q >= 1) {
      s.filter = "none";
      s.opacity = "1";
      s.transform = "none";
      s.willChange = "";
    } else {
      s.filter = q <= 0 ? "" : `blur(${(this.blur * (1 - q)).toFixed(2)}px)`;
      s.opacity = q <= 0 ? "" : (GHOST + (1 - GHOST) * q).toFixed(3);
      s.transform = q <= 0 ? "" : `translateY(${(0.06 * (1 - q)).toFixed(3)}em)`;
      s.willChange = q > 0 ? "filter, opacity" : "";
    }
  }
  scrub(t: number) {
    const n = this.words.length;
    const on = motionEnabled();
    for (let i = 0; i < n; i++) this.apply(i, on ? scrubWord(t, i, n) : 1);
  }
  /** Returns true while still animating. */
  timed(elapsed: number, per?: number, stagger?: number) {
    const on = motionEnabled();
    let busy = false;
    this.words.forEach((_, i) => {
      const e = on ? timedWord(elapsed, i, per, stagger) : 1;
      if (e < 1) busy = true;
      this.apply(i, e);
    });
    return busy;
  }
  set(e: number) { this.words.forEach((_, i) => this.apply(i, e)); }
}
