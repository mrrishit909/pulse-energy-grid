import { createPortal } from "react-dom";
import { HonestyChip } from "../components/HonestyChip";
import { ArtifactStatus } from "../components/StateUI";
import { useArtifact } from "../data/useArtifact";
import { MODEL } from "../data/artifacts";
import { copyS00 } from "../data/copy";
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
export function PulseLayer({ introPlaying }: { introPlaying: boolean }) {
  const [state, retry] = useArtifact(MODEL);
  const motion = useMotion();
  const day = state.status === "ready" ? state.data.bas.CISO.days.find((d) => d.intro) ?? null : null;
  const c = day ? copyS00(day) : null;
  // the reduced-motion still sits beneath the scrim (layer order: canvas, scrim, h1)
  const stillSlot = document.getElementById("pulse-still");
  // S01 p 0-0.4: the scrim fades out as the rose moves G0 -> G1
  useProgress("pulse", (p) => document.querySelector<HTMLElement>(".hero-scrim")?.style.setProperty("--scrim", String(1 - windowed(p, 0, 0.4))));
  return (
    <>
      {!motion && day && stillSlot ? createPortal(
        <Still className="pulse-still" label={c!.alt} deps={[day.date]} draw={(ctx, w, h) => {
          const L = layout(w, h);
          const s = observedStack(day);
          const peak = Math.max(...day.demand_mw);
          const R100 = L.G0.rPeak / Math.sqrt(peak / 1e5);
          drawRose(ctx, petals(s, () => 1), { cx: L.G0.cx, cy: L.G0.cy, R100, rref: radius(peak, R100), gap: L.gap0, ghost: 0.06, bands: 1, marks: 1, beat: 0, lift: null, liftT: 0, glow: L.glow, keys: s.keys });
        }} />, stillSlot,
      ) : null}
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
