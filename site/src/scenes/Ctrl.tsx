import type { ArtifactSpec } from "../data/loader";
import { useCallback, useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Track } from "../scroll/Track";
import { HonestyChip } from "../components/HonestyChip";
import { StackKey } from "../components/StackKey";
import { ArtifactStatus, RetryButton, SceneErrors } from "../components/StateUI";
import { Radio } from "../components/Radio";
import { Sheet } from "../components/Sheet";
import { HourInspector, RoseHit } from "../components/HourInspector";
import { useArtifact } from "../data/useArtifact";
import { MODEL, RESULTS, VECTORS } from "../data/artifacts";
import { parityMissing, copyCtrl, ctrlLedger, flatNote, fmtControl, inspectorSimulated, parityLine, parityShort, statusLine } from "../data/copy";
import { ctrl } from "../state/scenes";
import { cancelSolve, getSolver, retrySolver, subscribeSolver } from "../state/solver";
import { nearestPreset, sameParams, setPreset, useLiveSolve } from "../state/lab";
import { percent } from "../data/loader";
import { fullParams, scenarioDemand } from "../model/lp";
import { int } from "../model/format";
import { binsSpanned, PRICE_BINS } from "../graphics/rose";
import { BAS, type BAModel, type Control, type Params, type RangeControl } from "../model/types";
import { useViewport } from "./useViewport";
import { LiveRose, liveLog } from "./LiveRose";
import type { SceneDef } from "../app/scenes";

/** TIME LIMIT choices (seconds): HiGHS time_limit. 1 µs stops these LPs on purpose ("Time limit reached"). */
const TIME_LIMITS = ["10", "0.000001"] as const;
const SLIDERS = ["renewables_scale", "demand_growth_pct", "heat_wave_c", "battery_power_mw", "battery_hours", "outage_pct"] as const;

function Slider({ c, value, onDraft, onCommit, release }: { c: RangeControl; value: number; onDraft: (v: number) => void; onCommit: (v: number) => void; release: boolean }) {
  const [draft, setDraft] = useState<number | null>(null);
  const v = draft ?? value;
  const fill = ((v - c.min) / (c.max - c.min)) * 100;
  const commit = () => { if (draft !== null) { onCommit(draft); setDraft(null); } };
  return (
    <label className="slider">
      <span className="slider__head"><span>{c.label.toUpperCase()}</span><span className="tnum">{fmtControl(c.unit, v)}</span></span>
      <input type="range" min={c.min} max={c.max} step={c.step} value={v} aria-valuetext={fmtControl(c.unit, v)} data-control={c.id}
        style={{ "--fillpct": `${fill}%` } as CSSProperties}
        onChange={(e) => { const x = Number(e.target.value); if (release) { setDraft(x); onDraft(x); } else onCommit(x); }}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </label>
  );
}

/** The rail: every visitor-set control (DR-6 ranges only), presets, layer, time limit, reset. */
function Controls({ m, p, onParams, onPreset, presetId, layer, setLayer, tl, setTl, onReset, release, isM }: {
  m: BAModel; p: Params; onParams: (p: Params) => void; onPreset: (id: string) => void; presetId: string | null;
  layer: "stack" | "price"; setLayer: (l: "stack" | "price") => void; tl: string; setTl: (t: string) => void; onReset: () => void; release: boolean; isM: boolean;
}) {
  const st = useSyncExternalStore(ctrl.subscribe, ctrl.get);
  const [resetDone, setResetDone] = useState(false);
  const ctl = (id: string) => m.controls.find((c) => c.id === id) as Control;
  const outage = ctl("outage_class") as Extract<Control, { kind: "enum" }>;
  return (
    <>
      <Radio label="GRID" value={st.ba} options={BAS} onChange={(ba) => onPreset(`grid:${ba}`)} />
      <Radio label="DAY" asSelect={isM} value={st.dayId} options={m.days.map((d) => d.id)} render={(d) => d.toUpperCase()} onChange={(d) => onPreset(`day:${d}`)} />
      <div className="seg-ctl" role="group" aria-label="Presets">
        <span className="seg-ctl__label" aria-hidden="true">PRESETS</span>
        <div className="seg-ctl__row">
          {m.scenarios.map((s) => <button key={s.id} type="button" className={`chip-btn ${presetId === s.id ? "is-on" : ""}`} aria-pressed={presetId === s.id} onClick={() => onPreset(s.id)}>{s.label.toUpperCase()}</button>)}
        </div>
      </div>
      {SLIDERS.filter((id) => id !== "outage_pct").map((id) => (
        <Slider key={id} c={ctl(id) as RangeControl} value={p[id]} release={release} onDraft={() => {}} onCommit={(v) => onParams({ ...p, [id]: v })} />
      ))}
      <label className="seg-ctl seg-ctl--select">
        <span className="seg-ctl__label">OUTAGE</span>
        <select value={p.outage_class} data-control="outage_class" onChange={(e) => onParams({ ...p, outage_class: e.target.value })}>
          {outage.options.map((o) => <option key={o} value={o}>{o === "none" ? "NONE" : (m.classes.find((c) => c.id === o)?.label ?? o).toUpperCase()}</option>)}
        </select>
      </label>
      {p.outage_class !== "none" ? <Slider c={ctl("outage_pct") as RangeControl} value={p.outage_pct} release={release} onDraft={() => {}} onCommit={(v) => onParams({ ...p, outage_pct: v })} /> : null}
      <Radio label="LAYER" value={layer} options={["stack", "price"] as const} render={(l) => l.toUpperCase()} onChange={setLayer} />
      <Radio label={copyCtrl.timeLimit} value={tl} options={TIME_LIMITS} render={(t) => (t === "10" ? "10 S" : "0.000001 S (TOO SHORT)")} onChange={setTl} />
      <button type="button" className="btn-square ctrl-reset" aria-live="polite" onClick={() => { onReset(); setResetDone(true); setTimeout(() => setResetDone(false), 1200); }}>
        {resetDone ? "RESET ✓" : "RESET"}
      </button>
    </>
  );
}

/** CTRL "The Control Room" (interaction 8): the free live simulation, normal flow, not pinned. */
export function Ctrl({ def }: { def: SceneDef }) {
  const [ms, retryM] = useArtifact(MODEL);
  const [rs, retryR] = useArtifact(RESULTS, false);
  const [vs] = useArtifact(VECTORS, false);
  const st = useSyncExternalStore(ctrl.subscribe, ctrl.get);
  const sv = useSyncExternalStore(subscribeSolver, getSolver);
  const vp = useViewport();
  const cls = vp.cls;
  const isM = cls === "M";
  const [layer, setLayer] = useState<"stack" | "price">("stack");
  const [sheet, setSheet] = useState(false);
  const m = ms.status === "ready" ? ms.data.bas[st.ba] : null;
  const results = rs.status === "ready" ? rs.data : null;
  useLiveSolve(ctrl, st, sv, { model: m, results });
  const tl = st.timeLimit === 0.000001 ? "0.000001" : "10";
  useEffect(() => { if (ctrl.get().timeLimit === undefined) ctrl.set({ timeLimit: 10 }); }, []);

  const onParams = useCallback((params: Params) => {
    if (!m) return;
    if (sv.status === "ready") { ctrl.set({ params, presetId: null }); return; }
    // the live solver is not ready: snap to the nearest precomputed preset (labelled PRECOMPUTED)
    if (results) setPreset(ctrl, m, results, st.ba, st.dayId, nearestPreset(m, params, m.controls.map((c) => c.id)).id);
  }, [m, sv.status, results, st.ba, st.dayId]);
  const onPreset = (id: string) => {
    if (!results || ms.status !== "ready") return;
    if (id.startsWith("grid:")) { const ba = id.slice(5) as "CISO" | "ERCO"; setPreset(ctrl, ms.data.bas[ba], results, ba, ms.data.bas[ba].days[0]!.id, "baseline"); return; }
    if (id.startsWith("day:")) { setPreset(ctrl, m!, results, st.ba, id.slice(4), "baseline"); return; }
    setPreset(ctrl, m!, results, st.ba, st.dayId, id);
  };
  const onReset = () => { if (results && ms.status === "ready") { setLayer("stack"); ctrl.set({ timeLimit: 10 }); setPreset(ctrl, ms.data.bas.CISO, results, "CISO", ms.data.bas.CISO.days[0]!.id, "baseline"); } };

  const r = st.result;
  const day = m?.days.find((d) => d.id === st.dayId);
  const base = results?.bas[st.ba].days[st.dayId]?.baseline ?? null;
  const status = statusLine({ status: sv.status, version: sv.version, pct: percent(sv.loaded, sv.total), source: st.source, ms: st.ms, parity: sv.parity, error: sv.error, solving: sv.solving });
  const sum = r ? Object.values(r.cost_breakdown_usd).reduce((a, b) => a + b, 0) : 0;
  const ledger = r ? ctrlLedger(r, base && st.params && m && !sameParams(st.params, fullParams(m)) ? base : null) : [];
  const E = st.params ? st.params.battery_power_mw * st.params.battery_hours : 0;
  const socMin = m ? m.battery.soc_min_frac * E : 0;
  const socPts = r && E > 0 ? r.battery.soc_mwh.map((s, i) => `${(i / 24) * 360},${(60 - ((s - socMin) / Math.max(1, E - socMin)) * 60).toFixed(1)}`).join(" ") : "";

  const controls = m && st.params ? (
    <Controls m={m} p={st.params} onParams={onParams} onPreset={onPreset} presetId={st.presetId} layer={layer} setLayer={setLayer} tl={tl}
      setTl={(t) => ctrl.set({ timeLimit: Number(t) })} onReset={onReset} release={isM} isM={isM} />
  ) : null;

  return (
    <Track id={def.id} height="auto" landing={0} className={`scene scene-${def.id}`} label="The Control Room">
      <SceneErrors id={def.id} specs={[MODEL, RESULTS, VECTORS] as ArtifactSpec<unknown>[]} />
      <div className="ctrl">
        <header className="ctrl-head">
          <p className="scene-kicker">{copyCtrl.kicker}</p>
          <h2 id={`${def.id}-title`} tabIndex={-1} data-scene-heading className="ctrl-title">{copyCtrl.line}</h2>
          <div className="ctrl-status" aria-live="polite">
            <p className={`state-line ${st.source === "browser" ? "" : "state-line--muted"}`} data-source={st.source}>{status}</p>
            {sv.solving ? <button type="button" className="btn-square" onClick={() => cancelSolve()}>CANCEL SOLVE</button> : null}
            {st.check ? <p className="state-line state-line--error" data-check>{st.check}</p> : null}
            {sv.status === "error" ? <RetryButton onClick={retrySolver} /> : null}
            {/* QA D-017: on desktop the cost = objective line is in view on landing (the full ledger is under the controls) */}
            {!isM && ledger[0] ? <p className="state-line tnum ctrl-cost-head" data-cost-head>{ledger[0].text}</p> : null}
            {sv.parity ? <p className="state-line parity">{isM ? parityShort(sv.parity) : parityLine(sv.parity)}</p> : vs.status === "error" ? <p className="state-line state-line--error" data-parity-missing>{parityMissing}</p> : null}
          </div>
        </header>
        <ArtifactStatus file="dispatch_model.json" state={ms} retry={retryM} empty="NO DISPATCH MODEL PUBLISHED">
          {() => (
            <ArtifactStatus file="dispatch_results.json" state={rs} retry={retryR} empty="NO PRECOMPUTED RESULTS">
              {() => (
                <>
                  <div className="ctrl-stage">
                    <LiveRose lab={ctrl} model={m} baseline={base} layer={layer} scene="control" />
                    <RoseHit scene="control" box={{ cx: 0, cy: 0, r: 0 }} getLog={() => liveLog.log}
                      label="Control room rose. Enter or a click opens the hour inspector; arrows step the hour." />
                    <div className="ctrl-chip">
                      {layer === "stack" && m ? <StackKey keys={m.display_order} /> : null}
                      <HonestyChip tag="SIMULATED" detail={st.source === "browser" ? "YOUR SCENARIO · SOLVED IN BROWSER" : "MODEL · PRECOMPUTED"} />
                    </div>
                  </div>
                  <div className="ctrl-side">
                    {isM ? (
                      <>
                        <button type="button" className="btn-square ctrl-open" onClick={() => setSheet(true)}>CONTROLS</button>
                        <Sheet open={sheet} onClose={() => setSheet(false)} title="Controls" className="ctrl-sheet" returnFocus={() => document.querySelector<HTMLElement>(".ctrl-open")}>{controls}</Sheet>
                      </>
                    ) : <div className="ctrl-rail">{controls}</div>}
                    {r ? (
                      <div className="ctrl-ledger">
                        <ul className="ctrl-lines" data-objective={r.objective_usd} data-breakdown-sum={sum}>
                          {(isM ? ledger.slice(0, 3) : ledger).map((l) => <li key={l.id} className="tnum" data-line={l.id}>{l.text}</li>)}
                        </ul>
                        {!isM && E > 0 ? (
                          <>
                            <p className="soc-cap is-in">MODEL BATTERY STATE OF CHARGE · 00 TO 24H · {int(socMin)} TO {int(E)} MWH</p>
                            <svg className="soc is-in" viewBox="-2 -4 364 68" role="img" aria-label="Model battery state of charge over the day">
                              <line x1="0" x2="360" y1="0" y2="0" className="soc__guide" /><line x1="0" x2="360" y1="60" y2="60" className="soc__guide" />
                              <polyline points={socPts} pathLength={1} className="soc__line" style={{ strokeDashoffset: 0 }} />
                            </svg>
                          </>
                        ) : null}
                        {layer === "price" ? (
                          <div className="price-legend" aria-label="Price bins">
                            {m && binsSpanned(r.price_usd_mwh, m.voll_usd_mwh) <= 2 ? <p className="price-legend__flat" data-flat>{flatNote(binsSpanned(r.price_usd_mwh, m.voll_usd_mwh))}</p> : null}
                            <div className="price-legend__swatches">{PRICE_BINS.map((b, i) => <span key={b.id} style={{ "--c": b.color } as CSSProperties} className={i === 0 ? "is-p0" : i === 6 ? "is-p6" : ""} />)}</div>
                            <div className="price-legend__edges">{PRICE_BINS.map((b) => <span key={b.id}>{b.label}</span>)}</div>
                          </div>
                        ) : null}
                        <p className="fill-footer">{copyCtrl.note}</p>
                      </div>
                    ) : null}
                  </div>
                  {m && day && r && st.params ? <HourInspector scene="control" content={(h) => inspectorSimulated(st.ba, m, day, scenarioDemand(m, day, st.params!), r, h)} /> : null}
                </>
              )}
            </ArtifactStatus>
          )}
        </ArtifactStatus>
      </div>
    </Track>
  );
}
