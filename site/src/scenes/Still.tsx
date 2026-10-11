import { useEffect, useRef } from "react";
import type { Ctx } from "../graphics/rose";
import { useLatest } from "../scroll/hooks";

/**
 * A static canvas (reduced-motion frames, MOTION_SYSTEM 8): sized to its CSS box at a capped DPR,
 * redrawn when `deps` or its size change. Draws with the same rose renderer as the live canvas.
 */
export function Still({ className = "", label, draw, deps }: { className?: string; label: string; draw: (ctx: Ctx, w: number, h: number) => void; deps: unknown[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useLatest(draw);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const paint = () => {
      const w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(devicePixelRatio || 1, innerWidth < 1024 ? 1.5 : 2);
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawRef.current(ctx as unknown as Ctx, w, h);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return <canvas ref={ref} className={`still ${className}`} role="img" aria-label={label} />;
}
