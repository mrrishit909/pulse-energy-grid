#!/usr/bin/env node
/**
 * P04 copy of the shared v2 evidence harness (~/data-frontier/shared/testing/evidence-harness.mjs), task P04-QA-001
 * (adapted from the P03 QA copy).
 * Same contract: evidence.config.json (sibling) holds the scenes, sequences and the heavy interaction; this file
 * holds nothing project-specific beyond the window.__peg hooks used for S00 frames and geometry.
 * Changes from the shared version:
 *  - --out <dir> under artifacts/evidence/ (default qa); screenshots are JPEG (q72); steps not marked core run only at config.fullViewports (or --full), to keep committed evidence small.
 *  - S00 frames via window.__peg.freeze(t), with the debug radius and G0 logged per frame (MOTION_SYSTEM test 15).
 *  - The contact sheet is built from the scroll-pass frames with Pillow: this machine's only ffmpeg is Playwright's
 *    build, which has no VP8 decoder or tile filter. The .webm recording is still written (gitignored).
 *  - --classic: Chromium without --hide-scrollbars plus a forced 15px classic scrollbar (Windows / "always show
 *    scroll bars" class), so the JS viewport class and the CSS breakpoints can be compared (P01-D-033 class).
 *  - Per-shot geometry log (shots.json): scroll overflow, JS vs CSS viewport class, visible honesty chips.
 * Usage: node tests/evidence-harness.mjs --base-url http://localhost:4331/pulse-energy-grid/ [--only 1440x900]
 *        [--viewports 1024x768,768x1024 --classic] [--skip-pacing] [--pacing-only] [--out qa]
 */
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true] : null)).filter(Boolean)
);
const OUT = join(ROOT, "artifacts", "evidence", args.out && args.out !== true ? args.out : "qa");
const REC = join(ROOT, "artifacts", "evidence", "recordings");
const CLASSIC = !!args.classic;
const REDUCED = !!args.reduced;
const VIEWPORTS = (args.viewports ? args.viewports.split(",").map((s) => s.split("x").map(Number))
  : [[1920, 1080], [1440, 900], [1024, 768], [768, 1024], [390, 844], [375, 812], [360, 800]])
  .map(([width, height]) => ({ width, height, label: `${width}x${height}${CLASSIC ? "-classic" : ""}${REDUCED ? "-reduced" : ""}` }));
const baseUrl = args["base-url"] ?? "http://localhost:4331/pulse-energy-grid/";
const ONLY = args.only ? new Set(String(args.only).split(",")) : null;
const config = JSON.parse(readFileSync(join(HERE, "evidence.config.json"), "utf-8"));
const ensureDir = (p) => mkdirSync(p, { recursive: true });
const CLASSIC_CSS = "html{overflow-y:scroll!important}::-webkit-scrollbar{width:15px;height:15px;background:#222}::-webkit-scrollbar-thumb{background:#777}";

const probe = () => {
  const cw = document.documentElement.clientWidth, iw = innerWidth;
  const cls = (v) => (v < 768 ? "M" : v < 1024 ? "T" : "D");
  const cssCls = matchMedia("(max-width: 767px)").matches ? "M" : matchMedia("(max-width: 1023px)").matches ? "T" : "D";
  const chips = [...document.querySelectorAll(".chip, [class*='chip--']")].filter((c) => {
    const r = c.getBoundingClientRect(), s = getComputedStyle(c);
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0.05;
  }).map((c) => c.textContent.trim().slice(0, 40));
  const d = window.__peg?.debug?.() ?? {};
  return { scrollW: document.documentElement.scrollWidth, clientW: cw, innerW: iw, jsClassFromClientW: cls(cw), jsClassFromInnerW: cls(iw), cssClass: cssCls,
    scene: d.scene, frames: d.frames, cls: window.__peg?.cls?.(), chips };
};

async function captureViewport(browser, vp) {
  const dir = join(OUT, "screenshots", vp.label);
  rmSync(dir, { recursive: true, force: true });
  ensureDir(dir); ensureDir(REC);
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1,
    hasTouch: vp.width < 1024, isMobile: vp.width < 768, reducedMotion: REDUCED ? "reduce" : "no-preference",
    recordVideo: { dir: join(REC, `tmp-${vp.label}`), size: { width: vp.width, height: vp.height } },
  });
  if (CLASSIC) await context.addInitScript((css) => { addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); }); }, CLASSIC_CSS);
  const page = await context.newPage();
  const log = { viewport: vp.label, errors: [], shots: [] };
  page.on("pageerror", (e) => log.errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") log.errors.push(`console: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 400) log.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  const shot = async (name) => {
    await page.screenshot({ path: join(dir, `${name}.jpg`), type: "jpeg", quality: 72 });
    log.shots.push({ name, ...(await page.evaluate(probe)) });
  };

  await page.goto(`${baseUrl}?quality=high`, { waitUntil: "load" });
  // reduced motion draws static frames (no rAF loop), so only the hook is awaited there
  await page.waitForFunction((rm) => window.__peg && (rm || window.__peg.debug().frames > 2), REDUCED, { timeout: 60000 });
  if (REDUCED) await page.waitForTimeout(2500);
  log.renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : "no webgl2";
  });
  // S00 frames at fixed intro clocks (MOTION_SYSTEM test 15/16)
  for (const t of REDUCED ? [] : config.introFrames ?? []) {
    await page.evaluate((x) => window.__peg.freeze(x), t);
    await page.waitForTimeout(450);
    await shot(`00-s00-t${String(t).padStart(4, "0")}`);
  }
  await page.evaluate(() => window.__peg.freeze(-1));
  await page.waitForFunction(() => !window.__peg.introStats().playing, null, { timeout: 30000 }).catch(() => log.errors.push("intro did not end in 30s"));
  await page.waitForTimeout(500);
  await shot("00-s00-end");
  log.introStats = await page.evaluate(() => window.__peg.introStats());

  const full = (config.fullViewports ?? []).includes(vp.label) || args.full;
  for (const seq of config.interactionSequences ?? []) {
    if (seq.minWidth && vp.width < seq.minWidth) continue;
    if (seq.maxWidth && vp.width > seq.maxWidth) continue;
    let i = 0;
    for (const step of seq.steps) {
      if (!full && !step.core) continue;
      if (step.mouse) {
        const b = await page.locator(step.mouse.selector).first().boundingBox();
        if (b) await page.mouse[step.mouse.click ? "click" : "move"](b.x + b.width * step.mouse.fx, b.y + b.height * step.mouse.fy);
      } else if (step.key) {
        await page.keyboard.press(step.key);
      } else {
        await page.evaluate(new Function(step.setup)).catch((e) => log.errors.push(`${seq.id}[${i}] ${e.message}`));
      }
      await page.waitForTimeout(step.waitMs ?? 900);
      if (step.shot !== false) await shot(`${seq.id}-${String(i).padStart(2, "0")}${step.name ? `-${step.name}` : ""}`);
      i++;
    }
  }

  // Full scroll pass (recording + contact-sheet frames)
  const frames = join(OUT, "contact-sheets", `frames-${vp.label}`);
  rmSync(frames, { recursive: true, force: true }); ensureDir(frames);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(400);
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const steps = config.scrollSteps ?? 80;
  for (let i = 0; i <= steps; i++) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), (scrollHeight * i) / steps);
    await page.waitForTimeout(config.scrollStepMs ?? 260);
    await page.screenshot({ path: join(frames, `f${String(i).padStart(3, "0")}.jpg`), type: "jpeg", quality: 60, scale: "css" });
  }
  const video = page.video();
  await context.close();
  if (video) { renameSync(await video.path(), join(REC, `${vp.label}.webm`)); rmSync(join(REC, `tmp-${vp.label}`), { recursive: true, force: true }); }
  writeFileSync(join(OUT, "screenshots", `${vp.label}.json`), JSON.stringify(log, null, 1));
  makeContactSheet(vp, frames);
  return log;
}

function makeContactSheet(vp, frames) {
  const py = `
import os,sys
from PIL import Image, ImageDraw
src,out,w0,h0=sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4])
fs=sorted(f for f in os.listdir(src) if f.endswith('.jpg'))
cols=10 if w0<800 else 8
h=240; w=int(w0*h/h0)
rows=(len(fs)+cols-1)//cols
sheet=Image.new('RGB',(cols*(w+4)+4,rows*(h+18)+4),(48,48,48)); d=ImageDraw.Draw(sheet)
for i,f in enumerate(fs):
  im=Image.open(os.path.join(src,f)).convert('RGB').resize((w,h)); x=4+(i%cols)*(w+4); y=4+(i//cols)*(h+18)
  sheet.paste(im,(x,y+14)); d.text((x+2,y+1),f'{i}',fill=(255,255,0))
sheet.save(out,quality=70)
for f in fs: os.remove(os.path.join(src,f))
os.rmdir(src)
`;
  const out = join(OUT, "contact-sheets", `${vp.label}.jpg`);
  execFileSync("python3", ["-c", py, frames, out, String(vp.width), String(vp.height)], { stdio: "inherit" });
  console.log(`contact sheet: ${out}`);
}

async function measureFramePacing(browser, { cpuThrottle, viewport = { width: 1440, height: 900 } } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 1024, isMobile: viewport.width < 768 });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  if (cpuThrottle) await client.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
  await page.goto(`${baseUrl}?quality=high`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__peg && window.__peg.debug().frames > 2, null, { timeout: 90000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  const check = config.heavyInteraction?.stateCheck ? new Function(`return (${config.heavyInteraction.stateCheck})`) : null;
  const before = check ? await page.evaluate(check) : null;
  await page.evaluate(() => {
    window.__frameDeltas = [];
    let last = performance.now();
    const tick = () => { const now = performance.now(); window.__frameDeltas.push(now - last); last = now; if (window.__keepSampling) requestAnimationFrame(tick); };
    window.__keepSampling = true; requestAnimationFrame(tick);
  });
  if (config.heavyInteraction?.trigger) await page.evaluate(new Function(config.heavyInteraction.trigger));
  await page.waitForTimeout(config.heavyInteraction?.durationMs ?? 6000);
  const deltas = await page.evaluate(() => { window.__keepSampling = false; return window.__frameDeltas.slice(1); });
  const after = check ? await page.evaluate(check) : null;
  const renderer = await page.evaluate(() => { const gl = document.createElement("canvas").getContext("webgl2"); const e = gl?.getExtension("WEBGL_debug_renderer_info"); return gl && e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "n/a"; });
  await context.close();
  const sorted = [...deltas].sort((a, b) => a - b);
  const pct = (p) => +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(2);
  const over = (ms) => +(deltas.filter((d) => d > ms).length / deltas.length).toFixed(3);
  return { label: `${viewport.width}x${viewport.height} ${cpuThrottle ? `${cpuThrottle}x CPU throttle` : "unthrottled"}`, renderer,
    stateBefore: before, stateAfter: after, stateChanged: check ? JSON.stringify(before) !== JSON.stringify(after) : null,
    sampleCount: deltas.length, p50_ms: pct(0.5), p95_ms: pct(0.95), pct_over_16_7ms: over(16.7), pct_over_33ms: over(33) };
}

async function main() {
  const browser = await chromium.launch({ headless: !!args.headless, ...(CLASSIC ? { ignoreDefaultArgs: ["--hide-scrollbars"] } : {}) });
  if (!args["pacing-only"]) {
    for (const vp of VIEWPORTS.filter((v) => !ONLY || ONLY.has(v.label))) {
      console.log(`capturing ${vp.label}`);
      const log = await captureViewport(browser, vp);
      console.log(vp.label, "shots", log.shots.length, "errors", log.errors.length, log.renderer);
    }
  }
  if (!args["skip-pacing"] && !CLASSIC) {
    const device = execFileSync("sysctl", ["-n", "hw.model"]).toString().trim();
    const load = execFileSync("uptime").toString().trim();
    const runs = [];
    for (const o of [{}, { cpuThrottle: 4 }, { cpuThrottle: 4, viewport: { width: 390, height: 844 } }]) runs.push(await measureFramePacing(browser, o));
    const file = join(OUT, "frame-pacing.json");
    const prev = existsSync(file) ? JSON.parse(readFileSync(file, "utf-8")) : [];
    prev.push({ device, browser: `Chromium ${browser.version()} ${args.headless ? "headless" : "headed"}`, uptimeAtStart: load, uptimeAtEnd: execFileSync("uptime").toString().trim(),
      heavyInteraction: config.heavyInteraction?.label, measuredAt: new Date().toISOString(), runs });
    writeFileSync(file, JSON.stringify(prev, null, 2));
    console.log(JSON.stringify(runs, null, 1));
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
