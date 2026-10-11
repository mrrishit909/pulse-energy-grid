// P04-QA-001: block highs.wasm or the solver worker, confirm the labelled PRECOMPUTED fallback + RETRY in S05 and CTRL,
// unblock, press the visible RETRY once, and confirm the solver comes back (ready, parity, SOLVED IN BROWSER).
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
const base = "http://localhost:4331/pulse-energy-grid/";
const b = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844]]) for (const scene of ["dispatch", "control"]) for (const what of ["wasm", "worker"]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 1024 });
  let blocked = true, hits = 0;
  await ctx.route((u) => (what === "wasm" ? /\.wasm/ : /solver\.worker/).test(u.toString()), (r) => { hits++; return blocked ? r.fulfill({ status: 503, body: "" }) : r.continue(); });
  const page = await ctx.newPage();
  await page.goto(base + "?quality=high"); await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
  await page.evaluate(([s]) => window.__peg.jumpTo(s, s === "dispatch" ? 0.8 : 0), [scene]); await page.waitForTimeout(6000);
  const before = await page.evaluate((s) => ({ txt: document.getElementById(s).innerText.match(/IN-BROWSER SOLVER UNAVAILABLE[^\n]*/)?.[0], solver: window.__peg.solver().status }), scene);
  const btn = page.locator(`#${scene} button`, { hasText: /^RETRY$/ }).first();
  const vis = await btn.isVisible().catch(() => false), inView = vis && await btn.evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
  await page.screenshot({ path: new URL(`../screens/solver-${what}-blocked-${scene}-${w}.jpg`, import.meta.url).pathname, type: "jpeg", quality: 55 });
  blocked = false; const h0 = hits;
  if (vis) { await btn.click(); await page.waitForFunction(() => window.__peg.solver().status === "ready", null, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(3000); }
  const after = await page.evaluate((s) => ({ solver: window.__peg.solver(), solved: /SOLVED IN BROWSER/.test(document.getElementById(s).innerText) }), scene);
  console.log(JSON.stringify({ vp: w, scene, what, before, retryVisible: vis, retryInView: inView, refetches: hits - h0, afterStatus: after.solver.status, parity: after.solver.parity?.passed, solvedInBrowser: after.solved }));
  await ctx.close();
}
await b.close();
