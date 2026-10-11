import { createPortal } from "react-dom";
import { HonestyChip } from "../components/HonestyChip";
import { ArtifactStatus, SceneErrors } from "../components/StateUI";
import type { ArtifactSpec } from "../data/loader";
import { useArtifact } from "../data/useArtifact";
import { MODEL } from "../data/artifacts";
import { copyS00, copyS01, s01Cards } from "../data/copy";
import { FACTS } from "../data/artifacts";
import { NotificationCard } from "../components/NotificationCard";
import { WordReveal } from "../components/WordReveal";
import { useState } from "react";
import { easeSymmetric } from "../motion/ease";
import { currentClass } from "../graphics/canvas";
import { useMotion, useProgress } from "../scroll/hooks";
import { windowed } from "../motion/progress";
import { drawRose, radius } from "../graphics/rose";
import { observedStack, petals } from "../model/stack";
import { layout } from "./geometry";
import { Still } from "./Still";

/**
 * S00 / S01 layer (portal into the static hero): the bottom-right honesty chip and note, the
 * artifact state lines, and the reduced-motion still of the giant rose. The headline and corner
 * labels are static HTML (LCP); the live rose is the fixed director canvas.
 */
const motionOn = () => document.documentElement.dataset.motion !== "off";

export function PulseLayer({ introPlaying }: { introPlaying: boolean }) {
  const [state, retry] = useArtifact(MODEL);
  const motion = useMotion();
  const day = state.status === "ready" ? state.data.bas.CISO.days.find((d) => d.intro) ?? null : null;
  const c = day ? copyS00(day) : null;
  // the reduced-motion still sits beneath the scrim (layer order: canvas, scrim, h1)
  const stillSlot = document.getElementById("pulse-still");
  const [fs] = useArtifact(FACTS);
  const [cards, setCards] = useState(0);
  // S01 p 0-0.4: the scrim fades out as the rose moves G0 -> G1, and the headline scales down to the top-left
  useProgress("pulse", (p) => {
    document.querySelector<HTMLElement>(".hero-scrim")?.style.setProperty("--scrim", String(1 - windowed(p, 0, 0.4)));
    const h = document.querySelector<HTMLElement>("h1[data-hero]");
    if (h) {
      const e = motionOn() ? easeSymmetric(windowed(p, 0, 0.4)) : 0;
      const cls = currentClass();
      const top = cls === "D" ? 64 : cls === "T" ? 52 : 74;
      const dy = (top - h.offsetTop) * e;
      h.style.transform = e > 0 ? `translateY(${dy.toFixed(1)}px) scale(${(1 - 0.5 * e).toFixed(4)})` : "";
    }
    document.querySelector<HTMLElement>(".pulse-foot")?.style.setProperty("opacity", String(1 - windowed(p, 0.02, 0.1)));
    // the S01 statement arrives only once the headline has cleared its space (no ghost text under the moving headline)
    if (motionOn()) document.querySelector<HTMLElement>(".s01-statement")?.style.setProperty("opacity", String(windowed(p, 0.3, 0.36)));
    setCards((o) => (p >= 0.6 ? o || Date.now() : 0));
  });
  return (
    <>
      <SceneErrors id="pulse" specs={[MODEL, FACTS] as ArtifactSpec<unknown>[]} />
      {!motion && day && stillSlot ? createPortal(
        <Still className="pulse-still" label={c!.alt} deps={[day.date]} draw={(ctx, w, h) => {
          const L = layout(w, h);
          const s = observedStack(day);
          const peak = Math.max(...day.demand_mw);
          const R100 = L.G0.rPeak / Math.sqrt(peak / 1e5);
          drawRose(ctx, petals(s, () => 1), { cx: L.G0.cx, cy: L.G0.cy, R100, rref: radius(peak, R100), gap: L.gap0, ghost: 0.06, bands: 1, marks: 1, beat: 0, lift: null, liftT: 0, glow: L.glow, keys: s.keys });
        }} />, stillSlot,
      ) : null}
      <div className="s01">
        <WordReveal as="p" className="s01-statement" text={copyS01.statement} mode={motion ? { kind: "scrub", track: "pulse", from: 0.35, to: 0.75 } : { kind: "value", t: 1 }} />
        {fs.status === "ready" ? (
          <div className={`s01-cards ${cards || !motion ? "is-in" : ""}`}>
            {s01Cards(fs.data).map((c, i) => (
              <NotificationCard key={c.from} from={c.from} when={c.when} body={c.body} variant={i === 0 ? "dark" : "blue"} playKey={motion ? cards : 0}
                tag={<HonestyChip tag="OBSERVED" detail="EIA-930" onLight={false} />} />
            ))}
          </div>
        ) : null}
      </div>
      <div className={`pulse-foot ${introPlaying ? "is-waiting" : ""}`}>
        <ArtifactStatus file="dispatch_model.json" state={state} retry={retry} empty="NO REFERENCE DAY PUBLISHED">
          {() => (c ? (
            <>
              <HonestyChip tag="OBSERVED" detail={c.chip} />
              <p className="pulse-note">{c.note}</p>
            </>
          ) : <p className="state-line state-line--empty">NO INTRO DAY IN DISPATCH_MODEL</p>)}
        </ArtifactStatus>
      </div>
    </>
  );
}
