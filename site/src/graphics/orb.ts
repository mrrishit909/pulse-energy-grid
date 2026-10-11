/**
 * Luminous orb (Solar / Electric / Spectral, stops from tokens.css --orb-*).
 * Flat and fully concentric like the reference: luminous centre, saturated
 * mid, deep rim, a thin lighter rim band and a soft (not hard) edge, plus a
 * faint glow and grain. No specular offset, no lighting. Rendered once per
 * (family, size, dpr) into an offscreen canvas and cached.
 */
export type OrbFamily = "solar" | "electric" | "spectral";
interface Stop { color: string; at: number }

const FALLBACK: Record<OrbFamily, string> = {
  solar: "#fff3a6, #ffc23d 38%, #ff7a1f 66%, #ff4c25 100%",
  electric: "#8fd9ff, #58b8e1 30%, #192ce4 68%, #3a0aa8 100%",
  spectral: "#ffb26b, #ff6a2b 35%, #ff2f7a 72%, #c21fd6 100%",
};

export function parseStops(spec: string): Stop[] {
  const parts = spec.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.map((p, i) => {
    const [color, pos] = p.split(/\s+/);
    const at = pos ? parseFloat(pos) / 100 : i / Math.max(1, parts.length - 1);
    return { color: color!, at };
  });
}

function familyStops(f: OrbFamily): Stop[] {
  const css = typeof document !== "undefined"
    ? getComputedStyle(document.documentElement).getPropertyValue(`--orb-${f}`).trim()
    : "";
  return parseStops(css || FALLBACK[f]);
}

const hexToRgb = (hex: string) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};
const rgba = (hex: string, a: number) => `rgba(${hexToRgb(hex).join(",")},${a})`;
const mix = (h1: string, h2: string, t: number) => {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  return "#" + a.map((v, i) => Math.round(v + (b[i]! - v) * t).toString(16).padStart(2, "0")).join("");
};

const cache = new Map<string, HTMLCanvasElement>();
/** Canvas is PAD x the diameter so the glow has room. */
export const ORB_PAD = 1.5;

export function renderOrb(family: OrbFamily, diameter: number, dpr: number): HTMLCanvasElement {
  const px = Math.min(1024, Math.round(diameter * dpr));
  const key = `${family}:${px}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const S = Math.round(px * ORB_PAD);
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
  const R = px / 2, cx = S / 2, cy = S / 2;
  const stops = familyStops(family);
  const core = stops[0]!.color, edge = stops[stops.length - 1]!.color;
  const mid = stops[Math.floor(stops.length / 2)]!.color;

  // 1. faint glow spilling into the black
  const glow = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.22);
  glow.addColorStop(0, rgba(edge, 0.22));
  glow.addColorStop(1, rgba(edge, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);

  // 2. body: concentric family stops over 0..0.88 of the radius
  const body = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  for (const s of stops) body.addColorStop(s.at * 0.88, s.color);
  // 3. rim band: a thin lighter ring, then a soft 3% edge
  const rimColor = mix(edge, "#ffffff", 0.28);
  body.addColorStop(0.93, rimColor);
  body.addColorStop(0.965, mix(edge, mid, 0.3));
  body.addColorStop(1, rgba(edge, 0));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  // 4. luminous core: additive bloom at the exact centre
  ctx.globalCompositeOperation = "lighter";
  const core2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.42);
  core2.addColorStop(0, rgba(mix(core, "#ffffff", 0.35), 0.28));
  core2.addColorStop(1, rgba(core, 0));
  ctx.fillStyle = core2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  // 6. grain: +-3 luminance dither kills gradient banding on 8-bit displays
  ctx.globalCompositeOperation = "source-over";
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  let seed = 1234567;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const n = ((seed >>> 16) % 7) - 3;
    d[i] = d[i]! + n; d[i + 1] = d[i + 1]! + n; d[i + 2] = d[i + 2]! + n;
  }
  ctx.putImageData(img, 0, 0);

  cache.set(key, c);
  return c;
}
