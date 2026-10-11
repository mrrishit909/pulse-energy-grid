import type { ReactNode } from "react";

interface Props { x: number; y: number; visible: boolean; children: ReactNode; id?: string }

/** Mono tooltip card: follows the pointer at a 12px offset, clamped to the viewport. */
export function Tooltip({ x, y, visible, children, id }: Props) {
  const W = 280;
  const left = Math.min(x + 12, (typeof innerWidth === "number" ? innerWidth : 1440) - W - 8);
  const top = Math.max(8, y + 12);
  return (
    <div id={id} role="tooltip" className={`tooltip ${visible ? "is-visible" : ""}`} style={{ left, top, maxWidth: W }}>
      {children}
    </div>
  );
}
