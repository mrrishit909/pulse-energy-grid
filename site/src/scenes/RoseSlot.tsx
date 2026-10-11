import { useEffect, useRef, useSyncExternalStore } from "react";
import { roomsVersion, sceneLayout, setRoom, subscribeRooms } from "./geometry";
import { useViewport } from "./useViewport";

/** QA L11: the free box a phone composition leaves for the canvas (rendered only by the M flow CSS; display:none elsewhere). */
export function RoseSlot({ scene, slot = "rose" }: { scene: string; slot?: "rose" | "sky" | "week" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const key = `${scene}:${slot}`;
    const stage = el.closest(".stage") as HTMLElement | null;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (!stage || r.height < 1 || getComputedStyle(el).display === "none") return setRoom(key, null);
      const s = stage.getBoundingClientRect();
      setRoom(key, { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height });
    };
    measure();
    // a sibling growing (data arriving, a line wrapping) moves the slot without resizing it: watch every sibling too
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    const watch = () => { ro?.observe(el); if (el.parentElement) { ro?.observe(el.parentElement); for (const c of el.parentElement.children) ro?.observe(c); } };
    watch();
    const mo = el.parentElement && typeof MutationObserver === "function" ? new MutationObserver(() => { watch(); measure(); }) : null;
    if (el.parentElement) mo?.observe(el.parentElement, { childList: true });
    stage?.addEventListener("scroll", measure, { passive: true });
    addEventListener("resize", measure);
    return () => { ro?.disconnect(); mo?.disconnect(); stage?.removeEventListener("scroll", measure); removeEventListener("resize", measure); setRoom(key, null); };
  }, [scene, slot]);
  return <div ref={ref} className={`rose-slot rose-slot--${slot}`} aria-hidden="true" />;
}

/** The scene's layout, re-read when the viewport or a measured slot changes. */
export function useSceneLayout(id: string) {
  const vp = useViewport();
  useSyncExternalStore(subscribeRooms, roomsVersion, roomsVersion);
  return sceneLayout(id, vp.w, vp.h);
}
