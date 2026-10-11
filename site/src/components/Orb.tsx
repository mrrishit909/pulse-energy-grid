import { useEffect, useRef } from "react";
import { ORB_PAD, renderOrb, type OrbFamily } from "../graphics/orb";

interface Props { family: OrbFamily; size: number; className?: string; label?: string }

/** Draws the cached orb bitmap once. The box is the orb diameter; the glow overflows it. */
export function Orb({ family, size, className = "", label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const bmp = renderOrb(family, size, dpr);
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
  }, [family, size]);
  const pad = (size * (ORB_PAD - 1)) / 2;
  return (
    <div className={`orb ${className}`} style={{ width: size, height: size }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <canvas ref={ref} style={{ position: "absolute", left: -pad, top: -pad, width: size * ORB_PAD, height: size * ORB_PAD }} />
    </div>
  );
}
