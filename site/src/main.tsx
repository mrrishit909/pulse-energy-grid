import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "lenis/dist/lenis.css";
import "./styles/app.css";
import "./styles/scenes.css";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { App } from "./app/App";
import { getProgress, jumpTo, startEngine } from "./scroll/engine";
import { debug, intro, introTime, quality } from "./scenes/director";
import { layout } from "./scenes/geometry";
import { city, ctrl, fill } from "./state/scenes";
import { cancelSolve } from "./state/solver";
import { openHour } from "./state/inspector";
import { liveLog } from "./scenes/LiveRose";
import { getSolver } from "./state/solver";
import { getStore } from "./data/loader";
import { DEMAND, EVAL, FUEL_MIX, RESULTS, SAMPLES } from "./data/artifacts";
import { stress } from "./scenes/S06Stress";
import { forecast } from "./scenes/S04Forecast";
import { bite } from "./scenes/S03bBite";

// The dev gallery is excluded from production builds: the guard is a build-time constant, so the
// chunk is not emitted. `npm run build:gallery` (VITE_GALLERY=1, separate outDir) is for evidence only.
const GALLERY_ENABLED = import.meta.env.DEV || import.meta.env.VITE_GALLERY === "1";
const Gallery = GALLERY_ENABLED ? lazy(() => import("./dev/Gallery")) : null;
const isGallery = !!Gallery && document.documentElement.classList.contains("is-gallery");
if (!isGallery) document.documentElement.classList.remove("is-gallery");

// Test/evidence hook (peg = Pulse Energy Grid): the same instant-jump path the nav uses.
Object.assign(window, {
  __peg: {
    jumpTo, getProgress,
    quality: () => ({ tier: quality.tier, median: quality.median }),
    /** freeze the S00 clock at t ms (evidence frames); -1 releases it */
    freeze: (t: number) => { intro.frozen = t; if (t >= 0) intro.playing = true; },
    introT: () => introTime(performance.now()),
    introStats: () => ({ minR: intro.minR, monotonic: intro.monotonic, playing: intro.playing, firstSilhouette: intro.firstSilhouette, G0: layout(document.documentElement.clientWidth, innerHeight).G0.rPeak }),
    /** the last drawn rose: R100, centre and every band's r0 / r1 / MW (area-truth checks) */
    rose: () => (debug.log ? JSON.parse(JSON.stringify(debug.log)) : null),
    debug: () => ({ labels: debug.labels.map((b) => ({ ...b })), frames: debug.frames, scene: debug.scene, fillK: debug.fillK, bandCounts: [...debug.bandCounts], lit: debug.lit, hour: debug.hour, pulse: debug.pulse }),
    solver: () => { const s = getSolver(); return { status: s.status, version: s.version, parity: s.parity, error: s.error, attempt: s.attempt }; },
    fill: () => { const f = fill.get(); return { ba: f.ba, dayId: f.dayId, source: f.source, objective: f.result?.objective_usd ?? null, params: f.params, check: f.check, seq: f.resultSeq }; },
    setFill: (p: Partial<{ battery_power_mw: number; battery_hours: number; renewables_scale: number }>) => { const f = fill.get(); if (f.params) fill.set({ params: { ...f.params, ...p }, presetId: null }); },
    ctrl: () => { const c = ctrl.get(); return { ba: c.ba, dayId: c.dayId, source: c.source, objective: c.result?.objective_usd ?? null, breakdownSum: c.result ? Object.values(c.result.cost_breakdown_usd).reduce((a, b) => a + b, 0) : null, params: c.params, check: c.check, seq: c.resultSeq, timeLimit: c.timeLimit }; },
    setCtrl: (p: Record<string, number | string>) => { const c = ctrl.get(); if (c.params) ctrl.set({ params: { ...c.params, ...p }, presetId: null }); },
    setCtrlTimeLimit: (t: number) => ctrl.set({ timeLimit: t }),
    cancel: () => cancelSolve(),
    openHour: (scene: string, h: number) => openHour(scene, h),
    liveRose: () => (liveLog.log ? { R100: liveLog.R100, frames: liveLog.frames, petals: liveLog.log.petals.length } : null),
    setBite: (p: Partial<ReturnType<typeof bite.get>>) => bite.set(p),
    setForecast: (p: Partial<ReturnType<typeof forecast.get>>) => forecast.set(p),
    view: () => (debug.view ? { ...debug.view } : null),
    ready: (files: string[]) => files.every((f) => [DEMAND, FUEL_MIX, SAMPLES, EVAL, RESULTS].some((a) => a.file === f && getStore(a as never).state.status === "ready")),
    stress: () => stress.get(),
    setStress: (p: Partial<ReturnType<typeof stress.get>>) => stress.set(p),
    city: () => city.get(),
    setCity: (p: Partial<ReturnType<typeof city.get>>) => city.set(p),
  },
});

startEngine();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {isGallery && Gallery ? (
        <Suspense fallback={null}>
          <Gallery />
        </Suspense>
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </StrictMode>,
);
