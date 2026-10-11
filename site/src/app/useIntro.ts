import { useCallback, useEffect, useState } from "react";
import { addFrame } from "../motion/loop";
import { Reveal } from "../motion/reveal";
import { motionEnabled } from "../state/motion";
import { INTRO_MS, intro, introBandIndex, introTime } from "../scenes/director";
import { getStore } from "../data/loader";
import { MODEL } from "../data/artifacts";
import { copyS00, fuelName } from "../data/copy";
import { observedStack } from "../model/stack";

const KEY = "peg.intro";
const seen = () => { try { return sessionStorage.getItem(KEY) === "done"; } catch { return false; } };
const markSeen = () => { try { sessionStorage.setItem(KEY, "done"); } catch { /* storage blocked: plays again next load */ } };

/**
 * S00 "The Bloom" clock (MOTION_SYSTEM 5.1). The rose timeline lives in the director; this
 * drives the DOM from the same clock: corner labels (200-500ms), the fuel name stepping with
 * each band, the headline sharpening (3600ms, 80ms stagger, 350ms per word), the nav (4200ms).
 * SKIP, Esc and any wheel / touch / key scroll complete it in 350ms; scroll is never locked.
 * Once per session; reduced motion renders the end state on the first frame.
 */
export function useIntro() {
  const [playing, setPlaying] = useState(() => motionEnabled() && !seen());
  const [navIn, setNavIn] = useState(() => !playing);
  const [run, setRun] = useState(0);

  const complete = useCallback(() => {
    if (!intro.playing || intro.completeFrom >= 0 || intro.frozen >= 0) return;
    const now = performance.now();
    intro.completeFrom = introTime(now);
    intro.completeAt = now;
    setNavIn(true);
  }, []);

  useEffect(() => {
    const h = document.querySelector<HTMLElement>("h1[data-hero]");
    const reveal = h ? new Reveal(h) : null;
    const dayEl = document.querySelector<HTMLElement>("[data-intro-day]");
    const fuelEl = document.querySelector<HTMLElement>("[data-intro-fuel]");
    const corners = document.querySelectorAll<HTMLElement>("[data-intro-corner]");
    const store = getStore(MODEL);
    let keys: string[] = [];
    const bind = () => {
      const s = store.state;
      if (s.status !== "ready") return;
      const day = s.data.bas.CISO.days.find((d) => d.intro);
      if (!day) return;
      if (dayEl) dayEl.textContent = copyS00(day).corner;
      keys = observedStack(day).keys;
    };
    bind();
    const unsub = store.subscribe(bind);
    if (!playing) {
      intro.playing = false;
      reveal?.set(1);
      corners.forEach((c) => (c.style.opacity = ""));
      if (fuelEl) fuelEl.textContent = "";
      return unsub;
    }
    Object.assign(intro, { playing: true, start: 0, completeFrom: -1, completeAt: 0, minR: Infinity, lastR: 0, monotonic: true, firstSilhouette: -1 });
    reveal?.set(0);
    let navShown = false;
    const off = addFrame((now) => {
      const t = introTime(now);
      const c = String(easeIn(t));
      corners.forEach((el) => (el.style.opacity = c));
      if (fuelEl) {
        const k = introBandIndex(t, keys.length);
        fuelEl.textContent = k >= 0 && t < 3300 && keys[k] ? fuelName(keys[k]!) : "";
      }
      reveal?.timed(t - 3600, 350, 80);
      if (!navShown && t >= 4200) { navShown = true; setNavIn(true); }
      if (t >= INTRO_MS && intro.frozen < 0) {
        off();
        intro.playing = false;
        reveal?.set(1);
        if (fuelEl) fuelEl.textContent = "";
        markSeen();
        setPlaying(false);
      }
    }, 20);
    const onKey = (e: KeyboardEvent) => {
      if (["Escape", "ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "End", "Home"].includes(e.key)) complete();
    };
    addEventListener("wheel", complete, { passive: true });
    addEventListener("peg:jump", complete);
    addEventListener("touchmove", complete, { passive: true });
    addEventListener("keydown", onKey);
    return () => {
      off(); unsub();
      removeEventListener("wheel", complete);
      removeEventListener("peg:jump", complete);
      removeEventListener("touchmove", complete);
      removeEventListener("keydown", onKey);
    };
  }, [playing, run, complete]);

  const replay = useCallback(() => {
    scrollTo(0, 0);
    if (!motionEnabled()) return; // the 0ms version is the end state
    setNavIn(false);
    setPlaying(true);
    setRun((r) => r + 1);
  }, []);

  return { playing, navIn, skip: complete, replay };
}
/** corner labels: 200-500ms, 300ms premium-ish fade */
const easeIn = (t: number) => Math.max(0, Math.min(1, (t - 200) / 300));
