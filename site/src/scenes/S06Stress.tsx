import type { ArtifactSpec } from "../data/loader";
import { useMemo, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from "react";
import { Track } from "../scroll/Track";
import { HonestyChip } from "../components/HonestyChip";
import { StackKey } from "../components/StackKey";
import { ArtifactStatus, SceneErrors } from "../components/StateUI";
import { Radio } from "../components/Radio";
import { HourInspector, RoseHit } from "../components/HourInspector";
import { useArtifact } from "../data/useArtifact";
import { MODEL, RESULTS } from "../data/artifacts";
import { copyS06, flatNote, inspectorSimulated, STRESS_ORDER, stressRows } from "../data/copy";
import { store } from "../state/store";
import { inspector } from "../state/inspector";
import { useMotion, useProgress } from "../scroll/hooks";
import { jumpTo } from "../scroll/engine";
import { getStore } from "../data/loader";
import { stepState } from "../motion/progress";
import { Tween } from "../motion/tween";
import { DUR, easeSmooth } from "../motion/ease";
import { dayPeak, fullParams, scenarioDemand } from "../model/lp";
import { petals, simulatedStack, tweenPetals } from "../model/stack";
import { binsSpanned, drawGhostArcs, drawPriceRose, drawRose, PRICE_BINS, priceBin, radius, type Ctx, type PetalIn } from "../graphics/rose";
import { BAS, type BA, type BAModel, type DispatchResults } from "../model/types";
import { baseView, registerFrame } from "./director";
import { fitR100, layout } from "./geometry";
import { useViewport } from "./useViewport";
import { Still } from "./Still";
import { currentClass } from "../graphics/canvas";
import { motionEnabled } from "../state/motion";
import type { SceneDef } from "../app/scenes";

/** Stepper landings (VISUAL_DESIGN S06) and the thresholds between them (hysteresis +-0.02). */
export const STRESS_P = [0.1, 0.28, 0.46, 0.64, 0.82];
const THRESH = [0.19, 0.37, 0.55, 0.73];
export const stress = store({ ba: "CISO" as BA, dayId: "summer", step: 0, layer: "stack" as "stack" | "price" });

/** Everything S06 draws for one scenario: the petals, the day's demand and the price bins. */
function scenarioState(m: BAModel, rs: DispatchResults, ba: BA, dayId: string, id: string) {
  const day = m.days.find((d) => d.id === dayId)!;
  const sc = m.scenarios.find((s) => s.id === id)!;
  const r = rs.bas[ba].days[dayId]?.[id];
  if (!r) return null;
  const D = scenarioDemand(m, day, fullParams(m, sc.params));
  return { day, r, D, petals: petals(simulatedStack(m.display_order, day, D, r), () => 1), bins: r.price_usd_mwh.map((p) => priceBin(p, m.voll_usd_mwh)) };
}
/** One R100 for the whole stepper, shared with S05 and S07 (model/lp.ts dayPeak), so steps and seams never move the camera. */
function dayR100(m: BAModel, dayId: string, fit: { R100: number; fit: number }) {
  return fitR100(fit, dayPeak(m, m.days.find((d) => d.id === dayId)!));
}

// ------------------------------------------------------------------ the canvas frame (stepped 1200ms keyed settles)
const tw = new Tween(1, DUR.scene, easeSmooth);
let shownKey = "", from: PetalIn[] | null = null, to: PetalIn[] | null = null;
registerFrame("stress", ({ now, L, model }) => {
  const rs = getStore(RESULTS).state;
  if (rs.status !== "ready") return null;
  const st = stress.get();
  const m = model.bas[st.ba];
  const id = STRESS_ORDER[st.step]!;
  const s = scenarioState(m, rs.data, st.ba, st.dayId, id);
  const base = scenarioState(m, rs.data, st.ba, st.dayId, "baseline");
  if (!s || !base) return null;
  const key = `${st.ba}|${st.dayId}|${id}`;
  if (key !== shownKey) {
    const sameDay = shownKey.startsWith(`${st.ba}|${st.dayId}|`);
    from = sameDay && to ? to : s.petals;
    to = s.petals; shownKey = key;
    tw.value = 0; tw.retarget(1, now, motionEnabled() ? DUR.scene : 0);
  }
  tw.update(now);
  const ps = from && tw.value < 1 ? tweenPetals(from, to!, () => tw.value, tw.value) : s.petals;
  const R100 = dayR100(m, st.dayId, L.G4);
  const ins = inspector.get();
  const view = baseView(m.display_order, { cx: L.G4.cx, cy: L.G4.cy, R100, rref: radius(Math.max(...s.D), R100), gap: L.gap, lift: ins.scene === "stress" ? ins.hour : null, liftT: 1 });
  return {
    petals: ps, view, labels: 0.7, bloom: 0, glow: null, sky: null,
    price: st.layer === "price" ? s.bins : undefined, prices: s.r.price_usd_mwh,
    extra: (c) => drawGhostArcs(c as unknown as Ctx, base.D, view),
    sig: `stress|${key}|${st.layer}|${tw.value.toFixed(3)}|${ins.scene}${ins.hour}`,
  };
});

function PriceLegend({ spanned }: { spanned?: number }) {
  return (
    <div className="price-legend" aria-label="Price bins, USD per MWh, model shadow price">
      {spanned !== undefined && spanned <= 2 ? <p className="price-legend__flat" data-flat>{flatNote(spanned)}</p> : null}
      <div className="price-legend__swatches">{PRICE_BINS.map((b, i) => <span key={b.id} style={{ "--c": b.color } as CSSProperties} className={i === 0 ? "is-p0" : i === 6 ? "is-p6" : ""} />)}</div>
      <div className="price-legend__edges">{PRICE_BINS.map((b) => <span key={b.id}>{b.label}</span>)}</div>
      <p className="price-legend__unit">MODEL SHADOW PRICE · USD/MWH · BRIGHTER = DEARER</p>
    </div>
  );
}

/** S06 "Stress Lab" (interaction 7): five stepped scenarios over the dashed baseline ghost. */
export function S06Stress({ def }: { def: SceneDef }) {
  const [ms, retryM] = useArtifact(MODEL);
  const [rs, retryR] = useArtifact(RESULTS, false);
  const st = useSyncExternalStore(stress.subscribe, stress.get);
  const motion = useMotion();
  const vp = useViewport();
  const L = layout(vp.w, vp.h);
  const isM = vp.cls === "M";
  useProgress(def.id, (p) => { const k = stepState(stress.get().step, p, THRESH); if (k !== stress.get().step) stress.set({ step: k }); });
  const go = (k: number) => jumpTo(def.id, STRESS_P[k]);
  const key = (e: KeyboardEvent, k: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (d) { e.preventDefault(); const n = Math.max(0, Math.min(4, k + d)); go(n); (e.currentTarget.parentElement?.children[n] as HTMLElement | undefined)?.focus(); }
  };
  const m = ms.status === "ready" ? ms.data : null;
  const meta = (id: string) => m?.scenarios.find((s) => s.id === id);
  const data = useMemo(() => (m && rs.status === "ready" ? { base: scenarioState(m.bas[st.ba], rs.data, st.ba, st.dayId, "baseline"), all: STRESS_ORDER.map((id) => scenarioState(m.bas[st.ba], rs.data, st.ba, st.dayId, id)) } : null), [m, rs, st.ba, st.dayId]);
  const id = STRESS_ORDER[st.step]!;
  const cur = data?.all[st.step] ?? null;
  const ledger = (k: number) => data?.base && data.all[k] ? stressRows(data.base.r, data.all[k]!.r) : null;
  const rows = ledger(st.step);
  return (
    <Track id={def.id} height={def.track} landing={def.landing} className={`scene scene-${def.id}`} label="Stress: five scenarios">
      <SceneErrors id={def.id} specs={[MODEL, RESULTS] as ArtifactSpec<unknown>[]} />
      <div className="stress-text">
        <p className="scene-kicker">{copyS06.kicker}</p>
        <h2 id={`${def.id}-title`} tabIndex={-1} data-scene-heading className="stress-title" key={id}>{meta(id)?.label ?? def.title}</h2>
        <p className="stress-desc">{meta(id)?.description ?? ""}</p>
      </div>
      <ArtifactStatus file="dispatch_model.json" state={ms} retry={retryM} empty="NO SCENARIOS PUBLISHED">
        {(model) => (
          <ArtifactStatus file="dispatch_results.json" state={rs} retry={retryR} empty="NO RESULTS PUBLISHED">
            {() => (
              <>
                <div className="stress-controls">
                  <Radio label="GRID" value={st.ba} options={BAS} onChange={(ba) => stress.set({ ba, dayId: "summer" })} />
                  <Radio label="DAY" asSelect={isM} value={st.dayId} options={model.bas[st.ba].days.map((d) => d.id)} render={(d) => d.toUpperCase()} onChange={(dayId) => stress.set({ dayId })} />
                  <Radio label="LAYER" value={st.layer} options={["stack", "price"] as const} render={(l) => l.toUpperCase()} onChange={(layer) => stress.set({ layer })} />
                </div>
                {motion ? (
                  <>
                    <div className="stress-ledger" aria-live="polite">
                      {rows ? (
                        <ul className="ledger ledger--stress">
                          {rows.map((r) => <li key={r.label} className="is-in"><span className="ledger__label">{r.label}</span><span className="tnum" data-row={r.label}>{r.text}</span></li>)}
                        </ul>
                      ) : <p className="state-line state-line--empty">{copyS06.missing}</p>}
                      <p className="fill-footer">{copyS06.ghost} · EVERY NUMBER IS A PRECOMPUTED MODEL RESULT</p>
                    </div>
                    <div className="stress-stepper" role="tablist" aria-label="Scenario">
                      {STRESS_ORDER.map((sid, k) => (
                        <button key={sid} type="button" role="tab" aria-selected={k === st.step} tabIndex={k === st.step ? 0 : -1}
                          className={`chip-btn ${k === st.step ? "is-on" : ""}`} onClick={() => go(k)} onKeyDown={(e) => key(e, k)}>
                          {k + 1}<span className="sr-only"> {meta(sid)?.label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="stress-legend">{st.layer === "price" ? <PriceLegend spanned={cur ? binsSpanned(cur.r.price_usd_mwh, model.bas[st.ba].voll_usd_mwh) : undefined} /> : <StackKey keys={model.bas[st.ba].display_order} />}</div>
                    <div className="stress-chip"><HonestyChip tag="SIMULATED" detail={isM ? "MODEL · PRECOMPUTED" : "MODEL · PRECOMPUTED · PYTHON HiGHS"} /></div>
                    {cur ? (
                      <>
                        <RoseHit scene="stress" box={{ cx: L.G4.cx, cy: L.G4.cy, r: L.G4.fit + 12 }} label="Scenario rose. Enter or a click opens the hour inspector." />
                        <HourInspector scene="stress" content={(h) => inspectorSimulated(st.ba, model.bas[st.ba], cur.day, cur.D, cur.r, h)} />
                      </>
                    ) : null}
                  </>
                ) : (
                  <ol className="stress-list">
                    {STRESS_ORDER.map((sid, k) => {
                      const s = data?.all[k];
                      const lr = ledger(k);
                      return (
                        <li key={sid} className="stress-item">
                          <h3 className="stress-item__title">{meta(sid)?.label}</h3>
                          <p className="stress-desc">{meta(sid)?.description}</p>
                          {s && data?.base ? (
                            <Still className="stress-still" label={`${meta(sid)?.label}: model dispatch over the dashed baseline demand`} deps={[st.ba, st.dayId, sid, st.layer]} draw={(c, w, h) => {
                              const LL = layout(w, h, currentClass());
                              const R100 = dayR100(model.bas[st.ba], st.dayId, LL.G4);
                              const v = baseView(model.bas[st.ba].display_order, { cx: w * 0.5, cy: h * 0.5, R100: R100 * 0.85, rref: radius(Math.max(...s.D), R100), gap: LL.gap });
                              if (st.layer === "price") drawPriceRose(c, s.petals, v, s.bins, s.r.price_usd_mwh); else drawRose(c, s.petals, v);
                              drawGhostArcs(c, data.base!.D, v);
                            }} />
                          ) : <p className="state-line state-line--empty">{copyS06.missing}</p>}
                          {lr ? <ul className="ledger ledger--stress">{lr.map((r) => <li key={r.label} className="is-in"><span className="ledger__label">{r.label}</span><span className="tnum">{r.text}</span></li>)}</ul> : null}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </>
            )}
          </ArtifactStatus>
        )}
      </ArtifactStatus>
    </Track>
  );
}
