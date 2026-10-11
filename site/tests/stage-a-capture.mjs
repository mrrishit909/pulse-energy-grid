#!/usr/bin/env node
/**
 * Stage A evidence (P04-FE-001): real screenshots of the PRODUCTION build (dist/, served in-process
 * by vite preview on 4331; run `npm run build` first), never the dev server.
 * S00 at frozen intro times, S03a at 3 hours, S05 default + 2 live scenarios + mid-fill + the
 * PRECOMPUTED fallback (worker blocked) + loading, and reduced motion, at 1440x900, 768x1024, 390x844.
 * Usage: node tests/stage-a-capture.mjs [--only 1440x900] ; then python3 tests/contact-sheet.py ../artifacts/evidence/stage-a
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { preview } from "vite";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "artifacts", "evidence", "stage-a");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean));
const BASE = args.base ?? "http://localhost:4331/pulse-energy-grid/";
const VIEWPORTS = [[1440, 900], [768, 1024], [390, 844]].map(([width, height]) => ({ width, height, label: `${width}x${height}` }))
  .filter((v) => !args.only || args.only.split(",").includes(v.label));
const hourP = (h) => 0.06 + ((h + 0.5) / 24) * 0.88;

const wait = (page, ms) => page.waitForTimeout(ms);
const jump = (page, id, p) => page.evaluate(([i, q]) => window.__peg.jumpTo(i, q), [id, p]);

async function run() {
  let server = null;
  try { server = args.base ? null : await preview({ root: join(HERE, ".."), preview: { port: 4331, strictPort: true } }); }
  catch { console.log("port 4331 busy: using the running preview"); }
  const browser = await chromium.launch();
  const log = [];
  for (const vp of VIEWPORTS) {
    const dir = join(OUT, vp.label);
    mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.width < 1024, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const external = [];
    page.on("request", (r) => { if (!/^http:\/\/(localhost|127\.0\.0\.1):43\d\d\//.test(r.url()) && !/^(data|blob):/.test(r.url())) external.push(r.url()); });
    page.on("pageerror", (e) => log.push(`${vp.label} pageerror ${e.message}`));
    const shot = async (name, p = page) => { await p.screenshot({ path: join(dir, `${name}.png`) }); log.push(`${vp.label}/${name}.png`); };

    // S00: freeze the intro clock (the same clock the rose and the DOM read), then the real end state
    await page.goto(`${BASE}?quality=high`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => window.__peg && window.__peg.debug().frames > 1, null, { timeout: 20000 });
    for (const t of [700, 1500, 2600, 3500]) {
      await page.evaluate((x) => window.__peg.freeze(x), t);
      await wait(page, 450);
      await shot(`01-s00-t${String(t).padStart(4, "0")}`);
    }
    await page.evaluate(() => window.__peg.freeze(-1));
    await page.waitForFunction(() => !window.__peg.introStats().playing, null, { timeout: 20000 });
    await wait(page, 700);
    await shot("01-s00-t4600-end");
    const st = await page.evaluate(() => window.__peg.introStats());
    log.push(`${vp.label} S00 peak petal radius min ${st.minR} (G0 ${st.G0}, frame h ${vp.height}, diameter/h ${(2 * st.minR / vp.height).toFixed(3)}) monotonic ${st.monotonic}`);

    // S03a: three integer hours
    for (const h of [3, 12, 19]) {
      await jump(page, "demand", hourP(h));
      await page.waitForFunction((hh) => window.__peg.debug().hour === hh, h, { timeout: 20000 });
      await wait(page, 600);
      await shot(`02-s03a-h${String(h).padStart(2, "0")}`);
    }
    await page.evaluate(() => window.__peg.setCity({ ba: "ERCO", dayId: "summer" }));
    await wait(page, 900);
    await shot("02-s03a-h19-erco-summer");
    await page.evaluate(() => window.__peg.setCity({ ba: "CISO", dayId: "winter" }));

    // S05: mid fill, default (live), two live scenarios
    await jump(page, "dispatch", 0.34); await wait(page, 900); await shot("03-s05-p34-fill");
    await jump(page, "dispatch", 0.8);
    await page.waitForFunction(() => window.__peg.solver().parity && window.__peg.fill().source === "browser", null, { timeout: 60000 });
    await wait(page, 900);
    await shot("03-s05-default-live");
    const sv = await page.evaluate(() => window.__peg.solver());
    log.push(`${vp.label} solver ${sv.status} HiGHS ${sv.version} parity ${JSON.stringify(sv.parity)}`);
    const scen = async (name, params) => {
      const before = await page.evaluate(() => window.__peg.fill().seq);
      await page.evaluate((p) => window.__peg.setFill(p), params);
      await page.waitForFunction((b) => window.__peg.fill().seq > b && window.__peg.fill().source === "browser", before, { timeout: 30000 });
      await wait(page, 1200);
      await shot(name);
      log.push(`${vp.label} ${name} objective ${(await page.evaluate(() => window.__peg.fill())).objective}`);
    };
    await scen("03-s05-scenario-battery-6000mw", { battery_power_mw: 6000 });
    await scen("03-s05-scenario-renewables-1.5-battery-6000mw-6h", { renewables_scale: 1.5, battery_hours: 6 });
    await ctx.close();

    // S05 fallback: the worker chunk is blocked, so the PRECOMPUTED Python result is shown, labelled
    const fctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.width < 1024, deviceScaleFactor: 1 });
    const fp = await fctx.newPage();
    await fp.route("**/assets/solver.worker-*.js", (r) => r.abort());
    await fp.goto(`${BASE}?quality=high#dispatch`);
    await fp.waitForFunction(() => window.__peg && ["error", "disabled"].includes(window.__peg.solver().status) && window.__peg.fill().source === "precomputed", null, { timeout: 30000 });
    await fp.waitForTimeout(900);
    await shot("04-s05-fallback-worker-blocked", fp);
    await fctx.close();

    // S05 loading: the wasm is held, so the live line shows real byte progress while PRECOMPUTED is on screen
    const lctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.width < 1024, deviceScaleFactor: 1 });
    const lp = await lctx.newPage();
    await lp.route("**/assets/highs-*.wasm", () => { /* never answered: loading stays real */ });
    await lp.goto(`${BASE}?quality=high#dispatch`);
    await lp.waitForFunction(() => window.__peg && window.__peg.solver().status === "loading" && window.__peg.fill().source === "precomputed", null, { timeout: 30000 });
    await lp.waitForTimeout(900);
    await shot("04-s05-solver-loading", lp);
    await lctx.close();

    // reduced motion: static frames in normal flow
    const rctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: "reduce", deviceScaleFactor: 1 });
    const rp = await rctx.newPage();
    await rp.goto(BASE, { waitUntil: "networkidle" });
    await rp.evaluate(() => document.fonts.ready);
    await rp.waitForTimeout(1200);
    await shot("05-reduced-s00", rp);
    for (const [sel, name] of [[".city-stills", "05-reduced-s03a"], [".fill-still", "05-reduced-s05"]]) {
      await rp.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "start" }), sel);
      await rp.waitForTimeout(1500);
      await shot(name, rp);
    }
    await rctx.close();
    log.push(`${vp.label} external requests: ${external.length ? external.join(", ") : "none"}`);
  }
  await browser.close();
  await server?.close();
  writeFileSync(join(OUT, "capture-log.txt"), log.join("\n") + "\n");
  console.log(log.filter((l) => !l.endsWith(".png")).join("\n"));
}
run().catch((e) => { console.error(e); process.exit(1); });
