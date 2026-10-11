import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Nav } from "../components/Nav";
import { Track } from "../scroll/Track";
import { jumpTo, registerTrack, resolveInitialHash } from "../scroll/engine";
import { useActiveScene } from "../scroll/hooks";
import { NAV_ITEMS, SCENES, navActive, type SceneDef } from "./scenes";
import { useIntro } from "./useIntro";
import { getStore } from "../data/loader";
import { DEMAND, EVAL, FACTS, FUEL_MIX, META, MODEL, QUALITY, RECON, RESULTS, SAMPLES, TOPOLOGY, VECTORS, WEATHER } from "../data/artifacts";
import { startDirector } from "../scenes/director";
import { PulseLayer } from "../scenes/S00Pulse";
import { S03aCity } from "../scenes/S03aCity";
import { S05Fill } from "../scenes/S05Fill";
import { S06Stress } from "../scenes/S06Stress";
import { Ctrl } from "../scenes/Ctrl";
import { S04Forecast } from "../scenes/S04Forecast";
import { S03bBite } from "../scenes/S03bBite";
import { S02Source } from "../scenes/S02Source";
import { S07Evidence } from "../scenes/S07Evidence";
import { S08Closing } from "../scenes/S08Closing";
import { startSolver } from "../state/solver";
import { idle } from "../lib/math";

function Placeholder({ s }: { s: SceneDef }) {
  return (
    <Track id={s.id} height={s.track} landing={s.landing} className={`scene scene-${s.id} scene--placeholder`}>
      <div className="placeholder">
        <p className="scene-kicker">{s.code} · {s.nav ?? "CLOSING"} · BUILT IN STAGE B</p>
        <h2 id={`${s.id}-title`} tabIndex={-1} data-scene-heading className="placeholder__title">{s.title}</h2>
      </div>
    </Track>
  );
}

const SCENE_COMPONENTS: Record<string, (p: { def: SceneDef }) => React.ReactNode> = { demand: S03aCity, dispatch: S05Fill, stress: S06Stress, control: Ctrl, forecast: S04Forecast, netload: S03bBite, source: S02Source, evidence: S07Evidence };

/** Prefetch the solver's inputs and start the worker (MOTION_SYSTEM 9.3: S04 entry, or S05 directly). */
function prefetchSolver() {
  const m = getStore(MODEL), v = getStore(VECTORS);
  v.prefetch(); getStore(RESULTS).prefetch();
  const go = () => {
    if (m.state.status !== "ready") return;
    startSolver(m.state.data, v.state.status === "ready" ? v.state.data : null);
  };
  go();
  const a = m.subscribe(go), b = v.subscribe(go);
  return () => { a(); b(); };
}

/** App: the static S00/S01 track (index.html) plus the React scenes, the rose canvas and the nav. */
export function App() {
  const active = useActiveScene();
  const intro = useIntro();
  const rose = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const el = document.getElementById("pulse");
    return el ? registerTrack("pulse", el, SCENES[0]!.landing) : undefined;
  }, []);
  useEffect(() => {
    // first paint needs facts + dispatch_model (intro day); results and vectors load at idle (9.3)
    getStore(FACTS).prefetch(); getStore(MODEL).prefetch();
    startDirector(rose.current!);
    resolveInitialHash();
    // idle after the intro: the mid-page artifacts (MOTION_SYSTEM 9.3)
    idle(() => { for (const a of [RESULTS, DEMAND, FUEL_MIX, WEATHER, RECON, QUALITY, META]) getStore(a as never).prefetch(); });
  }, []);
  // S03b entry: the forecast artifacts; S04 onward: the solver and the network card
  useEffect(() => {
    const i = SCENES.findIndex((s) => s.id === active);
    if (i >= SCENES.findIndex((s) => s.id === "netload")) { getStore(SAMPLES).prefetch(); getStore(EVAL).prefetch(); }
    if (i >= SCENES.findIndex((s) => s.id === "forecast")) getStore(TOPOLOGY).prefetch();
  }, [active]);
  const solverStarted = useRef<(() => void) | null>(null);
  useEffect(() => {
    // the solver loads from S04 entry on (or any later scene reached directly: deep links, jumps)
    if (!solverStarted.current && SCENES.findIndex((x) => x.id === active) >= SCENES.findIndex((x) => x.id === "forecast")) solverStarted.current = prefetchSolver();
  }, [active]);
  const portal = document.getElementById("pulse-portal");
  return (
    <>
      <canvas ref={rose} className="rose-layer" aria-hidden="true" />
      {portal ? createPortal(<PulseLayer introPlaying={intro.playing} />, portal) : null}
      {SCENES.slice(1).map((s) => {
        const C = SCENE_COMPONENTS[s.id];
        if (s.id === "closing") return <S08Closing key={s.id} def={s} onReplay={intro.replay} />;
        return C ? <C key={s.id} def={s} /> : <Placeholder key={s.id} s={s} />;
      })}
      <Nav
        items={NAV_ITEMS}
        active={navActive(active)}
        onJump={(id) => jumpTo(id, undefined, { push: true, focus: true })}
        introPlaying={!intro.navIn}
        onSkip={intro.skip}
        onReplay={intro.replay}
      />
    </>
  );
}
