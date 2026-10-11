#!/usr/bin/env node
/**
 * Stage B evidence (P04-FE-002): production build only (dist/ served on 4331; run `npm run build` first).
 * Sections: fixes (after frames + headline contrast samples), and one section per Stage B scene.
 * Usage: node tests/stage-b-capture.mjs [--only 1440x900] [--sections fixes,s01,...]
 *        python3 tests/contact-sheet.py ../artifacts/evidence/stage-b ; python3 tests/contrast.py ../artifacts/evidence/stage-b
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { preview } from "vite";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean));
const OUT = args.out ? join(HERE, "..", args.out) : join(HERE, "..", "..", "artifacts", "evidence", "stage-b");
const BASE = args.base ?? "http://localhost:4331/pulse-energy-grid/";
const VIEWPORTS = [[1440, 900], [768, 1024], [390, 844]].map(([width, height]) => ({ width, height, label: `${width}x${height}` }))
  .filter((v) => !args.only || args.only.split(",").includes(v.label));
const SECTIONS = (args.sections ?? "fixes,s01,s02,s03b,s04,s06,s07,ctrl,inspector,s08,reduced").split(",");
const hourP = (h) => 0.06 + ((h + 0.5) / 24) * 0.88;
const wait = (page, ms) => page.waitForTimeout(ms);
const jump = (page, id, p) => page.evaluate(([i, q]) => window.__peg.jumpTo(i, q), [id, p]);
const solved = (page) => page.waitForFunction(() => window.__peg.solver().parity && window.__peg.fill().source === "browser", null, { timeout: 60000 });

/** Each section: (page, shot, ctx) => Promise. Scenes register below as they are built. */
export const SECTION_FNS = {
  async fixes(page, shot, { dir, vp, log }) {
    mkdirSync(join(dir, "..", "contrast", vp.label), { recursive: true });
    for (const t of [2600, 3500]) {
      await page.goto(`${BASE}?quality=high`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => window.__peg && window.__peg.debug().frames > 1, null, { timeout: 20000 });
      await page.evaluate((x) => window.__peg.freeze(x), t);
      await wait(page, 500);
      await shot(`fix1-s00-t${t}`);
      // headline contrast: the same frame with the headline hidden, plus its box, for tests/contrast.py
      const box = await page.evaluate(() => { const r = document.querySelector("h1[data-hero]").getBoundingClientRect(); document.querySelector("h1[data-hero]").style.visibility = "hidden"; return { x: r.x, y: r.y, w: r.width, h: r.height }; });
      await wait(page, 100);
      await page.screenshot({ path: join(dir, "..", "contrast", vp.label, `s00-t${t}-noh1.png`) });
      writeFileSync(join(dir, "..", "contrast", vp.label, `s00-t${t}-box.json`), JSON.stringify(box));
      await page.evaluate(() => { document.querySelector("h1[data-hero]").style.visibility = ""; window.__peg.freeze(-1); });
    }
    await page.waitForFunction(() => !window.__peg.introStats().playing, null, { timeout: 20000 });
    for (const h of [12, 19]) {
      await jump(page, "demand", hourP(h));
      await page.waitForFunction((hh) => window.__peg.debug().hour === hh, h);
      await wait(page, 700);
      await shot(`fix2-s03a-h${h}`);
    }
    await page.evaluate(() => window.__peg.setCity({ ba: "ERCO", dayId: "summer" }));
    await wait(page, 900);
    await shot("fix2-s03a-h19-erco-summer");
    await page.evaluate(() => window.__peg.setCity({ ba: "CISO", dayId: "winter" }));
    await jump(page, "dispatch", 0.8);
    await solved(page);
    await wait(page, 900);
    await shot("fix4-s05-default");
    log.push(`${vp.label} labels at S05: ${JSON.stringify(await page.evaluate(() => window.__peg.debug().labels.map((b) => [b.h, Math.round(b.x), Math.round(b.y)])))}`);
  },
};

async function run() {
  const extra = join(HERE, "stage-b-sections.mjs");
  if (existsSync(extra)) Object.assign(SECTION_FNS, (await import(extra)).default);
  let server = null;
  try { server = args.base ? null : await preview({ root: join(HERE, ".."), preview: { port: 4331, strictPort: true } }); }
  catch { console.log("port 4331 busy: using the running preview"); }
  const browser = await chromium.launch();
  const log = [];
  for (const vp of VIEWPORTS) {
    const dir = join(OUT, vp.label);
    mkdirSync(dir, { recursive: true });
    for (const sec of SECTIONS) {
      const fn = SECTION_FNS[sec];
      if (!fn) { log.push(`${vp.label} section ${sec}: not built`); continue; }
      const reduced = sec === "reduced";
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.width < 1024, deviceScaleFactor: 1, reducedMotion: reduced ? "reduce" : "no-preference" });
      const page = await ctx.newPage();
      const external = [];
      page.on("request", (r) => { if (!/^http:\/\/(localhost|127\.0\.0\.1):43\d\d\//.test(r.url()) && !/^(data|blob):/.test(r.url())) external.push(r.url()); });
      page.on("pageerror", (e) => log.push(`${vp.label} ${sec} pageerror ${e.message}`));
      const shot = async (name, p = page) => { await p.screenshot({ path: join(dir, `${name}.png`) }); log.push(`${vp.label}/${name}.png`); };
      if (sec !== "fixes") {
        await page.goto(`${BASE}?quality=high`, reduced ? { waitUntil: "networkidle" } : {});
        await page.evaluate(() => document.fonts.ready);
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing, null, { timeout: 20000 });
      }
      try { await fn(page, shot, { dir, vp, log, ctx, browser, BASE, jump, wait, solved, hourP }); }
      catch (e) { log.push(`${vp.label} ${sec} FAILED ${e.message.split("\n")[0]}`); }
      log.push(`${vp.label} ${sec} external requests: ${external.length ? external.join(", ") : "none"}`);
      await ctx.close();
    }
  }
  await browser.close();
  await server?.close();
  const prev = existsSync(join(OUT, "capture-log.txt")) && (args.only || args.sections) ? readFileSync(join(OUT, "capture-log.txt"), "utf-8") : "";
  writeFileSync(join(OUT, "capture-log.txt"), prev + log.join("\n") + "\n");
  console.log(log.filter((l) => !l.endsWith(".png")).join("\n"));
}
run().catch((e) => { console.error(e); process.exit(1); });
