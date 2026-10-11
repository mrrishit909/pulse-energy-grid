// P04-QA-001 L4 probe: block ONE artifact at a time (plus highs.wasm / the solver worker) for every consuming scene,
// at 1440x900 and 390x844; assert a visible alert + RETRY inside the viewport, then unblock, click RETRY once and
// assert exactly one re-fetch and that the alert clears. Screenshots of every blocked state in ../routeblock/.
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const base = "http://localhost:4331/pulse-energy-grid/";
const OUT = new URL("../routeblock/", import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const CONSUMES = [
  ["pulse", 0.9, ["dispatch_model.json", "facts.json"]],
  ["source", 0.36, ["dispatch_model.json", "fuel_mix.json", "demand_profile.json", "facts.json", "weather_relation.json", "reconciliation.json", "quality.json", "meta.json"]],
  ["demand", 0.74, ["dispatch_model.json", "facts.json"]],
  ["netload", 0.6, ["fuel_mix.json", "demand_profile.json", "facts.json"]],
  ["forecast", 0.9, ["forecast_samples.json", "forecast_eval.json", "facts.json"]],
  ["dispatch", 0.8, ["dispatch_model.json", "dispatch_results.json", "dispatch_test_vectors.json", "WASM", "WORKER"]],
  ["stress", 0.1, ["dispatch_model.json", "dispatch_results.json"]],
  ["evidence", 0.5, ["forecast_eval.json", "facts.json", "dispatch_model.json", "dispatch_results.json", "dispatch_test_vectors.json", "grid_topology.json", "reconciliation.json", "quality.json", "meta.json"]],
  ["control", 0, ["dispatch_model.json", "dispatch_results.json", "dispatch_test_vectors.json", "WASM", "WORKER"]],
  ["closing", 0.9, ["dispatch_model.json", "meta.json"]],
];
const only = process.argv[2];
const b = await chromium.launch();
const res = [];
for (const [w, h] of [[1440, 900], [390, 844]]) {
  for (const [id, p, files] of CONSUMES) {
    if (only && only !== id) continue;
    for (const f of files) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 1024, isMobile: w < 768 });
      const page = await ctx.newPage();
      let blocked = true; const hits = {};
      const match = (u) => f === "WASM" ? /\.wasm(\?|$)/.test(u) : f === "WORKER" ? /solver\.worker/.test(u) : u.includes("/data/" + f);
      await ctx.route((u) => match(u.toString()), (r) => { hits[f] = (hits[f] ?? 0) + 1; return blocked ? r.fulfill({ status: 503, body: "" }) : r.continue(); });
      const row = { vp: `${w}x${h}`, scene: id, file: f };
      try {
        await page.goto(base + "?quality=high"); await page.keyboard.press("Escape");
        await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing, null, { timeout: 30000 });
        await page.evaluate(([i, q]) => window.__peg.jumpTo(i, q), [id, p]);
        await page.waitForTimeout(2500);
        await page.evaluate(([i, q]) => window.__peg.jumpTo(i, q), [id, p]);
        // the visible alert(s) that name this file (or the solver for WASM/WORKER)
        const sel = f === "WASM" || f === "WORKER" ? "[role=alert], .solver-error, [data-solver-error]" : `[role=alert][data-file="${f}"]`;
        await page.waitForSelector(sel, { timeout: 25000 }).catch(() => {});
        await page.waitForTimeout(800);
        const info = await page.evaluate(([s, sid, file]) => {
          const vh = innerHeight, vw = innerWidth;
          const scene = document.getElementById(sid);
          const inView = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw && cs.visibility !== "hidden" && +cs.opacity > 0.3; };
          let alerts = [...document.querySelectorAll(s)];
          if (file === "WASM" || file === "WORKER") alerts = alerts.filter((a) => /SOLVER|PRECOMPUTED/i.test(a.textContent));
          const vis = alerts.filter(inView);
          const retry = vis.map((a) => a.querySelector("button")).filter((x) => x && /RETRY/i.test(x.textContent) && inView(x));
          return { n: alerts.length, visible: vis.length, inScene: vis.filter((a) => scene.contains(a)).length, retryVisible: retry.length, text: vis.map((a) => a.textContent.trim().slice(0, 90)), solver: window.__peg.solver() };
        }, [sel, id, f]);
        Object.assign(row, info);
        await page.screenshot({ path: `${OUT}${w}-${id}-${f.replace(".json", "")}.jpg`, type: "jpeg", quality: 45 });
        blocked = false;
        const before = hits[f] ?? 0;
        if (info.retryVisible) {
          await page.evaluate(([s, file]) => { let a = [...document.querySelectorAll(s)]; if (file === "WASM" || file === "WORKER") a = a.filter((x) => /SOLVER|PRECOMPUTED/i.test(x.textContent)); const r = innerHeight; const btn = a.map((x) => x.querySelector("button")).find((x) => x && /RETRY/i.test(x.textContent) && x.getBoundingClientRect().bottom <= r && x.getBoundingClientRect().top >= 0); btn.click(); }, [sel, f]);
          await page.waitForTimeout(f === "WASM" || f === "WORKER" ? 15000 : 4000);
          row.refetches = (hits[f] ?? 0) - before;
          row.after = await page.evaluate(([s, file]) => { let a = [...document.querySelectorAll(s)]; if (file === "WASM" || file === "WORKER") a = a.filter((x) => /SOLVER UNAVAILABLE|SOLVER ERROR|COULD NOT/i.test(x.textContent)); return { remaining: a.length, solver: window.__peg.solver().status }; }, [sel, f]);
        }
        row.ok = row.visible >= 1 && row.retryVisible >= 1 && (f === "WASM" || f === "WORKER" ? row.after?.solver === "ready" && row.refetches >= 1 : row.refetches === 1 && row.after?.remaining === 0);
      } catch (e) { row.error = String(e).slice(0, 200); row.ok = false; }
      res.push(row); console.log(JSON.stringify(row));
      await ctx.close();
    }
  }
}
writeFileSync(`${OUT}results${only ? "-" + only : ""}.json`, JSON.stringify(res, null, 1));
await b.close();
