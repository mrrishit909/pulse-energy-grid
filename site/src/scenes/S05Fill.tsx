import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Track } from "../scroll/Track";
import { HonestyChip } from "../components/HonestyChip";
import { ArtifactStatus, RetryButton } from "../components/StateUI";
import { Radio } from "../components/Radio";
import { useArtifact } from "../data/useArtifact";
import { MODEL, RESULTS } from "../data/artifacts";
import { co2Line, copyS05, deltaLines, inspectorSimulated, ledgerLine, ledgerRows, parityLine, parityShort, statusLine, totalLine, unservedLine } from "../data/copy";
import { fill } from "../state/scenes";
import { getSolver, retrySolver, subscribeSolver } from "../state/solver";
import { nearestPreset, sameParams, setPreset as setLabPreset, useLiveSolve } from "../state/lab";
import { useMotion, useProgress } from "../scroll/hooks";
import { windowed } from "../motion/progress";
import { percent } from "../data/loader";
import { dayPeak, fullParams, scenarioDemand } from "../model/lp";
import { simulatedStack, petals } from "../model/stack";
import { drawHourLabels, drawRose, FUEL, radius, TOKEN } from "../graphics/rose";
import { int } from "../model/format";
import { BAS, type BA, type BAModel, type DispatchResults, type RangeControl } from "../model/types";
import { fitR100, layout } from "./geometry";
import { useViewport } from "./useViewport";
import { Still } from "./Still";
import { HourInspector, RoseHit } from "../components/HourInspector";
import { Sheet } from "../components/Sheet";
import { viewportClass } from "../graphics/canvas";
import type { SceneDef } from "../app/scenes";

const LAB = ["battery_power_mw", "battery_hours", "renewables_scale"] as const;
type LabId = (typeof LAB)[number];
/** Presets reachable with the three lab sliders alone (used while the live solver is not ready). */
const SNAP_PRESETS = ["baseline", "battery_big", "renewables_up"];
const setPreset = (m: BAModel, rs: DispatchResults, ba: BA, dayId: string, id: string) => setLabPreset(fill, m, rs, ba, dayId, id);

const fmtValue = (c: RangeControl, v: number) => (c.unit === "x" ? `×${v.toFixed(2)}` : `${int(v)} ${c.unit === "h" ? "H" : c.unit}`);

/** S05 "Fill the Day" (interaction 6): radial merit-order fill, the rim beat, then a live HiGHS lab. */
export function S05Fill({ def }: { def: SceneDef }) {
  const [ms, retryM] = useArtifact(MODEL);
  const [rs, retryR] = useArtifact(RESULTS, false);
  const f = useSyncExternalStore(fill.subscribe, fill.get);
  const sv = useSyncExternalStore(subscribeSolver, getSolver);
  const motion = useMotion();
  const vp = useViewport();
  const isM = viewportClass(vp.w) === "M";
  const L = layout(vp.w, vp.h);
  const [ph, setPh] = useState({ rows: 0, s2: false, live: false });
  const [draft, setDraft] = useState<Partial<Record<LabId, number>>>({});
  const soc = useRef<SVGPolylineElement>(null);
  const lab = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState(false);

  const m = ms.status === "ready" ? ms.data.bas[f.ba] : null;
  const n = m?.display_order.length ?? 9;
  useProgress(def.id, (p) => {
    const w = 0.52 / n;
    const rows = p < 0.08 ? 0 : Math.min(n, Math.floor((p - 0.08) / w) + 1);
    const next = { rows, s2: p > 0.66, live: p >= 0.7 };
    setPh((o) => (o.rows === next.rows && o.s2 === next.s2 && o.live === next.live ? o : next));
    if (soc.current) soc.current.style.strokeDashoffset = String(1 - windowed(p, 0.62, 0.7));
  });
  const show = motion ? ph : { rows: n, s2: true, live: true };
  // the lab is inert (not focusable) until it is live (p >= 0.7)
  useEffect(() => { if (lab.current) lab.current.inert = !show.live; });

  useLiveSolve(fill, f, sv, { model: m, results: rs.status === "ready" ? rs.data : null });

  const change = (id: LabId, v: number) => {
    if (!m || !f.params) return;
    const params = { ...f.params, [id]: v };
    if (sv.status === "ready") { fill.set({ params, presetId: null }); return; }
    // solver not ready: snap to the nearest precomputed preset (VISUAL_DESIGN S05 states)
    if (rs.status === "ready") setPreset(m, rs.data, f.ba, f.dayId, nearestPreset(m, params, LAB, SNAP_PRESETS).id);
  };
  const commit = (id: LabId) => { const v = draft[id]; if (v !== undefined) { setDraft((d) => ({ ...d, [id]: undefined })); change(id, v); } };

  const day = m?.days.find((d) => d.id === f.dayId);
  const r = f.result;
  const base = rs.status === "ready" ? rs.data.bas[f.ba].days[f.dayId]?.baseline ?? null : null;
  const isBaseline = !!(m && f.params && sameParams(f.params, fullParams(m)));
  const pct = percent(sv.loaded, sv.total);
  const status = statusLine({ status: sv.status, version: sv.version, pct, source: f.source, ms: f.ms, parity: sv.parity, error: sv.error, solving: sv.solving });

  const ledger = m && day && r ? ledgerRows(m, day, r) : [];
  const E = m && f.params ? f.params.battery_power_mw * f.params.battery_hours : 0;
  const socMin = m ? m.battery.soc_min_frac * E : 0;
  const socPts = r && E > 0 ? r.battery.soc_mwh.map((s, i) => `${(i / 24) * 360},${(60 - ((s - socMin) / Math.max(1, E - socMin)) * 60).toFixed(1)}`).join(" ") : "";

  return (
    <Track id={def.id} height={def.track} landing={def.landing} className={`scene scene-${def.id}`} label="Dispatch: fill the day">
      <div className="fill-text">
        <h2 id={`${def.id}-title`} tabIndex={-1} data-scene-heading className="scene-statement" key={show.s2 ? "s2" : "s1"}>{show.s2 ? copyS05.s2 : copyS05.s1}</h2>
      </div>
      <ArtifactStatus file="dispatch_model.json" state={ms} retry={retryM} empty="NO DISPATCH MODEL PUBLISHED">
        {(data) => (
          <>
            <div ref={lab} className={`fill-lab ${show.live ? "is-live" : ""}`}>
              <div className="fill-lab__row">
                <Radio label="GRID" value={f.ba} options={BAS} onChange={(ba) => rs.status === "ready" && setPreset(data.bas[ba], rs.data, ba, ba === "CISO" ? "summer" : "summer", "baseline")} />
                <Radio label="DAY" asSelect={isM} value={f.dayId} options={data.bas[f.ba].days.map((d) => d.id)} render={(id) => id.toUpperCase()}
                  onChange={(dayId) => rs.status === "ready" && setPreset(data.bas[f.ba], rs.data, f.ba, dayId, "baseline")} />
              </div>
              {LAB.map((id) => {
                const c = data.bas[f.ba].controls.find((x) => x.id === id) as RangeControl;
                const v = draft[id] ?? f.params?.[id] ?? c.default;
                return (
                  <label key={id} className="slider">
                    <span className="slider__head"><span>{c.label.toUpperCase()}</span><span className="tnum">{fmtValue(c, v)}</span></span>
                    <input type="range" min={c.min} max={c.max} step={c.step} value={v} aria-valuetext={fmtValue(c, v)}
                      onChange={(e) => { const x = Number(e.target.value); if (isM) setDraft((d) => ({ ...d, [id]: x })); else change(id, x); }}
                      onPointerUp={() => isM && commit(id)} onKeyUp={() => isM && commit(id)} onBlur={() => isM && commit(id)} />
                  </label>
                );
              })}
              <div className="fill-lab__row">
                {!isBaseline ? <button type="button" className="text-btn" onClick={() => rs.status === "ready" && setPreset(data.bas[f.ba], rs.data, f.ba, f.dayId, "baseline")}>RESET</button> : null}
              </div>
            </div>
            <div className="fill-ledger">
              <ArtifactStatus file="dispatch_results.json" state={rs} retry={retryR} empty="NO PRECOMPUTED RESULTS PUBLISHED">
                {() => r ? (
                  <>
                    {!isM ? (
                      <ul className="ledger" aria-label="Dispatch ledger, centre outward">
                        {ledger.map((row, k) => {
                          const tk = FUEL[TOKEN[row.key] ?? "other"]!; const l = ledgerLine(row);
                          return (
                            <li key={row.key} className={k < show.rows ? "is-in" : ""}>
                              <span className="swatch" style={{ "--c0": tk.c0, "--c1": tk.c1 } as CSSProperties} aria-hidden="true" />
                              <span className="ledger__label">{row.label}</span><span className="tnum">{l.mwh}</span><span className="tnum ledger__cost">{l.cost}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    <p className={`ledger-total tnum ${show.rows >= n ? "is-in" : ""}`} data-objective={r.objective_usd}>{totalLine(r)} <span aria-label="checked">✓</span></p>
                    <p className={`readout-line tnum ${show.rows >= n ? "is-in" : ""}`}>{co2Line(r)}</p>
                    {unservedLine(r) ? <p className="readout-line readout-line--warn tnum">{unservedLine(r)}</p> : null}
                    {isM ? <p className="readout-line tnum">MODEL BATTERY SHIFTED {int(r.battery.discharge_mw.reduce((a, b) => a + b, 0))} MWH</p> : null}
                    {isM ? (
                      <>
                        <button type="button" className="text-btn fill-ledger-open" onClick={() => setSheet(true)}>FULL LEDGER</button>
                        <Sheet open={sheet} onClose={() => setSheet(false)} title="Dispatch ledger" returnFocus={() => document.querySelector<HTMLElement>(".fill-ledger-open")}>
                          <ul className="ledger ledger--sheet" aria-label="Dispatch ledger, centre outward">
                            {ledger.map((row) => { const l = ledgerLine(row); return <li key={row.key} className="is-in"><span className="ledger__label">{row.label}</span><span className="tnum">{l.mwh}</span><span className="tnum">{l.cost}</span></li>; })}
                          </ul>
                          <p className="readout-line tnum">{totalLine(r)} ✓</p>
                          <p className="fill-footer">{copyS05.footer(data.bas[f.ba])}</p>
                        </Sheet>
                      </>
                    ) : null}
                    {E > 0 ? <p className={`soc-cap ${show.rows >= n ? "is-in" : ""}`}>MODEL BATTERY STATE OF CHARGE · 00 TO 24H · {int(socMin)} TO {int(E)} MWH</p> : null}
                    {E > 0 ? (
                      <svg className={`soc ${show.rows >= n ? "is-in" : ""}`} viewBox="-2 -4 364 68" role="img" aria-label="Model battery state of charge over the day">
                        <line x1="0" x2="360" y1="0" y2="0" className="soc__guide" /><line x1="0" x2="360" y1="60" y2="60" className="soc__guide" />
                        <polyline ref={soc} points={socPts} pathLength={1} className="soc__line" style={{ strokeDashoffset: motion ? undefined : 0 }} />
                      </svg>
                    ) : null}
                    {show.live && base && !isBaseline ? <ul className="deltas">{deltaLines(r, base).map((d) => <li key={d} className="tnum">{d}</li>)}</ul> : null}
                    <p className="fill-footer">{copyS05.footer(data.bas[f.ba])}</p>
                  </>
                ) : null}
              </ArtifactStatus>
            </div>
            <div className="fill-status" aria-live="polite">
              <div className="fill-chip">
                {show.rows > 0 && r ? <HonestyChip tag="SIMULATED" detail={f.source === "browser" ? "MODEL · SOLVED IN BROWSER" : "MODEL · PRECOMPUTED"} /> : <HonestyChip tag="OBSERVED" detail="EIA-930 DEMAND" />}
              </div>
              <p className={`state-line ${f.source === "browser" ? "" : "state-line--muted"}`} data-source={f.source}>{status}</p>
              {f.check ? <p className="state-line state-line--error">{f.check}</p> : null}
              {sv.status === "error" ? <RetryButton onClick={retrySolver} /> : null}
              {sv.parity ? <p className="state-line parity" data-parity-passed={sv.parity.passed} data-parity-n={sv.parity.n} data-parity-hash={sv.parity.hash}>{isM ? parityShort(sv.parity) : parityLine(sv.parity)}</p>
                : sv.status === "ready" ? <p className="state-line state-line--muted">PARITY CHECK RUNNING ON THIS BUILD</p> : null}
            </div>
            {motion && m && day && r && f.params && show.live ? (
              <>
                <RoseHit scene="dispatch" box={{ cx: L.G4.cx, cy: L.G4.cy, r: L.G4.fit + 12 }}
                  label="Model dispatch rose. Enter or a click opens the hour inspector; arrows step the hour." />
                <HourInspector scene="dispatch" content={(h) => inspectorSimulated(f.ba, m, day, scenarioDemand(m, day, f.params!), r, h)} />
              </>
            ) : null}
            {!motion && m && day && r && f.params ? (
              <Still className="fill-still" label="Model dispatch of the day, filled in merit order" deps={[f.resultSeq, f.ba, f.dayId]} draw={(ctx, w, h) => {
                const LL = layout(w, h, viewportClass(innerWidth));
                const D = scenarioDemand(m, day, f.params!);
                const s = simulatedStack(m.display_order, day, D, r);
                const peak = Math.max(...D);
                const R4 = fitR100(LL.G4, dayPeak(m, day));
                const v = { cx: LL.G4.cx, cy: LL.G4.cy, R100: R4, rref: radius(peak, R4), gap: LL.gap, ghost: 0.08, bands: 1, marks: 1, beat: 0, lift: null, liftT: 0, glow: LL.glow, keys: s.keys };
                const ps = petals(s, () => 1);
                drawRose(ctx, ps, v);
                drawHourLabels(ctx, ps, v, LL.label, 0.7);
              }} />
            ) : null}
          </>
        )}
      </ArtifactStatus>
    </Track>
  );
}
