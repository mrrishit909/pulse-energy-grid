import { useEffect, useRef } from "react";
import { addFrame } from "../motion/loop";
import { DUR, easeSmooth } from "../motion/ease";
import { clamp } from "../lib/math";
import { motionEnabled } from "../state/motion";
import { inspector } from "../state/inspector";
import { drawEdgeGlow, drawGhostArcs, drawHourLabels, drawPriceRose, drawRose, priceBin, radius, resetRoseCache, type Ctx, type PetalIn, type RoseLog } from "../graphics/rose";
import { firstChanged, petals, simulatedStack, tweenPetals } from "../model/stack";
import { scenarioDemand } from "../model/lp";
import { layout } from "./geometry";
import type { LabStore } from "../state/lab";
import type { BAModel, DispatchResult } from "../model/types";

/** The CTRL rose's last drawn geometry (hit-testing, e2e hooks). */
export const liveLog: { log: RoseLog | null; R100: number; frames: number; labels: { h: number; x: number; y: number; w: number; hgt: number }[]; el: HTMLCanvasElement | null } = { log: null, R100: 0, frames: 0, labels: [], el: null };

/**
 * The Control Room rose: its own canvas inside the normal-flow section (CTRL is not pinned), drawn from the
 * lab store on the single rAF loop only when dirty. Every new result runs the re-solve pulse (MOTION_SYSTEM 5.8):
 * bands from the first changed one outward re-fill in r^2, 40ms per band, with the orange edge glow.
 */
export function LiveRose({ lab, model, baseline, layer, scene }: { lab: LabStore; model: BAModel | null; baseline: DispatchResult | null; layer: "stack" | "price"; scene: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef({ seq: -1, from: null as PetalIn[] | null, shown: null as PetalIn[] | null, at: -1, k0: 0, sig: "" });
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let w = 0, h = 0, dpr = 1;
    const fit = () => {
      w = c.clientWidth; h = c.clientHeight; dpr = Math.min(devicePixelRatio || 1, innerWidth < 1024 ? 1.5 : 2);
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); resetRoseCache(); st.current.sig = "";
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    const off = addFrame((now) => {
      const s = lab.get();
      if (!model || !s.result || !s.params || !w) return;
      const rect = c.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight) return; // offscreen: no drawing
      const day = model.days.find((d) => d.id === s.dayId)!;
      const D = scenarioDemand(model, day, s.params);
      const full = petals(simulatedStack(model.display_order, day, D, s.result), () => 1);
      const S = st.current;
      if (s.resultSeq !== S.seq) {
        const animate = motionEnabled() && S.shown && S.shown.length === full.length;
        S.from = animate ? S.shown : null; S.k0 = S.from ? firstChanged(S.from, full) : 0; S.at = S.from ? now : -1; S.seq = s.resultSeq;
      }
      let ps = full, glow = 0;
      if (S.from && S.at >= 0) {
        const el = now - S.at, n = full[0]!.bands.length, total = DUR.panel + (n - S.k0) * 40;
        ps = tweenPetals(S.from, full, (k) => (k < S.k0 ? 1 : easeSmooth(clamp((el - (k - S.k0) * 40) / DUR.panel))), easeSmooth(clamp(el / DUR.panel)));
        glow = el < total ? 0.6 * Math.sin(Math.PI * clamp(el / total)) : 0;
        if (el >= total) { S.from = null; S.at = -1; }
      }
      S.shown = ps;
      const ins = inspector.get();
      const sig = `${w}x${h}|${s.resultSeq}|${layer}|${glow.toFixed(3)}|${S.at}|${ins.scene}${ins.hour}`;
      if (sig === S.sig) return;
      S.sig = sig;
      const L = layout(w, h);
      const peak = Math.max(...D, ...day.demand_mw);
      // the rose fills the canvas box (CTRL keeps its own sticky stage): area-true within the day shown
      // up and left of centre, so the colour key and the tag in the stage corner never sit on a petal (QA D-010)
      const R100 = (Math.min(w, h) * 0.36) / Math.sqrt(peak / 1e5);
      const g = c.getContext("2d")!;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const v = { cx: w * 0.42, cy: h * 0.45, R100, rref: radius(peak, R100), gap: L.gap, ghost: 0.06, bands: 1, marks: 1, beat: 0, lift: ins.scene === scene ? ins.hour : null, liftT: 1, glow: L.glow, keys: model.display_order };
      const log = layer === "price" ? drawPriceRose(g as unknown as Ctx, ps, v, s.result.price_usd_mwh.map((p) => priceBin(p, model.voll_usd_mwh)), s.result.price_usd_mwh) : drawRose(g as unknown as Ctx, ps, v);
      // the dashed ghost: the day's OBSERVED demand (the baseline's demand), so growth and heat read against it
      if (baseline) drawGhostArcs(g as unknown as Ctx, day.demand_mw, v);
      if (glow > 0) drawEdgeGlow(g as unknown as Ctx, ps, v, "#FF4C25", glow);
      liveLog.labels = drawHourLabels(g as unknown as Ctx, ps, v, L.label, 0.7); liveLog.el = c;
      liveLog.log = log; liveLog.R100 = R100; liveLog.frames++;
    }, 60);
    return () => { off(); ro.disconnect(); };
  }, [lab, model, baseline, layer, scene]);
  return <canvas ref={ref} className="live-rose" aria-hidden="true" />;
}
