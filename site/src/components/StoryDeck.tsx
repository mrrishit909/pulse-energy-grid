import { useLayoutEffect, useRef, useState } from "react";
import { StoryCard, type StoryCardProps } from "./StoryCard";
import { useProgress } from "../scroll/hooks";
import { getProgress, jumpTo } from "../scroll/engine";
import { clamp } from "../lib/math";
import { easeSymmetric } from "../motion/ease";
import { windowed } from "../motion/progress";
import { viewportClass } from "../graphics/canvas";
import { motionEnabled } from "../state/motion";

export type DeckCard = Omit<StoryCardProps, "index" | "count" | "active" | "onSelect" | "visual"> & {
  /** Visual zone; a function receives whether its card is the active one (stepped 800ms entrance). */
  visual?: StoryCardProps["visual"] | ((active: boolean) => StoryCardProps["visual"]);
};

const SIZE = { D: [360, 620], T: [320, 600], M: [300, 560] } as const;
const DECK_A = 0.12, DECK_B = 0.88, PLATEAU = 0.6;

/**
 * Deck position k (fractional card index) from track progress (MOTION_SYSTEM 5.4):
 * each card's band holds still for its first 60% (plateau) and eases to the
 * next card over the last 40%. Also returns the plateau fill of the current card.
 */
export function deckK(p: number, n: number) {
  const u = clamp((p - DECK_A) / (DECK_B - DECK_A)) * n;
  const i = Math.min(n - 1, Math.floor(u));
  const f = u - i;
  if (i === n - 1) return { k: i, fill: clamp(f / PLATEAU) };
  return { k: i + (f < PLATEAU ? 0 : easeSymmetric((f - PLATEAU) / (1 - PLATEAU))), fill: clamp(f / PLATEAU) };
}

/** Progress at which card i's plateau begins (used by segment tabs). */
export const cardLanding = (i: number, n: number) => DECK_A + ((DECK_B - DECK_A) * i) / n + 0.004;

/** Horizontal story deck driven by its track's progress. Writes transforms directly. */
export function StoryDeck({ track, cards }: { track: string; cards: DeckCard[] }) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const n = cards.length;

  const apply = (p: number) => {
    const el = root.current;
    if (!el) return;
    const cardEls = el.querySelectorAll<HTMLElement>("[data-card]");
    const fills = el.querySelectorAll<HTMLElement>("[data-seg-fill]");
    if (!motionEnabled()) {
      cardEls.forEach((c) => { c.style.transform = ""; c.style.opacity = ""; });
      fills.forEach((f) => {
        const card = Number(f.closest<HTMLElement>("[data-card]")?.dataset.card ?? 0);
        f.style.transform = Number(f.dataset.segFill) <= card ? "scaleX(1)" : "scaleX(0)";
      });
      return;
    }
    const vw = innerWidth, vh = innerHeight;
    const cls = viewportClass(vw);
    const [cw] = SIZE[cls];
    const gap = cls === "M" ? Math.max(8, (vw - cw) / 2 - 12) : 8;
    const { k, fill } = deckK(p, n);
    const rise0 = 1 - windowed(p, 0, DECK_A, easeSymmetric); // card 1 rises from below
    const exit = windowed(p, DECK_B, 1, easeSymmetric);
    const centreX = vw / 2 - cw / 2;
    cardEls.forEach((c, j) => {
      const x = centreX + (j - k) * (cw + gap) - exit * 0.4 * vw;
      // card 1 rises 60vh (5.4); each later card enters from fully below the stage,
      // travelling diagonally into the centre as the row shifts (reference behaviour)
      const y = j === 0 ? rise0 * 0.6 * vh : (1 - easeSymmetric(clamp(k - (j - 1)))) * vh;
      c.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      c.style.opacity = exit > 0 ? String(1 - 0.6 * exit) : "";
    });
    const cur = Math.round(k);
    const seg = Math.floor(k);
    fills.forEach((f) => {
      const i = Number(f.dataset.segFill);
      const v = i < seg ? 1 : i === seg ? fill : 0;
      f.style.transform = `scaleX(${v.toFixed(3)})`;
    });
    if (cur !== activeRef.current) {
      activeRef.current = cur;
      setActive(cur);
    }
  };
  useProgress(track, apply);
  // Re-apply after the active card re-renders its segment tablist.
  useLayoutEffect(() => apply(getProgress(track)));

  const select = (i: number) => jumpTo(track, cardLanding(i, n));

  return (
    <div className="deck" ref={root}>
      {cards.map((c, i) => (
        <StoryCard key={i} {...c} visual={typeof c.visual === "function" ? c.visual(i === active || !motionEnabled()) : c.visual} index={i} count={n} active={i === active} onSelect={select} />
      ))}
    </div>
  );
}
