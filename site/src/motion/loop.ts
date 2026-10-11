/**
 * THE single requestAnimationFrame loop (MOTION_SYSTEM 2). Lenis, scroll
 * progress, tweens and canvas draws all subscribe here; nothing else may call
 * requestAnimationFrame. Subscribers run in ascending priority order.
 */
type FrameFn = (now: number, dt: number) => void;
interface Sub { fn: FrameFn; priority: number }

const subs: Sub[] = [];
let raf = 0;
let last = 0;

function frame(now: number) {
  const dt = last ? Math.min(100, now - last) : 16.7;
  last = now;
  for (const s of subs) s.fn(now, dt);
  raf = requestAnimationFrame(frame);
}

function start() {
  if (raf || typeof document === "undefined" || document.hidden) return;
  last = 0;
  raf = requestAnimationFrame(frame);
}
function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
}

/** Subscribe to every frame. Lower priority runs first (Lenis 0, scroll engine 10, scenes 100). */
export function addFrame(fn: FrameFn, priority = 100): () => void {
  const sub = { fn, priority };
  subs.push(sub);
  subs.sort((a, b) => a.priority - b.priority);
  start();
  return () => {
    const i = subs.indexOf(sub);
    if (i >= 0) subs.splice(i, 1);
    if (!subs.length) stop();
  };
}
