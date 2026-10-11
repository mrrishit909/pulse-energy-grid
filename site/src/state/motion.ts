/**
 * Motion preference: OS prefers-reduced-motion OR the in-site MOTION OFF toggle
 * (session override). Reflected on <html data-motion="on|off"> so CSS (tokens
 * override, normal-flow tracks, no blur) and JS read the same truth.
 */
type Listener = () => void;
const KEY = "peg.motion";
const listeners = new Set<Listener>();
const mq = typeof matchMedia !== "undefined" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

function readOverride(): "on" | "off" | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}
let override = typeof sessionStorage !== "undefined" ? readOverride() : null;

export function motionEnabled(): boolean {
  if (override) return override === "on";
  return !(mq?.matches ?? false);
}

function apply() {
  if (typeof document !== "undefined") document.documentElement.dataset.motion = motionEnabled() ? "on" : "off";
  listeners.forEach((l) => l());
}

export function setMotion(on: boolean) {
  override = on ? "on" : "off";
  try { sessionStorage.setItem(KEY, override); } catch { /* storage blocked: in-memory only */ }
  apply();
}

export function subscribeMotion(l: Listener) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

mq?.addEventListener("change", apply);
apply();
