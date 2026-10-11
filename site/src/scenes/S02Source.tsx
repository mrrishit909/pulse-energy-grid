import type { ArtifactSpec } from "../data/loader";
import { Track } from "../scroll/Track";
import { StoryDeck, type DeckCard } from "../components/StoryDeck";
import { HonestyChip } from "../components/HonestyChip";
import { AllReady, ArtifactStatus, SceneErrors } from "../components/StateUI";
import { useArtifact } from "../data/useArtifact";
import { DEMAND, FACTS, FUEL_MIX, META, MODEL, QUALITY, RECON, WEATHER } from "../data/artifacts";
import { copyS02, fuelName, heatCopy, ledgerCopy, sharesLine } from "../data/copy";
import { windowed } from "../motion/progress";
import { easeSymmetric } from "../motion/ease";
import { city } from "../state/scenes";
import { int } from "../model/format";
import { observedStack, petals, tweenPetals, type DayStack } from "../model/stack";
import { biteStack } from "../model/bite";
import { drawRose, radius } from "../graphics/rose";
import type { BA, DemandProfile, FuelMix, WeatherRelation } from "../model/types";
import { baseView, registerFrame } from "./director";
import { camera, fillR100 } from "./geometry";
import { Still } from "./Still";
import type { SceneDef } from "../app/scenes";

// ------------------------------------------------------------------ the backdrop: the intro day at G1, 25%, then G2 at full light for S03a
registerFrame("source", ({ p, L, model }) => {
  const intro = model.bas.CISO.days.find((d) => d.intro);
  const c = city.get();
  const cday = model.bas[c.ba].days.find((d) => d.id === c.dayId) ?? model.bas[c.ba].days[0]!;
  if (!intro) return null;
  const a = petals(observedStack(intro, false), () => 1);
  const b = petals(observedStack(cday, false), () => 1);
  const e = easeSymmetric(windowed(p, 0.85, 1));
  const ps = e > 0 ? tweenPetals(a, b, () => e, e) : a;
  const peakB = Math.max(...cday.demand_mw);
  const cam = camera(L.G1, { cx: L.G2.cx, cy: L.G2.cy, R100: fillR100(L.G2, peakB) }, e);
  const peak = Math.max(...intro.demand_mw) * (1 - e) + peakB * e;
  const view = baseView(observedStack(intro, false).keys, { ...cam, rref: radius(peak, cam.R100), gap: L.gap });
  return { petals: ps, view, labels: e, bloom: 0, glow: null, sky: null, opacity: 0.25 + 0.75 * e, sig: `source|${p.toFixed(4)}|${c.ba}${c.dayId}` };
});

/** Card 1: the intro day's 18:00 petal alone, at the card's width, with its bands listed by fuel and MW (OBSERVED). */
function OnePetal() {
  const [ms] = useArtifact(MODEL);
  if (ms.status !== "ready") return null;
  const day = ms.data.bas.CISO.days.find((d) => d.intro)!;
  const s = observedStack(day, false);
  const h = 18;
  const x = s.hours[h]!;
  return (
    <div className="card1">
      <Still className="card-petal" label={`The ${day.date} 18:00 petal, filled from the centre`} deps={[day.date]} draw={(c, w, hh) => {
        const ps = petals(s, () => 1).filter((q) => q.hour === h);
        const tip = ps[0]!.demand + ps[0]!.charge + ps[0]!.exports;
        // petal 18 points right (dusk, sky orientation): centre on the left edge, tip at the right edge
        const R100 = (w - 12) / Math.sqrt(tip / 1e5);
        drawRose(c, ps, baseView(s.keys, { cx: 4, cy: hh * 0.18, R100, rref: radius(tip, R100), gap: 0.5 }));
      }} />
      <ul className="card1__bands tnum">
        {s.keys.map((k, i) => (x.values[i]! > 0 ? <li key={k}><span>{fuelName(k)}</span><span>{int(x.values[i]!)} MW</span></li> : null))}
        {x.charge > 0.5 ? <li><span>CHARGING (SINK)</span><span>−{int(x.charge)} MW</span></li> : null}
        <li className="card1__total"><span>DEMAND 18:00</span><span>{int(x.demand)} MW</span></li>
      </ul>
    </div>
  );
}

/** Card 2: the annual mean day of each BA, same R100 (DERIVED: the mean of the 12 month-hour mean days). */
function meanDay(fm: FuelMix, dp: DemandProfile, ba: BA): DayStack {
  const months = Array.from({ length: 12 }, (_, m) => biteStack(fm, dp, ba, m + 1, null, 0));
  const first = months[0]!;
  return { keys: first.keys, tag: "OBSERVED", hours: first.hours.map((x, h) => ({
    ...x, values: x.values.map((_, k) => months.reduce((a, mo) => a + mo.hours[h]!.values[k]!, 0) / 12),
    demand: months.reduce((a, mo) => a + mo.hours[h]!.demand, 0) / 12, exports: months.reduce((a, mo) => a + mo.hours[h]!.exports, 0) / 12,
  })) };
}
function TwoGrids() {
  const [fmS, rF] = useArtifact(FUEL_MIX, false); const [dpS, rD] = useArtifact(DEMAND, false); const [fS, rFa] = useArtifact(FACTS);
  if (fmS.status !== "ready" || dpS.status !== "ready" || fS.status !== "ready") {
    return <AllReady items={[{ file: "fuel_mix.json", state: fmS, retry: rF }, { file: "demand_profile.json", state: dpS, retry: rD }, { file: "facts.json", state: fS, retry: rFa }]}>{() => null}</AllReady>;
  }
  const stacks = { CISO: meanDay(fmS.data, dpS.data, "CISO"), ERCO: meanDay(fmS.data, dpS.data, "ERCO") };
  const peak = Math.max(...stacks.ERCO.hours.map((x) => x.demand), ...stacks.CISO.hours.map((x) => x.demand));
  return (
    <div className="two-grids">
      {(["CISO", "ERCO"] as const).map((ba) => (
        <figure key={ba}>
          <Still className="two-grids__rose" label={`${ba} annual mean day`} deps={[ba]} draw={(c, w, h) => {
            const R100 = (Math.min(w, h) * 0.48) / Math.sqrt(peak / 1e5);
            drawRose(c, petals(stacks[ba], () => 1), baseView(stacks[ba].keys, { cx: w / 2, cy: h / 2, R100, rref: radius(peak, R100), gap: 0.375, glow: 8 }));
          }} />
          <figcaption>{ba} · {sharesLine(fS.data, ba)}</figcaption>
        </figure>
      ))}
    </div>
  );
}
/** Card 3: temperature bins (white squares = mean, a vertical P10-P90 tick each) and the fitted cooling slope (#58B8E1). */
function Heat({ w, ba }: { w: WeatherRelation; ba: BA }) {
  const b = w.bas[ba].binned;
  const x0 = Math.min(...b.temp_c), x1 = Math.max(...b.temp_c), y0 = Math.min(...b.p10_mw) * 0.95, y1 = Math.max(...b.p90_mw) * 1.03;
  const X = (t: number) => 10 + ((t - x0) / (x1 - x0)) * 280, Y = (mw: number) => 150 - ((mw - y0) / (y1 - y0)) * 140;
  const wr = w.bas[ba];
  const base = b.mean_mw.reduce((a, _m, i) => (Math.abs(b.temp_c[i]! - wr.cool_base_c) < Math.abs(b.temp_c[a]! - wr.cool_base_c) ? i : a), 0);
  const m0 = b.mean_mw[base]!;
  const slope = (t: number) => m0 * (1 + (wr.pct_demand_per_c_above_base / 100) * (t - wr.cool_base_c));
  return (
    <svg className="heat" viewBox="0 0 300 155" role="img" aria-label={`Mean demand by temperature bin in ${ba}, with the fitted slope above ${wr.cool_base_c} °C`}>
      {b.temp_c.map((t, i) => (
        <g key={t}>
          <line x1={X(t)} x2={X(t)} y1={Y(b.p10_mw[i]!)} y2={Y(b.p90_mw[i]!)} stroke="#fff" strokeOpacity="0.6" />
          <rect x={X(t) - 1.5} y={Y(b.mean_mw[i]!) - 1.5} width="3" height="3" fill="#fff" />
        </g>
      ))}
      <line x1={X(wr.cool_base_c)} x2={X(x1)} y1={Y(slope(wr.cool_base_c))} y2={Y(Math.min(slope(x1), y1))} stroke="#58B8E1" strokeWidth="1.5" />
    </svg>
  );
}
function heatAxis(w: WeatherRelation, ba: BA) {
  const t = w.bas[ba].binned.temp_c;
  return <p className="heat__axis tnum" aria-hidden="true"><span>{Math.round(Math.min(...t))} °C</span><span>{Math.round(Math.max(...t))} °C</span></p>;
}
function HeatCard() {
  const [ws] = useArtifact(WEATHER, false);
  if (ws.status !== "ready") return null;
  return <div className="heat-card"><Heat w={ws.data} ba="CISO" />{heatAxis(ws.data, "CISO")}<p className="heat-readout tnum">CISO {heatCopy(ws.data, "CISO").readout}</p></div>;
}
function Ledger() {
  const [r, rr] = useArtifact(RECON, false); const [q, rq] = useArtifact(QUALITY, false); const [f, rf] = useArtifact(FACTS); const [m, rm] = useArtifact(META, false);
  if (r.status !== "ready" || q.status !== "ready" || f.status !== "ready" || m.status !== "ready") {
    return <AllReady items={[{ file: "reconciliation.json", state: r, retry: rr }, { file: "quality.json", state: q, retry: rq }, { file: "facts.json", state: f, retry: rf }, { file: "meta.json", state: m, retry: rm }]}>{() => null}</AllReady>;
  }
  const l = ledgerCopy(r.data, q.data, f.data, m.data);
  return (
    <div className="ledger-card">
      <ul>{l.rows.map((x) => <li key={x.ba} className={x.a && x.b ? "" : "is-bad"}>{x.text}</li>)}</ul>
      <p className="tnum">{l.totals}</p>
      <ul className="ledger-card__quirks">{l.quirks.map((x) => <li key={x}>{x}</li>)}</ul>
      <p className="ledger-card__foot">{l.footer}</p>
    </div>
  );
}

/** S02 "Ledger Deck" (interaction 4): four story cards over the dimmed rose. */
export function S02Source({ def }: { def: SceneDef }) {
  const [ws, retryW] = useArtifact(WEATHER, false);
  const [rs, retryR] = useArtifact(RECON, false);
  const cards: DeckCard[] = [
    { variant: "dark", chip: "SOURCE 01 · EIA-930", title: copyS02.c1.title, tag: <HonestyChip tag="OBSERVED" detail="EIA-930" />,
      visual: <OnePetal />, body: <><p>{copyS02.c1.body}</p><p className="card1__fields">FIELDS: {copyS02.c1.fields.join(" · ")}</p></> },
    { variant: "blue", chip: "SOURCE 02 · TWO GRIDS", title: copyS02.c2.title, tag: <HonestyChip tag="DERIVED" detail="MEAN DAY OF EIA-930" />, visual: <TwoGrids />, body: <p>{copyS02.c2.body}</p> },
    { variant: "dark", chip: "SOURCE 03 · NOAA ISD", title: copyS02.c3.title, tag: <HonestyChip tag="DERIVED" detail="FITTED, NOT A FORECAST" />,
      visual: <ArtifactStatus file="weather_relation.json" state={ws} retry={retryW} empty="UNAVAILABLE">{() => <HeatCard />}</ArtifactStatus>,
      body: <p>{ws.status === "ready" ? heatCopy(ws.data, "CISO").body : ""}</p> },
    { variant: "light", chip: "SOURCE 04 · THE LEDGER", title: copyS02.c4.title, tag: <HonestyChip tag="OBSERVED" detail="COUNTED ROWS" onLight />,
      visual: <ArtifactStatus file="reconciliation.json" state={rs} retry={retryR} empty="UNAVAILABLE">{() => <Ledger />}</ArtifactStatus>, body: <p>{copyS02.c4.body}</p> },
  ];
  return (
    <Track id={def.id} height={def.track} landing={def.landing} className={`scene scene-${def.id}`} label="Source: the ledger deck">
      <SceneErrors id={def.id} specs={[MODEL, FUEL_MIX, DEMAND, FACTS, WEATHER, RECON, QUALITY, META] as ArtifactSpec<unknown>[]} />
      <div className="source-head">
        <p className="scene-kicker">{copyS02.kicker}</p>
        <h2 id={`${def.id}-title`} tabIndex={-1} data-scene-heading className="sr-only">{def.title}</h2>
      </div>
      <div className="deck-stage"><StoryDeck track={def.id} cards={cards} /></div>
    </Track>
  );
}
