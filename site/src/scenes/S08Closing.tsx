import type { ArtifactSpec } from "../data/loader";
import { SceneErrors } from "../components/StateUI";
import { useState, useSyncExternalStore } from "react";
import { Track } from "../scroll/Track";
import { HonestyChip } from "../components/HonestyChip";
import { WordReveal } from "../components/WordReveal";
import { useArtifact } from "../data/useArtifact";
import { META, MODEL } from "../data/artifacts";
import { closingCaption, copyS08 } from "../data/copy";
import { ctrl } from "../state/scenes";
import { sameParams } from "../state/lab";
import { useMotion, useProgress } from "../scroll/hooks";
import { jumpTo } from "../scroll/engine";
import { windowed } from "../motion/progress";
import { easeSmooth, easeSymmetric } from "../motion/ease";
import { clamp } from "../lib/math";
import { fullParams, scenarioDemand } from "../model/lp";
import { observedStack, petals, simulatedStack, type DayStack } from "../model/stack";
import { drawRose, radius } from "../graphics/rose";
import { useViewport } from "./useViewport";
import type { DispatchModel } from "../model/types";
import { baseView, registerFrame } from "./director";
import { camera, layout } from "./geometry";
import { Still } from "./Still";
import type { SceneDef } from "../app/scenes";

/** The S08 day: the visitor's CTRL result if they changed anything, else the S00 OBSERVED day (VISUAL_DESIGN S08). */
export function closingDay(model: DispatchModel): { stack: DayStack; date: string; ba: string; served: number; tag: "OBSERVED" | "SIMULATED" } {
  const c = ctrl.get();
  const m = model.bas[c.ba];
  if (c.result && c.params && c.source === "browser" && !sameParams(c.params, fullParams(m))) {
    const day = m.days.find((d) => d.id === c.dayId)!;
    const D = scenarioDemand(m, day, c.params);
    return { stack: simulatedStack(m.display_order, day, D, c.result), date: day.date, ba: c.ba, served: D.reduce((a, b) => a + b, 0) - c.result.unserved_mwh, tag: "SIMULATED" };
  }
  const day = model.bas.CISO.days.find((d) => d.intro)!;
  return { stack: observedStack(day), date: day.date, ba: "CISO", served: day.demand_mw.reduce((a, b) => a + b, 0), tag: "OBSERVED" };
}

// ------------------------------------------------------------------ the echo: the opening's own choreography at constant G0 size
const echo = { at: -1, armed: true };
const DRAIN = 150, REFILL = 300, BEAT = 500;
registerFrame("closing", ({ now, p, L, model }) => {
  const d = closingDay(model);
  const n = d.stack.keys.length;
  const peak = Math.max(...d.stack.hours.map((h) => h.demand + h.charge + h.exports));
  const R0 = L.G0.rPeak / Math.sqrt(Math.max(...d.stack.hours.map((h) => h.demand)) / 1e5);
  const e = easeSymmetric(windowed(p, 0, 0.35));
  const cam = camera(L.G1, { cx: L.G0.cx, cy: L.G0.cy, R100: R0 }, e);
  // stepped once per down-crossing of 0.70; re-crossing above 0.68 resets (full rose, no replay)
  if (p >= 0.7 && echo.armed) { echo.at = now; echo.armed = false; }
  if (p < 0.68) { echo.armed = true; echo.at = -1; }
  const t = echo.at < 0 ? -1 : now - echo.at;
  const drainEnd = n * DRAIN, fillEnd = drainEnd + n * REFILL;
  const fill = (k: number) => {
    if (t < 0) return 1;
    if (t < drainEnd) return 1 - easeSmooth(clamp((t - (n - 1 - k) * DRAIN) / DRAIN)); // rim inward
    return easeSmooth(clamp((t - drainEnd - k * REFILL) / REFILL)); // centre outward
  };
  const bt = t - fillEnd;
  const beat = t >= 0 && bt >= 0 && bt < BEAT ? (bt < BEAT / 2 ? easeSmooth(bt / (BEAT / 2)) : 1 - easeSmooth((bt - BEAT / 2) / (BEAT / 2))) : 0;
  const busy = t >= 0 && t < fillEnd + BEAT;
  return {
    petals: petals(d.stack, fill), view: baseView(d.stack.keys, { ...cam, rref: radius(peak, cam.R100), gap: L.gap + (L.gap0 - L.gap) * e, ghost: 0.06, beat }),
    labels: 0, bloom: e >= 1 && !busy ? 0.35 : 0, glow: null, sky: null,
    sig: `closing|${p.toFixed(4)}|${busy ? now.toFixed(0) : "idle"}|${d.tag}${d.date}`,
  };
});
export const echoState = () => ({ at: echo.at, armed: echo.armed });

/** S08 "The Day Closes" (interaction 11): the rose returns to G0, drains and re-blooms; the links. */
export function S08Closing({ def, onReplay }: { def: SceneDef; onReplay: () => void }) {
  const [ms] = useArtifact(MODEL);
  const [mt] = useArtifact(META, false);
  const motion = useMotion();
  const isM = useViewport().cls === "M";
  const [creditOpen, setCreditOpen] = useState(false);
  useSyncExternalStore(ctrl.subscribe, ctrl.get); // re-render when the visitor's CTRL result changes the closing day
  const [ph, setPh] = useState({ caption: false, links: false, corners: false });
  useProgress(def.id, (p) => {
    const next = { caption: p >= 0.74, links: p >= 0.8, corners: p >= 0.7 };
    setPh((o) => (o.caption === next.caption && o.links === next.links && o.corners === next.corners ? o : next));
  });
  const show = motion ? ph : { caption: true, links: true, corners: true };
  const d = ms.status === "ready" ? closingDay(ms.data) : null;
  return (
    <Track id={def.id} height={def.track} landing={def.landing} className={`scene scene-${def.id}`} label="The day closes">
      <SceneErrors id={def.id} specs={[MODEL, META] as ArtifactSpec<unknown>[]} />
      <div className="close-scrim" aria-hidden="true" />
      {!motion && ms.status === "ready" && d ? (
        <Still className="close-still" label="The giant rose of the day" deps={[d.date, d.tag]} draw={(cx, w, h) => {
          const L = layout(w, h);
          const R100 = L.G0.rPeak / Math.sqrt(Math.max(...d.stack.hours.map((x) => x.demand)) / 1e5);
          const peak = Math.max(...d.stack.hours.map((x) => x.demand + x.charge + x.exports));
          drawRose(cx, petals(d.stack, () => 1), baseView(d.stack.keys, { cx: L.G0.cx, cy: L.G0.cy, R100, rref: radius(peak, R100), gap: L.gap0, ghost: 0.06, glow: L.glow }));
        }} />
      ) : null}
      <div className={`close-corners ${show.corners ? "is-in" : ""}`} aria-hidden={!show.corners}>
        <p className="wordmark">PULSE ENERGY GRID</p>
        {d ? <p className="intro-corner">{d.ba} · {d.date}</p> : null}
      </div>
      {/* QA D-029: the paragraph and the foot stack from the bottom, so a full, wrapped credit never runs into the text */}
      <div className="close-text">
      <WordReveal as="h2" id={`${def.id}-title`} tabIndex={-1} data-scene-heading className="close-para" text={copyS08.paragraph}
        mode={motion ? { kind: "scrub", track: def.id, from: 0.35, to: 0.65 } : { kind: "value", t: 1 }} />
      <div className={`close-foot ${show.caption ? "is-in" : ""}`}>
        {d ? <p className="close-caption tnum" data-caption>{closingCaption(d)} <HonestyChip tag={d.tag} detail={d.tag === "SIMULATED" ? "YOUR SCENARIO" : "EIA-930"} className="chip--inline" /></p> : null}
        <ul className={`close-links ${show.links ? "is-in" : ""}`}>
          <li><button type="button" className="text-btn" onClick={() => jumpTo("control", 0, { push: true, focus: true })}>→ OPEN THE CONTROL ROOM</button></li>
          <li><button type="button" className="text-btn" onClick={onReplay}>→ REPLAY THE INTRO</button></li>
          <li><a className="text-btn" href={copyS08.methodology} target="_blank" rel="noopener">→ READ THE METHODOLOGY</a></li>
          <li><a className="text-btn" href={copyS08.source} target="_blank" rel="noopener">→ SOURCE CODE</a></li>
        </ul>
        {mt.status === "ready" ? (
          isM ? (
            // QA D-034: on phones the full credit sits behind a disclosure, so the echo rose keeps the frame
            <details className="close-credit-d" onToggle={(e) => setCreditOpen(e.currentTarget.open)}><summary className="text-btn">DATA SOURCES AND ATTRIBUTION</summary>{creditOpen ? <p className="close-credit">{mt.data.attribution.join(" · ")} · RETRIEVED {mt.data.generated_at}</p> : null}</details>
          ) : <p className="close-credit">{mt.data.attribution.join(" · ")} · RETRIEVED {mt.data.generated_at}</p>
        ) : null}
      </div>
      </div>
    </Track>
  );
}
