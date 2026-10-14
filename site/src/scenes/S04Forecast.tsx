import { biteEnd } from "./S03bBite";
import { drawRose, FUEL, radius, TOKEN, type Ctx } from "../graphics/rose";
import { sceneLayout } from "./geometry";
import { RoseSlot, useSceneLayout } from "./RoseSlot";
import type { ArtifactSpec } from "../data/loader";
import { useMemo, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { Track } from "../scroll/Track";
import { HonestyChip } from "../components/HonestyChip";
import { ArtifactStatus, SceneErrors } from "../components/StateUI";
import { Radio } from "../components/Radio";
import { useArtifact } from "../data/useArtifact";
import { useNear } from "../scroll/useNear";
import { EVAL, FACTS, SAMPLES, FUEL_MIX, DEMAND } from "../data/artifacts";
import { biasLine, calendarCaption, copyS04, coverageLine, MODEL_LABEL, verdict, weekStats } from "../data/copy";
import { store } from "../state/store";
import { useMotion, useProgress } from "../scroll/hooks";
import { getStore } from "../data/loader";
import { stepState, windowed } from "../motion/progress";
import { Tween } from "../motion/tween";
import { DUR, easeSymmetric } from "../motion/ease";
import { clamp } from "../lib/math";
import { fixed, int } from "../model/format";
import { drawAxis, drawBand, drawBars, drawSeries, drawUnroll, leaveT, px, STYLE, type Plot } from "../graphics/week";
import { BAS, type BA, type ForecastSamples, type Week } from "../model/types";
import { baseView, registerFrame } from "./director";
import { fitR100, layout } from "./geometry";
import { useViewport } from "./useViewport";
import { Still } from "./Still";
import { currentClass } from "../graphics/canvas";
import { motionEnabled } from "../state/motion";
import type { SceneDef } from "../app/scenes";

export type SeriesId = "seasonal_naive" | "eia_day_ahead" | "gbm" | "best";
export const forecast = store({
  ba: "CISO" as BA, week: 0, interval: "cqr" as "raw" | "cqr", hidden: [] as SeriesId[], hover: null as number | null, mDay: 0,
});
/** Stepped models (hysteresis +-0.02): 0 none, 1 naive, 2 + EIA, 3 + ours (and the best model if it is not ours). */
const STEPS = [0.55, 0.68, 0.8];
const fstate = { step: 0, revealAt: {} as Record<string, number> };

const days = (w: Week) => Array.from({ length: 7 }, (_, d) => w.ts_local[d * 24]!.slice(5, 10).replace("-", "."));
const seriesOf = (w: Week, id: SeriesId) => (id === "seasonal_naive" ? w.naive_mw : id === "eia_day_ahead" ? w.eia_mw : id === "gbm" ? w.gbm_mw : w.best_mw);
const slice = <T,>(a: T[], first: number, n: number) => a.slice(first, first + n);
/** The series shown at a step; `best` only when the best deployable model is not ours (ERCO: EIA bias-corrected). */
export function seriesAt(step: number, bestModel: string): SeriesId[] {
  const out: SeriesId[] = [];
  if (step >= 1) out.push("seasonal_naive");
  if (step >= 2) out.push("eia_day_ahead");
  if (step >= 3) { out.push("gbm"); if (bestModel !== "gbm") out.push("best"); }
  return out;
}

/** Everything the plot needs for the current store state (one day on M, the week elsewhere). */
function plotData(fs: ForecastSamples, st: ReturnType<typeof forecast.get>, M: boolean) {
  const b = fs.bas[st.ba];
  const w = b.weeks[st.week]!;
  const first = M ? st.mDay * 24 : 0, n = M ? 24 : 168;
  const s = <T,>(a: T[]) => slice(a, first, n);
  const lo = st.interval === "raw" ? w.gbm_p10_mw : w.gbm_p10_cqr_mw, hi = st.interval === "raw" ? w.gbm_p90_mw : w.gbm_p90_cqr_mw;
  const vals = [...s(w.actual_mw), ...s(w.eia_mw), ...s(w.naive_mw), ...s(hi)].filter((v): v is number => v !== null);
  return { b, w, first, n, actual: s(w.actual_mw), lo: s(lo), hi: s(hi), ymax: Math.max(...vals) * 1.06, series: (id: SeriesId) => s(seriesOf(w, id)) };
}

// ------------------------------------------------------------------ the canvas frame
const ytw = new Tween(1, DUR.panel, easeSymmetric);
let ykey = "";
registerFrame("forecast", ({ now, p, L, W, H }) => {
  const fsS = getStore(SAMPLES).state;
  if (fsS.status !== "ready") return null;
  const st = forecast.get();
  const M = currentClass() === "M";
  const d = plotData(fsS.data, st, M);
  const key = `${st.ba}|${st.week}|${st.mDay}|${st.interval}`;
  if (key !== ykey) { ykey = key; ytw.retarget(d.ymax, now, ytw.value === 1 || !motionEnabled() ? 0 : DUR.panel); }
  ytw.update(now);
  const plot: Plot = { ...L.week, hours: d.n, ymax: ytw.value };
  const motion = motionEnabled();
  const step = motion ? stepState(fstate.step, p, STEPS) : 3;
  if (step !== fstate.step) {
    for (const id of seriesAt(step, d.b.best_model)) if (!(id in fstate.revealAt)) fstate.revealAt[id] = now;
    for (const id of Object.keys(fstate.revealAt)) if (!seriesAt(step, d.b.best_model).includes(id as SeriesId)) delete fstate.revealAt[id];
    fstate.step = step;
  }
  const t = motion ? easeSymmetric(windowed(p, 0.08, 0.4)) : 1;
  const rise = motion ? windowed(p, 0.4, 0.46) : 1;
  const line = motion ? windowed(p, 0.46, 0.52) : 1;
  // QA D-002: S04 opens on the S03b rose exactly as that scene ended (no grey silhouette), and unrolls it into the week
  // on phones S03b and S04 have their own slots: the rose eases from S03b's over the first 3% (seam kept at p = 0)
  const b0 = biteEnd(sceneLayout("netload", W, H)), b1 = biteEnd(L);
  const ee = motion && b0 && b1 ? easeSymmetric(clamp(p / 0.03)) : 1;
  const bt = b0 && b1 ? { ...b1, view: { ...b1.view, cx: b0.view.cx + (b1.view.cx - b0.view.cx) * ee, cy: b0.view.cy + (b1.view.cy - b0.view.cy) * ee, R100: b0.view.R100 + (b1.view.R100 - b0.view.R100) * ee, rref: b0.view.rref + (b1.view.rref - b0.view.rref) * ee } } : b0;
  const startR = bt ? bt.petals.map((q) => radius(Math.min(q.served, q.demand), bt.view.R100)) : undefined;
  const peak = Math.max(...(slice(d.w.actual_mw, d.first, 24).filter((v) => v !== null) as number[]));
  const R100 = fitR100(L.G3, peak);
  const view = bt?.view ?? baseView(["actual"], { cx: L.G3.cx, cy: L.G3.cy, R100, rref: Math.max(1, Math.sqrt(peak / 1e5) * R100), gap: 0, ghost: 0, marks: 0 });
  // QA D-023: S04 opens without the removed-area outline (in month means it drew as a guide ring)
  const runs = bt ? bt.petals.map((q) => { const top = Math.min(q.served, q.demand); return q.bands.map(([i0, o0], k) => { const f = FUEL[TOKEN[bt.view.keys[k]!] ?? "other"]!; return [radius(Math.min(i0, top), bt.view.R100), radius(Math.min(o0, top), bt.view.R100), f.c0, f.c1] as [number, number, string, string]; }).filter((b) => b[1] > b[0]); }) : undefined;
  const label = L.label;
  const dayLabels = M ? [days(d.w)[st.mDay]!] : days(d.w);
  const shown = seriesAt(step, d.b.best_model).filter((id) => !st.hidden.includes(id));
  const anim = shown.some((id) => now - (fstate.revealAt[id] ?? -1e9) < 800);
  // QA D-033: the week plot stays until the last 2% so the S04 to S05 hand-off has no blank run
  const fade = motion ? 1 - windowed(p, 0.98, 1) : 1;
  return {
    // before the unroll: the S03b rose itself, so the scene change is seamless (1px seam test)
    petals: p < 0.08 && motion && bt ? bt.petals : null, view, labels: p < 0.08 && bt && ee >= 1 ? 0.7 : 0, /* QA D-036: no hour labels while a phone eases between slots */ bloom: 0, glow: null, sky: null, opacity: fade,
    extra: (c) => {
      if (p < 0.08 && motion) return;
      if (t < 1) {
        // the stack rose hands over to its own petals within the first quarter of the unroll; the petals separate as they leave
        // each petal stays in the stack rose until its turn, then leaves as its own piece (no crossfade, no hub)
        if (bt) {
          // a leaving petal leaves its core (0.3 of its radius) in the rose, so no empty wedge ever reaches the centre;
          // the core fades once every petal has left
          const cap = new Map(bt.petals.filter((q) => leaveT(t, q.hour) > 0).map((q) => [q.hour, 0.3 * (startR?.[q.hour] ?? 0)] as const));
          const coreA = 1 - clamp((t - 0.3) / 0.1);
          if (coreA > 0) drawRose(c as unknown as Ctx, bt.petals, { ...bt.view, marks: 0, ghost: 0, bands: coreA, cap });
        }
        drawUnroll(c, d.actual, view, plot, t, 0, startR, 1, runs);
        drawAxis(c, plot, dayLabels, label, t);
        return;
      }
      drawAxis(c, plot, dayLabels, label, 1);
      // bars (day 1 already unrolled; the other days rise), then the actual line draws while the bars fade
      const barsA = 1 - line;
      if (barsA > 0) {
        drawBars(c, d.actual, plot, 0, 24, () => 1, barsA);
        if (!M) drawBars(c, d.actual, plot, 24, 168, (i) => clamp(rise * 1.6 - (i - 24) / 144 * 0.6), barsA);
      }
      if (line > 0) drawSeries(c, d.actual, plot, STYLE.actual!, line);
      const rev = (id: string) => clamp((now - (fstate.revealAt[id] ?? -1e9)) / 800);
      if (shown.includes("gbm")) drawBand(c, d.lo, d.hi, plot, rev("gbm"));
      for (const id of shown) drawSeries(c, d.series(id), plot, STYLE[id]!, rev(id));
      if (st.hover !== null && line >= 1) {
        const X = px(plot, st.hover) + (plot.x1 - plot.x0) / plot.hours / 2;
        c.fillStyle = "rgba(255,255,255,0.5)"; c.fillRect(Math.round(X), plot.y0, 1, plot.y1 - plot.y0);
      }
    },
    sig: `forecast|${key}|${bt ? `${bt.view.cx.toFixed(1)},${bt.view.R100.toFixed(1)},${bt.net}` : "-"}|${p.toFixed(4)}|${ytw.value.toFixed(1)}|${step}|${shown.join()}|${anim ? now.toFixed(0) : 0}|${st.hover}`,
  };
});

/** S04 "Tomorrow, Unrolled" (interaction 5). */
export function S04Forecast({ def }: { def: SceneDef }) {
  const near = useNear(def.id);
  const [fsS, retryS] = useArtifact(SAMPLES, near);
  const [feS, retryE] = useArtifact(EVAL, near);
  const [factsS] = useArtifact(FACTS);
  // S04 opens on the S03b rose (QA D-002): its inputs load with this scene too, for direct jumps
  const [fmIn] = useArtifact(FUEL_MIX, near); const [dpIn] = useArtifact(DEMAND, near);
  const biteReady = fmIn.status === "ready" && dpIn.status === "ready";
  const st = useSyncExternalStore(forecast.subscribe, forecast.get);
  const motion = useMotion();
  const vp = useViewport();
  const L = useSceneLayout(def.id);
  const M = vp.cls === "M";
  const [ph, setPh] = useState({ step: 0, verdict: false, live: false });
  useProgress(def.id, (p) => {
    const next = { step: stepState(ph.step, p, STEPS), verdict: p >= 0.86, live: p >= 0.52 };
    setPh((o) => (o.step === next.step && o.verdict === next.verdict && o.live === next.live ? o : next));
  });
  const show = motion ? ph : { step: 3, verdict: true, live: true };
  const fs = fsS.status === "ready" ? fsS.data : null, fe = feS.status === "ready" ? feS.data : null;
  const d = fs ? plotData(fs, st, M) : null;
  const ws = d ? weekStats(d.w, st.interval) : null;
  const toggles = d ? seriesAt(3, d.b.best_model) : [];
  const verdicts = useMemo(() => (fe ? BAS.map((ba) => verdict(fe, ba)) : []), [fe]);
  const hoverAt = (e: PointerEvent<HTMLDivElement>) => {
    if (!d) return;
    const r = e.currentTarget.getBoundingClientRect();
    forecast.set({ hover: clamp(Math.floor(((e.clientX - r.left) / r.width) * d.n), 0, d.n - 1) });
  };
  const key = (e: KeyboardEvent) => {
    const k = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (k && d) { e.preventDefault(); forecast.set({ hover: clamp((st.hover ?? 0) + k, 0, d.n - 1) }); }
  };
  const hv = st.hover !== null && d ? st.hover : null;
  const valAt = (a: (number | null)[]) => (hv === null ? null : a[hv]);
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "n/a" : `${int(v)} MW`);
  return (
    <Track id={def.id} height={def.track} landing={def.landing} className={`scene scene-${def.id}`} label="Forecast: tomorrow, unrolled">
      <SceneErrors id={def.id} specs={[SAMPLES, EVAL, FACTS, FUEL_MIX, DEMAND] as ArtifactSpec<unknown>[]} />
      <RoseSlot scene={def.id} slot="week" />
      <div className="fc-text">
        <h2 id={`${def.id}-title`} tabIndex={-1} data-scene-heading className="scene-statement">{copyS04.statement}</h2>
        <p className="scene-kicker">FORECAST · {st.ba} · {d ? `${d.w.label.toUpperCase()} (${d.w.ts_local[0]!.slice(0, 10)})` : ""}</p>
      </div>
      <ArtifactStatus file="forecast_samples.json" state={fsS} retry={retryS} empty="NO TEST WEEKS PUBLISHED">
        {(data) => (
          <>
            <div className={`fc-controls ${show.live ? "is-live" : ""}`}>
              <Radio label="GRID" value={st.ba} options={BAS} onChange={(ba) => forecast.set({ ba, week: 0, hover: null })} />
              <Radio label="WEEK" asSelect={M} value={String(st.week)} options={data.bas[st.ba].weeks.map((_, i) => String(i))}
                render={(i) => data.bas[st.ba].weeks[Number(i)]!.label.toUpperCase()} onChange={(i) => forecast.set({ week: Number(i), hover: null })} />
              <Radio label="INTERVAL" value={st.interval} options={["raw", "cqr"] as const} render={(v) => (v === "raw" ? "RAW" : "CONFORMAL")} onChange={(interval) => forecast.set({ interval })} />
              <div className="seg-ctl" role="group" aria-label="Models shown">
                <span className="seg-ctl__label" aria-hidden="true">MODELS</span>
                <div className="seg-ctl__row">
                  {toggles.map((id) => {
                    const on = !st.hidden.includes(id);
                    return <button key={id} type="button" className={`chip-btn ${on ? "is-on" : ""}`} aria-pressed={on}
                      onClick={() => forecast.set({ hidden: on ? [...st.hidden, id] : st.hidden.filter((x) => x !== id) })}>
                      {id === "best" ? "EIA BIAS-CORRECTED" : id === "gbm" ? "OURS" : id === "eia_day_ahead" ? "EIA" : "NAIVE"}</button>;
                  })}
                </div>
              </div>
            </div>
            {M ? (
              <div className={`fc-days ${show.verdict ? "is-off" : ""}`} role="tablist" aria-label="Day of the week">
                {Array.from({ length: 7 }, (_, i) => (
                  <button key={i} type="button" role="tab" aria-selected={st.mDay === i} className={`chip-btn ${st.mDay === i ? "is-on" : ""}`}
                    onClick={() => forecast.set({ mDay: i, hover: null })}>{d ? days(d.w)[i] : i + 1}</button>
                ))}
              </div>
            ) : null}
            <p className={`fc-legend ${show.live ? "is-in" : ""}`}>{copyS04.legend}{d && d.b.best_model !== "gbm" ? " · EIA BIAS-CORRECTED ─·" : ""}</p>
            {motion ? <div className="fc-hit" role="img" tabIndex={0} aria-label="Week plot: arrow keys move the crosshair hour" style={{ left: L.week.x0, top: L.week.y0, width: L.week.x1 - L.week.x0, height: L.week.y1 - L.week.y0 }}
              onPointerMove={hoverAt} onPointerLeave={() => forecast.set({ hover: null })} onKeyDown={key} /> : null}
            {d && ws ? (
              <div className={`fc-readout ${show.live ? "is-in" : ""} ${show.verdict ? "is-verdict" : ""}`} aria-live="polite">
                {hv !== null ? (
                  <ul className="fc-hover tnum">
                    <li>{d.w.ts_local[d.first + hv]!.replace("T", " ")} LOCAL</li>
                    <li>ACTUAL {fmt(valAt(d.actual))}</li>
                    <li>EIA {fmt(valAt(d.series("eia_day_ahead")))}</li>
                    <li>NAIVE {fmt(valAt(d.series("seasonal_naive")))}</li>
                    <li>OURS P50 {fmt(valAt(d.series("gbm")))} · P10-P90 {fmt(valAt(d.lo))} TO {fmt(valAt(d.hi))}</li>
                  </ul>
                ) : (
                  <ul className="fc-hover tnum">
                    {(["seasonal_naive", "eia_day_ahead", "gbm"] as const).filter((_, i) => i < show.step).map((id) => (
                      <li key={id}>THIS WEEK MAPE {MODEL_LABEL[id]} {ws.mape[id] === null ? "n/a" : `${fixed(ws.mape[id]!, 2)}%`}</li>
                    ))}
                    {show.step >= 3 && fe ? <li className="fc-cov">{coverageLine(fe, st.ba, st.interval, ws).week}</li> : null}
                    {show.step >= 3 && fe ? <li className="fc-cov">{coverageLine(fe, st.ba, st.interval, ws).whole}</li> : null}
                    {ws.missing ? <li>{ws.missing} HOURS WITHOUT A CLEAN ACTUAL (EXCLUDED FROM METRICS)</li> : null}
                  </ul>
                )}
                <div className="fc-chips"><HonestyChip tag="OBSERVED" detail={M ? "ACTUAL" : "ACTUAL, EIA-930"} /><HonestyChip tag="PREDICTED" detail="FORECASTS" /></div>
              </div>
            ) : null}
            <ArtifactStatus file="forecast_eval.json" state={feS} retry={retryE} empty="NO EVALUATION PUBLISHED">
              {(e) => (
                <div className={`fc-verdict ${show.verdict ? "is-in" : ""}`}>
                  {verdicts.map((v) => {
                    const cal = calendarCaption(data, v.ba);
                    const dt = data.bas[v.ba].daily_test;
                    return (
                      <article key={v.ba} className="fc-card" data-ba={v.ba} data-beats={v.beats}>
                        <h3 className="fc-card__serif">{v.serif}</h3>
                        <p className="fc-card__mono tnum">{v.mono}</p>
                        <p className="fc-card__basis">{v.basis}</p>
                        {v.ba === "CISO" && !M && factsS.status === "ready" ? <p className="fc-card__bias" data-bias>{biasLine(factsS.data, e)}</p> : null}
                        {!M ? (
                          <div className="fc-cal" aria-label={cal.text}>
                            {dt.date.map((dd, i) => { const g = dt.mape_gbm[i] ?? null, ee = dt.mape_eia[i] ?? null; const ours = g !== null && ee !== null && g < ee; return <i key={dd} className={ours ? "is-ours" : ""} title={`${dd}: OURS ${g === null ? "n/a" : fixed(g, 2)}% · EIA ${ee === null ? "n/a" : fixed(ee, 2)}%`} />; })}
                          </div>
                        ) : null}
                        <p className="fc-card__basis tnum">{cal.text} · <HonestyChip tag="DERIVED" className="chip--inline" /></p>
                      </article>
                    );
                  })}
                  {/* QA D-009: on phones the CISO drift note sits under both cards, so CISO and ERCO keep equal space */}
                  {M && factsS.status === "ready" ? <p className="fc-card__bias fc-verdict__note" data-bias>{biasLine(factsS.data, e)}</p> : null}
                </div>
              )}
            </ArtifactStatus>
            {d ? (
              <details className="fc-table">
                <summary>→ {copyS04.table}</summary>
                <table>
                  <thead><tr><th>LOCAL HOUR</th><th>ACTUAL</th><th>EIA</th><th>NAIVE</th><th>OURS P50</th><th>P10</th><th>P90</th></tr></thead>
                  <tbody>{d.w.ts_local.map((t, i) => (
                    <tr key={t}><td>{t.replace("T", " ")}</td>{[d.w.actual_mw, d.w.eia_mw, d.w.naive_mw, d.w.gbm_mw, st.interval === "raw" ? d.w.gbm_p10_mw : d.w.gbm_p10_cqr_mw, st.interval === "raw" ? d.w.gbm_p90_mw : d.w.gbm_p90_cqr_mw].map((a, k) => <td key={k}>{a[i] === null ? "n/a" : int(a[i]!)}</td>)}</tr>
                  ))}</tbody>
                </table>
              </details>
            ) : null}
            {!motion && d ? (
              <div className="fc-still-strip">
                {[0, 0.5, 1].map((tt) => (
                  <Still key={tt} className="fc-still" label={tt === 0 ? "The net-load rose from the last scene" : tt === 1 ? "The week as bars" : "Half unrolled"} deps={[st.ba, st.week, tt, biteReady]} draw={(c, w, h) => {
                    const LL = layout(w, h, currentClass());
                    const g = c as unknown as CanvasRenderingContext2D;
                    const b0 = biteEnd(LL);
                    if (!b0 && tt < 1) return; // the opening and the unroll start from the S03b rose; drawn once it has loaded
                    const plot: Plot = { ...LL.week, hours: d.n, ymax: d.ymax };
                    if (b0 && tt === 0) { drawRose(c, b0.petals, { ...b0.view, ghost: 0, marks: 0 }); return; }
                    const peak = Math.max(...(d.actual.slice(0, 24).filter((v) => v !== null) as number[]));
                    const rose = b0 ? b0.view : { cx: LL.G3.cx, cy: LL.G3.cy, R100: fitR100(LL.G3, peak) };
                    const sr = b0 ? b0.petals.map((q) => radius(Math.min(q.served, q.demand), b0.view.R100)) : undefined;
                    const rn = b0 ? b0.petals.map((q) => { const top = Math.min(q.served, q.demand); return q.bands.map(([i0, o0], k) => { const f = FUEL[TOKEN[b0.view.keys[k]!] ?? "other"]!; return [radius(Math.min(i0, top), b0.view.R100), radius(Math.min(o0, top), b0.view.R100), f.c0, f.c1] as [number, number, string, string]; }).filter((b) => b[1] > b[0]); }) : undefined;
                    if (b0 && sr && tt < 0.6) drawRose(c, b0.petals, { ...b0.view, marks: 0, ghost: 0, bands: 1 - clamp((tt - 0.35) / 0.25), cap: new Map(b0.petals.filter((q) => leaveT(tt, q.hour) > 0).map((q) => [q.hour, 0.3 * sr[q.hour]!] as const)) });
                    drawUnroll(g, d.actual, rose, plot, tt, 0, sr, 1, rn);
                    drawAxis(g, plot, M ? [days(d.w)[st.mDay]!] : days(d.w), LL.label, tt);
                  }} />
                ))}
                <Still className="fc-still fc-still--final" label="The test week: actual, EIA, naive, ours with the band" deps={[st.ba, st.week, st.interval, st.mDay, st.hidden.join()]} draw={(c, w, h) => {
                  const LL = layout(w, h, currentClass());
                  const g = c as unknown as CanvasRenderingContext2D;
                  const plot: Plot = { ...LL.week, hours: d.n, ymax: d.ymax };
                  drawAxis(g, plot, M ? [days(d.w)[st.mDay]!] : days(d.w), LL.label, 1);
                  drawSeries(g, d.actual, plot, STYLE.actual!);
                  const sh = seriesAt(3, d.b.best_model).filter((id) => !st.hidden.includes(id));
                  if (sh.includes("gbm")) drawBand(g, d.lo, d.hi, plot);
                  for (const id of sh) drawSeries(g, d.series(id), plot, STYLE[id]!);
                }} />
              </div>
            ) : null}
          </>
        )}
      </ArtifactStatus>
    </Track>
  );
}
