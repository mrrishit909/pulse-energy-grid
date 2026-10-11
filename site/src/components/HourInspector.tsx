import { useCallback, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type CSSProperties } from "react";
import { Sheet } from "./Sheet";
import { HonestyChip } from "./HonestyChip";
import { closeHour, inspector, openHour } from "../state/inspector";
import { hourAt, type RoseLog } from "../graphics/rose";
import { debug } from "../scenes/director";
import { viewportClass } from "../graphics/canvas";
import type { InspectorCopy } from "../data/copy";

/**
 * Click / Enter target over the rose. The hour is computed from the drawn geometry (angle from the centre,
 * noon at the top; radius within that petal's tip). Arrow keys step the focused hour; Enter opens it.
 */
export function RoseHit({ scene, label, box, getLog = () => debug.log, onHour, onKeyFirst }: {
  scene: string; label: string; box: { cx: number; cy: number; r: number }; getLog?: () => RoseLog | null; onHour?: (h: number) => void;
  /** scene keys handled before the inspector's (S03a: arrows step the scroll hour); return true when handled */
  onKeyFirst?: (e: KeyboardEvent) => boolean;
}) {
  const ins = useSyncExternalStore(inspector.subscribe, inspector.get);
  const cur = ins.scene === scene && ins.hour !== null ? ins.hour : 12;
  const open = (h: number) => { openHour(scene, h); onHour?.(h); };
  const click = (e: MouseEvent<HTMLDivElement>) => {
    const host = e.currentTarget.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const h = hourAt(e.clientX - host.left, e.clientY - host.top, getLog());
    if (h !== null) open(h);
  };
 const key = (e: KeyboardEvent) => {
    if (onKeyFirst?.(e)) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(cur); }
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (d && ins.scene === scene) { e.preventDefault(); open((cur + d + 24) % 24); }
  };
  // r = 0: cover the positioned parent (CTRL's own stage)
  const style: CSSProperties = box.r ? { left: box.cx - box.r, top: box.cy - box.r, width: 2 * box.r, height: 2 * box.r } : { inset: 0, borderRadius: 0 };
  return <div className="rose-hit" data-rose-hit={scene} role="button" tabIndex={0} aria-label={label} style={style} onClick={click} onKeyDown={key} />;
}

/** The inspector card: D on the right (story-card anatomy), T/M a bottom sheet. */
export function HourInspector({ scene, content }: { scene: string; content: (h: number) => InspectorCopy | null }) {
  const ins = useSyncExternalStore(inspector.subscribe, inspector.get);
  const back = useCallback(() => document.querySelector<HTMLElement>(`[data-rose-hit="${scene}"]`), [scene]);
  const c = ins.scene === scene && ins.hour !== null ? content(ins.hour) : null;
  const side = typeof innerWidth === "number" && viewportClass(innerWidth) === "D";
  return (
    <Sheet open={!!c} onClose={closeHour} title={c ? `Hour inspector ${c.title}` : "Hour inspector"} side={side} className="inspector" returnFocus={back}>
      {c ? (
        <>
          <span className="story-card__chip">{c.chip}</span>
          <h3 className="inspector__title tnum">{c.title}</h3>
          <dl className="inspector__rows">
            {c.rows.map((r) => <div key={r.label} data-key={r.key}><dt>{r.label}</dt><dd className="tnum">{r.value}</dd></div>)}
          </dl>
          <p className={`inspector__check tnum ${c.check.ok ? "" : "is-bad"}`} data-ok={c.check.ok}>{c.check.text} {c.check.ok ? "✓" : "✗"}</p>
          <HonestyChip tag={c.tag} detail={c.tag === "OBSERVED" ? "EIA-930" : "MODEL"} />
        </>
      ) : null}
    </Sheet>
  );
}
