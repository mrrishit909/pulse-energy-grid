/** Size a canvas to its CSS box at a capped DPR (MOTION_SYSTEM 9: 2 on D, 1.5 on T/M). */
export function fitCanvas(canvas: HTMLCanvasElement, cap = innerWidth < 1024 ? 1.5 : 2) {
  const dpr = Math.min(devicePixelRatio || 1, cap);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: w, height: h, dpr };
}

/**
 * The stage box every scene measures from: the viewport WITHOUT classic
 * scrollbars. Every fixed canvas, the deck canvas and the
 * hit-testing use this one box, so layers stay pixel-exact on
 * systems with visible scrollbars.
 */
export const stageW = () => document.documentElement.clientWidth;
export const stageH = () => document.documentElement.clientHeight;

export type ViewportClass = "D" | "T" | "M";
/** Same cutoffs as the CSS: < 768 M, 768..1023 T, >= 1024 D. */
export const viewportClass = (vw: number): ViewportClass => (vw < 768 ? "M" : vw < 1024 ? "T" : "D");
/**
 * THE composition class (QA L1): read from the same media queries the CSS uses, so a classic 15px scrollbar never
 * makes JS draw the tablet layout at 1024 or the phone layout at 768. Canvas boxes are measured separately (clientWidth).
 */
export function currentClass(): ViewportClass {
  if (typeof matchMedia !== "function") return "D";
  return matchMedia("(min-width: 1024px)").matches ? "D" : matchMedia("(min-width: 768px)").matches ? "T" : "M";
}
