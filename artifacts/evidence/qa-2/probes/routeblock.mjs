// P04-QA-002 L4 + L12 probe: block ONE artifact at a time (plus highs.wasm / the solver worker) for every consuming
// scene (map read from src/scenes/*.tsx SceneErrors at 7041ca5), at 1440x900 and 390x844. Assert a visible alert +
// RETRY inside the viewport; unblock; check elementFromPoint at the RETRY centre returns RETRY; then a REAL pointer
// (page.mouse.click on desktop, touchscreen.tap on phones, never locator.click); assert exactly one re-fetch and the alert clears.
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const base = "http://localhost:4331/pulse-energy-grid/";
const OUT = new URL("../routeblock/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const CONSUMES = [
  ["pulse", 0.9, ["dispatch_model.json", "facts.json"]],
  ["source", 0.36, ["dispatch_model.json", "fuel_mix.json", "demand_profile.json", "facts.json", "weather_relation.json", "reconciliation.json", "quality.json", "meta.json"]],
  ["demand", 0.74, ["dispatch_model.json", "facts.json"]],
  ["netload", 0.6, ["fuel_mix.json", "demand_profile.json", "facts.json"]],
  ["forecast", 0.9, ["forecast_samples.json", "forecast_eval.json", "facts.json", "fuel_mix.json", "demand_profile.json"]],
  ["dispatch", 0.8, ["dispatch_model.json", "dispatch_results.json", "dispatch_test_vectors.json", "WASM", "WORKER"]],
  ["stress", 0.1, ["dispatch_model.json", "dispatch_results.json"]],
  ["evidence", 0.8, ["forecast_eval.json", "facts.json", "dispatch_model.json", "dispatch_results.json", "dispatch_test_vectors.json", "grid_topology.json", "reconciliation.json", "quality.json", "meta.json"]],
  ["control", 0, ["dispatch_model.json", "dispatch_results.json", "dispatch_test_vectors.json", "WASM", "WORKER"]],
  ["closing", 0.9, ["dispatch_model.json", "meta.json"]],
];
const only = process.argv[2], onlyVp = process.argv[3];
const b = await chromium.launch();
const res = [];
const solverish = (f) => f === "WASM" || f === "WORKER";
for (const [w, h] of [[1440, 900], [390, 844]]) {
  if (onlyVp && onlyVp !== String(w)) continue;
  for (const [id, p, files] of CONSUMES) {
    if (only && only !== "all" && only !== id) continue;
    for (const f of files) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 1024, isMobile: w < 768 });
      const page = await ctx.newPage();
      let blocked = true; const hits = {};
      const match = (u) => f === "WASM" ? /\.wasm(\?|$)/.test(u) : f === "WORKER" ? /solver\.worker/.test(u) : u.includes("/data/" + f);
      await ctx.route((u) => match(u.toString()), (r) => { hits[f] = (hits[f] ?? 0) + 1; return blocked ? r.fulfill({ status: 503, body: "" }) : r.continue(); });
      const row = { vp: `${w}x${h}`, scene: id, file: f };
      try {
        await page.goto(base + "?quality=high"); await page.waitForTimeout(300); await page.keyboard.press("Escape");
        await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing, null, { timeout: 30000 });
        await page.evaluate(([i, q]) => window.__peg.jumpTo(i, q), [id, p]);
        await page.waitForTimeout(solverish(f) ? 6000 : 2500);
        await page.evaluate(([i, q]) => window.__peg.jumpTo(i, q), [id, p]);
        const sel = solverish(f) ? "[role=alert], .solver-error, [data-solver-error]" : `[role=alert][data-file="${f}"]`;
        await page.waitForSelector(sel, { timeout: 25000 }).catch(() => {});
        await page.waitForTimeout(800);
        const info = await page.evaluate(([s, sid, file, solv]) => {
          const vh = innerHeight, vw = innerWidth;
          const scene = document.getElementById(sid);
          const inView = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw && cs.visibility !== "hidden" && +cs.opacity > 0.3; };
          let alerts = [...document.querySelectorAll(s)];
          if (solv) alerts = [...scene.querySelectorAll("*")].filter((a) => /IN-BROWSER SOLVER UNAVAILABLE/.test(a.textContent) && [...a.querySelectorAll("button")].some((x) => /RETRY/.test(x.textContent)))
            .filter((a, _, all) => !all.some((o) => o !== a && a.contains(o)));
          const vis = alerts.filter(inView);
          const btns = vis.map((a) => [...a.querySelectorAll("button")].find((x) => /RETRY/i.test(x.textContent) && inView(x))).filter(Boolean);
          const btn = btns[0];
          let pt = null, hit = null;
          if (btn) { const r = btn.getBoundingClientRect(); pt = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; const e = document.elementFromPoint(pt.x, pt.y); hit = e === btn || btn.contains(e) ? "RETRY" : (e ? e.tagName + "." + e.className : "null"); }
          const parityMissing = [...document.querySelectorAll("[data-parity-missing]")].filter(inView).map((e) => e.textContent.trim());
          return { n: alerts.length, visible: vis.length, inScene: vis.filter((a) => (scene && scene.contains(a)) || a.closest(`[data-scene-errors="${sid}"]`)).length, retryVisible: btns.length, pt, hit, text: vis.map((a) => a.textContent.trim().slice(0, 110)), parityMissing, solver: window.__peg.solver().status };
        }, [sel, id, f, solverish(f)]);
        Object.assign(row, info);
        await page.screenshot({ path: `${OUT}${w}-${id}-${f.replace(".json", "")}.jpg`, type: "jpeg", quality: 40 });
        blocked = false;
        const before = hits[f] ?? 0;
        if (info.pt && info.hit === "RETRY") {
          if (w < 768) await page.touchscreen.tap(info.pt.x, info.pt.y); else await page.mouse.click(info.pt.x, info.pt.y);
          await page.waitForTimeout(solverish(f) ? 15000 : 4000);
          row.refetches = (hits[f] ?? 0) - before;
          row.after = await page.evaluate(([s, solv]) => { let a = [...document.querySelectorAll(s)]; if (solv) a = [...document.querySelectorAll("main *")].filter((x) => x.children.length === 0 && /IN-BROWSER SOLVER UNAVAILABLE/.test(x.textContent)); const p = window.__peg.solver().parity; return { remaining: a.length, solver: window.__peg.solver().status, parity: p ? JSON.stringify(p).slice(0, 160) : null, solved: /SOLVED IN BROWSER/.test(document.body.innerText), parityMissing: document.querySelectorAll("[data-parity-missing]").length }; }, [sel, solverish(f)]);
        }
        row.ok = row.visible >= 1 && row.inScene >= 1 && row.hit === "RETRY" && (solverish(f) ? row.after?.solver === "ready" && row.refetches >= 1 : row.refetches === 1 && row.after?.remaining === 0);
      } catch (e) { row.error = String(e).slice(0, 200); row.ok = false; }
      res.push(row); console.log(JSON.stringify(row));
      await ctx.close();
    }
  }
}
writeFileSync(`${OUT}results${only ? "-" + only : ""}${onlyVp ? "-" + onlyVp : ""}.json`, JSON.stringify(res, null, 1));
await b.close();
