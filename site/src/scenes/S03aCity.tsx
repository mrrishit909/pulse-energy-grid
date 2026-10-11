import { useSyncExternalStore, type CSSProperties, type KeyboardEvent } from "react";
import { Track } from "../scroll/Track";
import { HonestyChip } from "../components/HonestyChip";
import { ArtifactStatus } from "../components/StateUI";
import { Radio } from "../components/Radio";
import { useArtifact } from "../data/useArtifact";
import { FACTS, MODEL } from "../data/artifacts";
import { cityReadout, copyS03a, fuelName, rampNote } from "../data/copy";
import { city } from "../state/scenes";
import { useMotion, useProgress } from "../scroll/hooks";
import { jumpTo } from "../scroll/engine";
import { windowed } from "../motion/progress";
import { clamp } from "../lib/math";
import { int } from "../model/format";
import { litCount, windows } from "../model/city";
import { observedStack, petals } from "../model/stack";
import { drawHourLabels, drawRose, FUEL, radius, TOKEN, type Ctx } from "../graphics/rose";
import { BAS, type BA, type DispatchModel } from "../model/types";
import { fitR100, layout } from "./geometry";
import { viewportClass } from "../graphics/canvas";
import { Still } from "./Still";
import { useViewport } from "./useViewport";
import type { SceneDef } from "../app/scenes";

/** Scroll p 0.06-0.94 maps to integer hours 0-23 (MOTION_SYSTEM 5.5). */
export const hourAt = (p: number) => clamp(Math.floor(windowed(p, 0.06, 0.94) * 24), 0, 23);
/** The progress at the middle of hour h's band (for Arrow keys and evidence). */
export const hourP = (h: number) => 0.06 + ((h + 0.5) / 24) * 0.88;
const STILL_HOURS = [3, 9, 15, 19];

function paintCity(ctx: Ctx & CanvasRenderingContext2D, w: number, h: number, m: DispatchModel, ba: BA, dayId: string, hour: number) {
  const day = m.bas[ba].days.find((d) => d.id === dayId)!;
  const L = layout(w, h, viewportClass(innerWidth));
  const s = observedStack(day, false);
  const peak = Math.max(...day.demand_mw);
  const sky = L.G2.sky;
  const lit = litCount(day.demand_mw[hour]!);
  for (const win of windows(sky)) { ctx.fillStyle = win.rank < lit ? "#FFF3A6" : "#1A1A1A"; ctx.fillRect(win.x, win.y, sky.win, sky.win); }
  const ps = petals(s, () => 1);
  const R2 = fitR100(L.G2, peak);
  const v = { cx: L.G2.cx, cy: L.G2.cy, R100: R2, rref: radius(peak, R2), gap: L.gap, ghost: 0, bands: 1, marks: 1, beat: 0, lift: hour, liftT: 1, glow: L.glow, keys: s.keys };
  drawRose(ctx, ps, v);
  drawHourLabels(ctx, ps, v, L.label, 0.7);
}

/** S03a "Window City" (interaction 2): an integer hour from scroll; GRID and DAY are visitor-set. */
export function S03aCity({ def }: { def: SceneDef }) {
  const [ms, retry] = useArtifact(MODEL);
  const [fs] = useArtifact(FACTS);
  const c = useSyncExternalStore(city.subscribe, city.get);
  const motion = useMotion();
  const vp = useViewport();
  const isM = viewportClass(vp.w) === "M";
  useProgress(def.id, (p) => { const h = hourAt(p); if (h !== city.get().hour) city.set({ hour: h }); });
  const m = ms.status === "ready" ? ms.data : null;
  const bm = m?.bas[c.ba];
  const day = bm?.days.find((d) => d.id === c.dayId) ?? bm?.days[0];
  const isDefault = c.ba === "CISO" && c.dayId === m?.bas.CISO.days[0]?.id;
  const setBa = (ba: BA) => city.set({ ba, dayId: m!.bas[ba].days[0]!.id });
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    jumpTo(def.id, hourP(clamp(c.hour + d, 0, 23)));
  };
  const stack = day ? observedStack(day, false) : null;
  const hour = c.hour;
  const r = day ? cityReadout(day, hour, litCount(day.demand_mw[hour]!)) : null;
  const legend = stack ? stack.keys.map((k, i) => ({ k, mw: stack.hours[hour]!.values[i]! })).filter((x) => x.mw > 0) : [];
  const sinks = stack ? stack.hours[hour]! : null;
  const hasFuel = !!day && Object.keys(day.observed_gen_mw).length > 0;
  return (
    <Track id={def.id} height={def.track} landing={def.landing} className={`scene scene-${def.id}`} label="Demand: the window city">
      <div className="city-text">
        <h2 id={`${def.id}-title`} tabIndex={-1} data-scene-heading className="scene-statement">{copyS03a.statement}</h2>
        <p className="scene-kicker">{copyS03a.kicker(c.ba)}{day ? ` · ${day.date}` : ""}</p>
      </div>
      <ArtifactStatus file="dispatch_model.json" state={ms} retry={retry} empty="NO REFERENCE DAYS PUBLISHED">
        {(data) => (
          <>
            <div className="city-controls">
              <div className="city-controls__row">
                <Radio label="GRID" value={c.ba} options={BAS} onChange={setBa} />
                {!isDefault ? <button type="button" className="text-btn" onClick={() => city.set({ ba: "CISO", dayId: data.bas.CISO.days[0]!.id })}>RESET</button> : null}
              </div>
              <Radio label="DAY" asSelect={isM} value={day!.id} options={data.bas[c.ba].days.map((d) => d.id)} onChange={(dayId) => city.set({ dayId })}
                render={(id) => { const d = data.bas[c.ba].days.find((x) => x.id === id)!; return d.intro ? "SOLAR PEAK" : d.season.toUpperCase(); }} />
            </div>
            {motion && r ? (
              <div className="city-readout" aria-live="polite">
                <p className="readout-hour tnum">{r.hour}</p>
                <p className="readout-line tnum">{r.served}</p>
                <p className="readout-line tnum">{r.lit}</p>
                {!isM ? <p className="readout-line tnum">{r.temp}</p> : null}
                {!isM ? <p className="readout-line readout-line--muted tnum">{r.delta}</p> : null}
                {!isM && fs.status === "ready" && hour >= 17 && hour <= 21 ? <p className="readout-line readout-line--ramp tnum">{rampNote(fs.data, c.ba)}</p> : null}
                {isM ? null : hasFuel ? (
                  <ul className="stack-legend" aria-label={`Stack at ${r.hour}, centre outward`}>
                    {legend.map(({ k, mw }) => { const f = FUEL[TOKEN[k]!]!; return (
                      <li key={k}><span className="swatch" style={{ "--c0": f.c0, "--c1": f.c1 } as CSSProperties} aria-hidden="true" />{fuelName(k)} <span className="tnum">{int(mw)}</span></li>
                    ); })}
                    {sinks && sinks.charge > 0.5 ? <li><span className="swatch swatch--charge" aria-hidden="true" />CHARGING, STATION USE <span className="tnum">{int(sinks.charge)}</span></li> : null}
                    {sinks && sinks.exports > 0.5 ? <li><span className="swatch swatch--export" aria-hidden="true" />EXPORTS <span className="tnum">{int(sinks.exports)}</span></li> : null}
                    {sinks && Math.abs(sinks.residual) > 0.5 ? <li><span className="swatch swatch--residual" aria-hidden="true" />BALANCE RESIDUAL (AS REPORTED) <span className="tnum">{int(sinks.residual)}</span></li> : null}
                  </ul>
                ) : <p className="state-line state-line--empty">{copyS03a.empty}</p>}
              </div>
            ) : null}
            <div className="city-chips">
              <HonestyChip tag="OBSERVED" detail="EIA-930" />
              <HonestyChip tag="DERIVED" detail={copyS03a.windowChip.replace("EIA-930 · DERIVED: ", "")} />
              <HonestyChip tag="OBSERVED" detail={`TEMPERATURE · ${copyS03a.tempChip}`} />
            </div>
            <p className="city-note">{copyS03a.note}</p>
            {motion ? (
              <div className="city-rose-hit" tabIndex={0} role="img" onKeyDown={onKey}
                aria-label={`Day rose of ${c.ba} on ${day!.date}, ${r?.hour}: ${r?.served}. Arrow keys step the hour.`} />
            ) : (
              <div className="city-stills">
                {STILL_HOURS.map((h) => {
                  const rr = cityReadout(day!, h, litCount(day!.demand_mw[h]!));
                  return (
                    <figure key={h} className="city-still">
                      <Still label={`${c.ba} ${day!.date} at ${rr.hour}: ${rr.served}, ${rr.lit}`} deps={[c.ba, day!.id, h]}
                        draw={(ctx, w, hh) => paintCity(ctx as Ctx & CanvasRenderingContext2D, w, hh, data, c.ba, day!.id, h)} />
                      <figcaption className="readout-line tnum">{rr.hour} · {rr.served} · {rr.lit}</figcaption>
                    </figure>
                  );
                })}
              </div>
            )}
          </>
        )}
      </ArtifactStatus>
    </Track>
  );
}
