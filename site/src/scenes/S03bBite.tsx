import { useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Track } from "../scroll/Track";
import { HonestyChip } from "../components/HonestyChip";
import { ArtifactStatus } from "../components/StateUI";
import { Radio } from "../components/Radio";
import { useArtifact } from "../data/useArtifact";
import { DEMAND, FACTS, FUEL_MIX } from "../data/artifacts";
import { biteLedger, copyS03b, MONTHS, yearCaption } from "../data/copy";
import { store } from "../state/store";
import { useMotion, useProgress } from "../scroll/hooks";
import { jumpTo } from "../scroll/engine";
import { getStore } from "../data/loader";
import { stepState, windowed } from "../motion/progress";
import { Tween } from "../motion/tween";
import { DUR, easeSmooth, linear } from "../motion/ease";
import { clamp } from "../lib/math";
import { petals, tweenPetals } from "../model/stack";
import { biteStack, bitePeak } from "../model/bite";
import { drawGhostArcs, drawHourLabels, drawRose, radius, type Ctx, type PetalIn } from "../graphics/rose";
import { BAS, type BA, type DemandProfile, type FuelMix } from "../model/types";
import { baseView, registerFrame } from "./director";
import { fitR100, layout } from "./geometry";
import { useViewport } from "./useViewport";
import { Still } from "./Still";
import { viewportClass } from "../graphics/canvas";
import { motionEnabled } from "../state/motion";
import type { SceneDef } from "../app/scenes";

export const YEARS = ["2021", "2022", "2023", "2024", "2025"];
/** Visitor overrides; null = follow the scroll (VISUAL_DESIGN S03b: LAYER, GRID, YEAR, MONTH). */
export const bite = store({ ba: "CISO" as BA, layer: null as "demand" | "net" | null, year: null as string | null });
const YEAR_STEPS = [0.68, 0.74, 0.8, 0.86];
const bstate = { yearStep: 0, net: 0 };

/** The scroll-derived state at p: integer month (p 0.05-0.55), NET LOAD at 0.55, years 0.62-0.92 at the bite month. */
export function biteAt(p: number, prevYearStep: number, biteMonth: number) {
  const month = clamp(Math.floor(windowed(p, 0.05, 0.55) * 12) + 1, 1, 12);
  const net = p >= 0.57;
  const ys = p >= 0.62 ? stepState(prevYearStep, p, YEAR_STEPS) : 0;
  return { month: p >= 0.6 ? biteMonth : month, net, year: p >= 0.62 ? YEARS[ys]! : null, yearStep: ys };
}
export const biteP = (month: number) => 0.05 + ((month - 0.5) / 12) * 0.5;

// ------------------------------------------------------------------ the canvas frame
const netTw = new Tween(0, DUR.panel, easeSmooth);
const valTw = new Tween(1, DUR.panel, easeSmooth);
const monthTw = new Tween(1, DUR.fast, linear);
let lastKey = "", fromPetals: PetalIn[] | null = null, monthA: PetalIn[] | null = null, monthFrom: PetalIn[] | null = null, lastMonth = -1, lastBa = "";
registerFrame("netload", ({ now, p, L }) => {
  const fm = getStore(FUEL_MIX).state, dp = getStore(DEMAND).state, facts = getStore(FACTS).state;
  if (fm.status !== "ready" || dp.status !== "ready") return null;
  const st = bite.get();
  const biteMonth = facts.status === "ready" ? (facts.data.bas[st.ba].deepest_bite_month as number) : 4;
  const s = motionEnabled() ? biteAt(p, bstate.yearStep, biteMonth) : { month: biteMonth, net: true, year: YEARS.at(-1)!, yearStep: 4 };
  bstate.yearStep = s.yearStep;
  const net = (st.layer ?? (s.net ? "net" : "demand")) === "net";
  const year = st.year ?? s.year;
  const month = year ? biteMonth : s.month;
  if (netTw.target !== (net ? 1 : 0)) netTw.retarget(net ? 1 : 0, now, motionEnabled() ? DUR.panel : 0);
  netTw.update(now);
  const stack = biteStack(fm.data, dp.data, st.ba, month, year, netTw.value);
  const target = petals(stack, () => 1);
  // year or GRID: a keyed 600ms area tween; month: a 200ms crossfade between two real month roses
  const key = `${st.ba}|${year}`;
  if (key !== lastKey) { fromPetals = lastKey && lastBa === st.ba ? (monthA ?? target) : target; lastKey = key; lastBa = st.ba; valTw.value = 0; valTw.retarget(1, now, motionEnabled() ? DUR.panel : 0); }
  valTw.update(now);
  const main = valTw.value < 1 && fromPetals ? tweenPetals(fromPetals, target, () => valTw.value, valTw.value) : target;
  if (month !== lastMonth) {
    monthFrom = lastMonth > 0 && monthA && motionEnabled() ? monthA : null;
    if (monthFrom) { monthTw.value = 0; monthTw.retarget(1, now, DUR.fast); } else monthTw.snap();
    lastMonth = month;
  }
  monthTw.update(now);
  monthA = main;
  const R100 = fitR100(L.G3, bitePeak(dp.data, st.ba));
  const view = baseView(stack.keys, { cx: L.G3.cx, cy: L.G3.cy, R100, rref: radius(Math.max(...stack.demand), R100), gap: L.gap });
  const fading = monthFrom && monthTw.value < 1;
  return {
    petals: fading ? monthFrom! : main, view, labels: 0.7, bloom: 0, glow: null, sky: null,
    mixB: fading ? { petals: main, view, mix: monthTw.value } : undefined,
    // the removed solar and wind area stays as a dotted outline at the demand tip
    extra: netTw.value > 0.01 ? (c: CanvasRenderingContext2D) => drawGhostArcs(c as unknown as Ctx, stack.demand, view, `rgba(255,243,166,${(0.8 * netTw.value).toFixed(2)})`, [1, 3]) : undefined,
    sig: `netload|${st.ba}|${month}|${year}|${netTw.value.toFixed(3)}|${valTw.value.toFixed(3)}|${monthTw.value.toFixed(3)}`,
  };
});

function BiteStill({ fm, dp, ba, month, year, label }: { fm: FuelMix; dp: DemandProfile; ba: BA; month: number; year: string | null; label: string }) {
  return (
    <Still className="bite-still" label={label} deps={[ba, month, year]} draw={(c, w, h) => {
      const LL = layout(w, h, viewportClass(innerWidth));
      const s = biteStack(fm, dp, ba, month, year, 1);
      const R100 = (Math.min(w, h) * 0.45) / Math.sqrt(bitePeak(dp, ba) / 1e5);
      const v = baseView(s.keys, { cx: w / 2, cy: h / 2, R100, rref: radius(Math.max(...s.demand), R100), gap: LL.gap, glow: LL.glow });
      const ps = petals(s, () => 1);
      drawRose(c, ps, v);
      drawGhostArcs(c, s.demand, v, "rgba(255,243,166,0.8)", [1, 3]);
      drawHourLabels(c, ps, v, LL.label, 0.7);
    }} />
  );
}

/** S03b "The Bite" (interaction 3). */
export function S03bBite({ def }: { def: SceneDef }) {
  const [fmS, retryF] = useArtifact(FUEL_MIX);
  const [dpS, retryD] = useArtifact(DEMAND);
  const [factsS] = useArtifact(FACTS);
  const st = useSyncExternalStore(bite.subscribe, bite.get);
  const motion = useMotion();
  const vp = useViewport();
  const M = viewportClass(vp.w) === "M";
  const biteMonth = factsS.status === "ready" ? (factsS.data.bas[st.ba].deepest_bite_month as number) : 4;
  const [ph, setPh] = useState({ month: 1, net: false, year: null as string | null, ys: 0 });
  useProgress(def.id, (p) => {
    const s = biteAt(p, ph.ys, biteMonth);
    setPh((o) => (o.month === s.month && o.net === s.net && o.year === s.year ? o : { month: s.month, net: s.net, year: s.year, ys: s.yearStep }));
  });
  const eff = motion ? ph : { month: biteMonth, net: true, year: YEARS.at(-1)!, ys: 4 };
  const net = (st.layer ?? (eff.net ? "net" : "demand")) === "net";
  const year = st.year ?? eff.year;
  // the year steps (and a chosen year) are always shown at the CURRENT grid's deepest bite month
  const month = year ? biteMonth : eff.month;
  const fm = fmS.status === "ready" ? fmS.data : null, dp = dpS.status === "ready" ? dpS.data : null;
  const stack = fm && dp ? biteStack(fm, dp, st.ba, month, year, 1) : null;
  const led = stack ? biteLedger(stack.netload) : null;
  const yb = fm?.bas[st.ba].month_hour_mean_mw_by_year;
  const partial = year && yb ? yb[year]!.months_present < 12 : false;
  const key = (e: KeyboardEvent) => {
    const d = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (d) { e.preventDefault(); jumpTo(def.id, biteP(clamp(month + d, 1, 12))); }
  };
  return (
    <Track id={def.id} height={def.track} landing={def.landing} className={`scene scene-${def.id}`} label="Net load: the bite">
      <div className="bite-text">
        <h2 id={`${def.id}-title`} tabIndex={-1} data-scene-heading className="scene-statement" key={net ? "net" : "dem"}>{net ? copyS03b.net : copyS03b.demand}</h2>
        <p className="scene-kicker">NET LOAD · {st.ba} · MEAN DAY OF THE MONTH{year ? ` · ${year}` : " · ALL YEARS"}</p>
      </div>
      <ArtifactStatus file="fuel_mix.json" state={fmS} retry={retryF} empty="NO MONTHLY PROFILES PUBLISHED">
        {() => (
          <ArtifactStatus file="demand_profile.json" state={dpS} retry={retryD} empty="NO DEMAND PROFILE PUBLISHED">
            {() => (
              <>
                <div className="bite-controls">
                  <Radio label="LAYER" value={net ? "net" : "demand"} options={["demand", "net"] as const} render={(l) => (l === "net" ? "NET LOAD" : "DEMAND")} onChange={(layer) => bite.set({ layer })} />
                  <Radio label="GRID" value={st.ba} options={BAS} onChange={(ba) => bite.set({ ba })} />
                  <Radio label="YEAR" value={year ?? "all"} options={["all", ...YEARS]} render={(y) => (y === "all" ? "ALL" : y === "2025" ? "2025*" : y)}
                    disabled={(y) => (y !== "all" && !yb?.[y] ? copyS03b.noYears : null)} onChange={(y) => bite.set({ year: y === "all" ? null : y })} />
                  {st.layer || st.year ? <button type="button" className="text-btn" onClick={() => bite.set({ layer: null, year: null, ba: "CISO" })}>RESET</button> : null}
                </div>
                <div className="bite-readout" aria-live="polite">
                  <p className="readout-hour tnum">{MONTHS[month - 1]}</p>
                  {led ? (
                    <>
                      <p className="readout-line tnum">{led.min}</p>
                      <p className="readout-line tnum">{led.max}</p>
                      <p className="readout-line tnum">{led.ramp}</p>
                      {year ? <p className="readout-line readout-line--muted tnum" data-year-caption>{yearCaption(year, month, led.minMw, partial)}</p> : null}
                    </>
                  ) : null}
                  <div className="bite-chips"><HonestyChip tag="DERIVED" detail="MONTH-HOUR MEANS OF EIA-930" /></div>
                  {!M ? <p className="city-note bite-note">{copyS03b.mix}</p> : null}
                </div>
                {motion ? (
                  <div className="bite-hit" tabIndex={0} role="img" onKeyDown={key}
                    aria-label={`Mean day of ${MONTHS[month - 1]} in ${st.ba}${year ? ` ${year}` : ""}, ${net ? "net load" : "demand"}. Up and Down step the month.`} />
                ) : fm && dp ? (
                  <div className="bite-stills">
                    {[1, 4, 7, 10].map((mo) => <figure key={mo}><BiteStill fm={fm} dp={dp} ba={st.ba} month={mo} year={null} label={`Net load, mean day of ${MONTHS[mo - 1]}`} /><figcaption className="readout-line">{MONTHS[mo - 1]} · NET LOAD · ALL YEARS</figcaption></figure>)}
                    <figure><BiteStill fm={fm} dp={dp} ba={st.ba} month={biteMonth} year={year} label={`Net load, ${MONTHS[biteMonth - 1]} ${year ?? "all years"}`} /><figcaption className="readout-line">{MONTHS[biteMonth - 1]} · {year ?? "ALL YEARS"} (YEAR CHIPS ABOVE)</figcaption></figure>
                  </div>
                ) : null}
              </>
            )}
          </ArtifactStatus>
        )}
      </ArtifactStatus>
    </Track>
  );
}
