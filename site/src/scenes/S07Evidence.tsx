import type { ArtifactSpec } from "../data/loader";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Track } from "../scroll/Track";
import { HonestyChip, type Honesty } from "../components/HonestyChip";
import { ArtifactStatus, SceneErrors } from "../components/StateUI";
import { useArtifact } from "../data/useArtifact";
import { useNear } from "../scroll/useNear";
import { EVAL, FACTS, MODEL, RECON, RESULTS, TOPOLOGY, QUALITY, META } from "../data/artifacts";
import { answerCosts, answerIntervals, answerLp, answerRows, answerSolve, answerWeather, answerWires, fmtAssumption, ledgerCopy, MODEL_LABEL, OBJECTIONS, verdict, wiresCaption } from "../data/copy";
import { getSolver, subscribeSolver } from "../state/solver";
import { useMotion, useProgress } from "../scroll/hooks";
import { getStore } from "../data/loader";
import { stepState, windowed } from "../motion/progress";
import { fixed } from "../model/format";
import { petals, simulatedStack } from "../model/stack";
import { dayPeak } from "../model/lp";
import { radius } from "../graphics/rose";
import LAYOUT from "../data/ieee14-layout.json";
import type { ForecastEval, Topology } from "../model/types";
import { baseView, registerFrame } from "./director";
import { camera, fitR100 } from "./geometry";
import type { SceneDef } from "../app/scenes";

// ------------------------------------------------------------------ behind the stack: the S06 baseline rose, moved to G1 and dimmed to 15%
registerFrame("evidence", ({ p, L, model }) => {
  const rs = getStore(RESULTS).state;
  if (rs.status !== "ready") return null;
  const m = model.bas.CISO, day = m.days.find((d) => d.id === "summer")!, r = rs.data.bas.CISO.days.summer!.baseline!;
  const s = simulatedStack(m.display_order, day, day.demand_mw, r);
  const peak = Math.max(...day.demand_mw);
  const e = windowed(p, 0, 0.08);
  const cam = camera({ cx: L.G4.cx, cy: L.G4.cy, R100: fitR100(L.G4, dayPeak(m, day)) }, L.G1, e);
  return { petals: petals(s, () => 1), view: baseView(s.keys, { ...cam, rref: radius(peak, cam.R100), gap: L.gap }), labels: 0, bloom: 0, glow: null, sky: null, opacity: 1 - 0.85 * e, sig: `evidence|${e.toFixed(3)}` };
});

const STEPS = OBJECTIONS.slice(1).map((_, i) => (i + 1) / 7);

/** BFS hop of every bus from energize_from (whole-segment energization; nothing moves along a path). */
export function hops(topo: Topology, from: number) {
  const d = new Map<number, number>([[from, 0]]);
  const q = [from];
  while (q.length) {
    const b = q.shift()!;
    for (const br of topo.branches) {
      const o = br.from === b ? br.to : br.to === b ? br.from : null;
      if (o !== null && !d.has(o)) { d.set(o, d.get(b)! + 1); q.push(o); }
    }
  }
  return d;
}

/** "The Wires" (interaction 10): the IEEE 14-bus test system, ILLUSTRATIVE; branches energize hop by hop from bus 1. */
export function Wires({ topo, on }: { topo: Topology; on: boolean }) {
  const pos = (LAYOUT as unknown as { buses: Record<string, [number, number]> }).buses;
  const from = (LAYOUT as unknown as { energize_from: number[] }).energize_from[0] ?? 1;
  const hop = hops(topo, from);
  const gens = new Set(topo.generators.map((g) => g.bus));
  const P = (id: number) => { const [x, y] = pos[String(id)]!; return [10 + x * 400, 10 + y * 280] as const; };
  // QA L7: SVG text must be 11 CSS px, so its user-unit size is divided by the rendered scale (--k = viewBox px per CSS px).
  const ref = useRef<SVGSVGElement>(null);
  const [k, setK] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => { const w = el.getBoundingClientRect().width; if (w > 0) setK(420 / w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <svg ref={ref} style={{ "--k": k } as CSSProperties} className={`wires ${on ? "is-on" : ""}`} viewBox="0 0 420 300" role="img" aria-label="An illustrative 14-bus test network. Lines light up outward from bus 1 to show the idea of a network. Our dispatch model does not use it.">
      {topo.branches.map((b, i) => {
        const [x1, y1] = P(b.from), [x2, y2] = P(b.to);
        const h = Math.min(hop.get(b.from) ?? 0, hop.get(b.to) ?? 0);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="wires__br" style={{ "--d": `${h * 90}ms` } as CSSProperties} />;
      })}
      {topo.buses.map((b) => {
        const [x, y] = P(b.id);
        return (
          <g key={b.id} className={`wires__bus ${b.pd_mw > 0 ? "is-load" : ""}`} style={{ "--d": `${(hop.get(b.id) ?? 0) * 90}ms` } as CSSProperties}>
            <rect x={x - 9 * k} y={y - 8 * k} width={18 * k} height={16 * k} />
            <text x={x} y={y + 4 * k} textAnchor="middle">{b.id}</text>
            {gens.has(b.id) ? <text x={x + 12 * k} y={y - 10 * k} className="wires__g">G</text> : null}
          </g>
        );
      })}
    </svg>
  );
}

function Bars({ rows, max }: { rows: { label: string; v: number; tone?: "ours" | "eia" | "bound" | "nominal" }[]; max: number }) {
  return (
    <ul className="ev-bars">
      {rows.map((r) => <li key={r.label}><span>{r.label}</span><i className={`is-${r.tone ?? "ours"}`} style={{ "--w": `${(r.v / max) * 100}%` } as CSSProperties} /><b className="tnum">{fixed(r.v, 2)}%</b></li>)}
    </ul>
  );
}
function CiBar({ lo, hi, pp }: { lo: number; hi: number; pp: number }) {
  const span = 6, X = (v: number) => 50 + (v / span) * 50;
  return (
    <svg className="ev-ci" viewBox="0 0 100 14" role="img" aria-label={`MAPE difference ${fixed(pp, 2)} points, 95% CI ${fixed(lo, 2)} to ${fixed(hi, 2)}`}>
      <rect x={Math.min(X(lo), X(hi))} y="4" width={Math.abs(X(hi) - X(lo))} height="6" className="ev-ci__span" />
      <rect x="49.6" y="0" width="0.8" height="14" fill="#fff" />
    </svg>
  );
}

/** S07 "How we know": seven exchanges, an objection then an orange answer with a mini-visual. */
export function S07Evidence({ def }: { def: SceneDef }) {
  const near = useNear(def.id);
  const [fe, rFe] = useArtifact(EVAL, near); const [ff] = useArtifact(FACTS); const [ms] = useArtifact(MODEL); const [rs] = useArtifact(RESULTS, false);
  const [tp, rTp] = useArtifact(TOPOLOGY, near); const [rc] = useArtifact(RECON, false); const [q] = useArtifact(QUALITY, false); const [mt] = useArtifact(META, false);
  const sv = useSyncExternalStore(subscribeSolver, getSolver);
  const motion = useMotion();
  const [k, setK] = useState(0);
  useProgress(def.id, (p) => setK((o) => stepState(o, p, STEPS)));
  const shown = motion ? k : 6;
  const E: ForecastEval | null = fe.status === "ready" ? fe.data : null;
  const evalLine = fe.status === "ready" ? null : <ArtifactStatus file="forecast_eval.json" state={fe} retry={rFe} empty="UNAVAILABLE">{() => null}</ArtifactStatus>;
  const answers: { body: ReactNode; tag: Honesty; detail: string }[] = [
    { tag: "DERIVED", detail: "PAIRED BOOTSTRAP, 95% CI", body: E ? (
      <>
        {(["CISO", "ERCO"] as const).map((ba) => { const v = verdict(E, ba); const c = E.bas[ba].comparison_vs_eia; return <div key={ba} className="ev-v"><p>{v.serif}</p><CiBar lo={c.mape_diff_ci95[0]} hi={c.mape_diff_ci95[1]} pp={c.mape_diff_pp} /><p className="ev-small tnum">{c.statement.toUpperCase()}</p></div>; })}
        <table className="ev-table tnum"><thead><tr><th>TEST MAPE</th><th>CISO</th><th>ERCO</th></tr></thead>
          <tbody>{["seasonal_naive", "eia_day_ahead", "eia_debiased", "gbm", "gbm_stacked"].map((id) => <tr key={id}><td>{MODEL_LABEL[id]}</td><td>{fixed(E.bas.CISO.models[id]!.mape_pct, 2)}%</td><td>{fixed(E.bas.ERCO.models[id]!.mape_pct, 2)}%</td></tr>)}</tbody></table>
      </>) : evalLine },
    { tag: "DERIVED", detail: "COUNTED TEST HOURS", body: E ? (["CISO", "ERCO"] as const).map((ba) => { const iv = E.bas[ba].intervals.gbm!; return <div key={ba}><p>{answerIntervals(E, ba)}</p><Bars max={100} rows={[{ label: "RAW", v: iv.raw_coverage_pct }, { label: "CALIBRATED", v: iv.cqr_coverage_pct }, { label: "NOMINAL", v: iv.nominal_pct, tone: "nominal" }]} /></div>; }) : evalLine },
    { tag: "PREDICTED", detail: "UPPER BOUND · NOT AVAILABLE AT FORECAST TIME", body: E ? (["CISO", "ERCO"] as const).map((ba) => <div key={ba}><p>{answerWeather(E, ba)}</p><Bars max={6} rows={[{ label: "OURS", v: E.bas[ba].models.gbm!.mape_pct }, { label: "PERFECT WEATHER", v: E.bas[ba].models.gbm_perfect_weather!.mape_pct, tone: "bound" }]} /></div>) : evalLine },
    { tag: tp.status === "ready" ? (tp.data.tag as Honesty) : "SYNTHETIC", detail: "ILLUSTRATIVE", body: <><p>{answerWires}</p>{tp.status === "ready" ? <Wires topo={tp.data} on={shown >= 3} /> : <ArtifactStatus file="grid_topology.json" state={tp} retry={rTp} empty="UNAVAILABLE">{() => null}</ArtifactStatus>}<p className="ev-small">{wiresCaption}</p></> },
    { tag: "SIMULATED", detail: "ASSUMPTIONS", body: <><p>{answerCosts}</p>{ms.status === "ready" ? <ul className="ev-assume">{ms.data.assumptions.slice(0, 8).map((a) => <li key={a.id}><b>{a.id.toUpperCase().replace(/_/g, " ")}</b> {fmtAssumption(a.value)} {a.unit.toUpperCase()}</li>)}</ul> : null}</> },
    { tag: "SIMULATED", detail: "PARITY ON THIS BUILD", body: <><p>{answerSolve(sv.parity)}</p>{sv.parity ? <p className="ev-small tnum" data-parity-ev>OBJECTIVE {sv.parity.objective}/{sv.parity.n} · PRICES {sv.parity.price}/{sv.parity.priceComparable} WHERE UNIQUE · LP TEXT SHA-256 {sv.parity.hash}/{sv.parity.n} · TOLERANCE 1E-6</p> : null}{ms.status === "ready" && rs.status === "ready" ? <p className="ev-small tnum">{answerLp(ms.data.reference_lp.objective_usd, rs.data.bas.CISO.days.summer!.baseline!.objective_usd)}</p> : null}</> },
    { tag: "OBSERVED", detail: "ROW LEDGER", body: <>{ff.status === "ready" ? <p>{answerRows(ff.data)}</p> : null}{rc.status === "ready" && q.status === "ready" && ff.status === "ready" && mt.status === "ready" ? <ul className="ev-assume">{ledgerCopy(rc.data, q.data, ff.data, mt.data).rows.map((r) => <li key={r.ba}>{r.text}</li>)}</ul> : null}</> },
  ];
  return (
    <Track id={def.id} height={def.track} landing={def.landing} className={`scene scene-${def.id}`} label="Evidence: how we know">
      <SceneErrors id={def.id} specs={[EVAL, FACTS, MODEL, RESULTS, TOPOLOGY, RECON, QUALITY, META] as ArtifactSpec<unknown>[]} />
      <div className="ev-head">
        <p className="scene-kicker">EVIDENCE · SEVEN QUESTIONS, SEVEN ANSWERS</p>
        <h2 id={`${def.id}-title`} tabIndex={-1} data-scene-heading className="scene-statement">How we know.</h2>
      </div>
      <ol className="ev-stack" aria-live="polite">
        {OBJECTIONS.map((o, i) => (i > shown ? null : (
          <li key={o} className={`ev-x ${i < shown ? "is-old" : ""}`} data-exchange={i + 1}>
            <p className="ev-obj">{o}</p>
            <div className="ev-ans">{answers[i]!.body}<HonestyChip tag={answers[i]!.tag} detail={answers[i]!.detail} onLight /></div>
          </li>
        )))}
      </ol>
    </Track>
  );
}
