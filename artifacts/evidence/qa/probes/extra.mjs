// P04-QA-001 follow-up probes: reduced-motion phone zoom, S04 verdict card text on phones, CTRL PRICE frames,
// S04 phone day picker, CANCEL SOLVE under CPU throttle, wasm GETs on a normal load, console 404 identity.
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
const base = "http://localhost:4331/pulse-energy-grid/";
const SC = new URL("../screens/", import.meta.url).pathname;
const b = await chromium.launch();
const open = async (w, h, o = {}) => { const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 1024, ...o }); const page = await ctx.newPage(); return { ctx, page }; };
const ready = async (page) => { await page.goto(base + "?quality=high"); await page.waitForFunction(() => window.__peg); await page.keyboard.press("Escape"); await page.waitForFunction(() => !window.__peg.introStats().playing); };
// 1 reduced-motion zoom
for (const w of [390, 375, 360]) { const { ctx, page } = await open(w, 844, { reducedMotion: "reduce" }); await ready(page); await page.waitForTimeout(1500);
  console.log("zoom", w, JSON.stringify(await page.evaluate(() => ({ scale: visualViewport.scale, vvW: visualViewport.width, innerW: innerWidth, scrollW: document.documentElement.scrollWidth })))); await ctx.close(); }
// 2 verdict cards text on phones and desktop
for (const [w, h] of [[1440, 900], [390, 844], [375, 812], [360, 800]]) { const { ctx, page } = await open(w, h); await ready(page);
  await page.evaluate(() => window.__peg.jumpTo("forecast", 0.9)); await page.waitForTimeout(2500);
  const cards = await page.evaluate(() => { const hs = [...document.querySelectorAll("#forecast h3, #forecast [class*=verdict] h3, #forecast .serif")].filter((e) => /forecast|beat|better/i.test(e.textContent)); return hs.map((hd) => { const card = hd.parentElement; const r = card.getBoundingClientRect(); return { title: hd.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), titlePx: getComputedStyle(hd).fontSize, text: card.innerText.replace(/\s+/g, " ").slice(0, 400) }; }); });
  console.log("verdict", w, JSON.stringify(cards)); await ctx.close(); }
// 3 CTRL PRICE frames (heat wave preset) 1440 and 390
for (const [w, h] of [[1440, 900], [390, 844]]) { const { ctx, page } = await open(w, h); await ready(page);
  await page.evaluate(() => window.__peg.jumpTo("control", 0)); await page.waitForTimeout(3000);
  if (w < 768) { await page.locator(".ctrl-open").click(); await page.waitForTimeout(600); }
  await page.locator("#control button, .ctrl-sheet button", { hasText: "HEAT WAVE +5 C" }).first().click(); await page.waitForTimeout(3500);
  await page.locator("[role=radio]", { hasText: /^PRICE$/ }).last().click(); await page.waitForTimeout(1500);
  if (w < 768) { await page.keyboard.press("Escape"); await page.waitForTimeout(800); }
  await page.evaluate(() => window.__peg.jumpTo("control", 0)); await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SC}ctrl-price-heatwave-${w}.jpg`, type: "jpeg", quality: 70 });
  await page.locator("[role=radio]", { hasText: /^PRICE$/ }).last().evaluate(() => {}); console.log("ctrl price", w, JSON.stringify(await page.evaluate(() => window.__peg.ctrl().params))); await ctx.close(); }
// 4 S04 phone day picker
{ const { ctx, page } = await open(390, 844); await ready(page); await page.evaluate(() => window.__peg.jumpTo("forecast", 0.9)); await page.waitForTimeout(2500);
  const before = await page.evaluate(() => window.__peg.setForecast && document.querySelector("#forecast").innerText.match(/\d\d\.\d\d/g)?.slice(0, 3));
  const btn = page.locator("#forecast button", { hasText: "09.05" }).first(); const vis = await btn.isVisible().catch(() => false);
  if (vis) { await btn.tap(); await page.waitForTimeout(1200); }
  const after = await page.evaluate(() => ({ pressed: [...document.querySelectorAll("#forecast button")].filter((x) => x.getAttribute("aria-pressed") === "true" || x.getAttribute("aria-checked") === "true" || x.classList.contains("is-on")).map((x) => x.textContent.trim()), axis: document.querySelector("#forecast").innerText.match(/\n\d\d\.\d\d\n/g) }));
  await page.screenshot({ path: `${SC}s04-daypicker-0905-390.jpg`, type: "jpeg", quality: 70 });
  console.log("daypicker", vis, JSON.stringify(before), JSON.stringify(after), JSON.stringify(await page.evaluate(() => { const f = window.__peg; return null; }))); await ctx.close(); }
// 5 CANCEL SOLVE under 6x CPU throttle
{ const { ctx, page } = await open(1440, 900); await ready(page); await page.evaluate(() => window.__peg.jumpTo("control", 0)); await page.waitForTimeout(4000);
  await page.waitForFunction(() => window.__peg.solver().status === "ready", null, { timeout: 60000 });
  const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 20 });
  const seq0 = await page.evaluate(() => window.__peg.ctrl().seq);
  const s = page.locator("#control input[type=range]").nth(4); await s.focus(); await page.keyboard.press("ArrowRight");
  let seen = false, clicked = false;
  for (let i = 0; i < 40 && !clicked; i++) { const c = page.locator("#control button", { hasText: "CANCEL SOLVE" }); if (await c.isVisible().catch(() => false)) { seen = true; await c.click(); clicked = true; } else await page.waitForTimeout(25); }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }); await page.waitForTimeout(3000);
  console.log("cancel", JSON.stringify({ seen, clicked, seq0, after: await page.evaluate(() => ({ seq: window.__peg.ctrl().seq, hours: window.__peg.ctrl().params.battery_hours, solver: window.__peg.solver().status, parity: window.__peg.solver().parity?.passed, status: document.querySelector("#control .ctrl-status").innerText.replace(/\s+/g, " ").slice(0, 160) })) }));
  await ctx.close(); }
// 6 normal-load wasm GET count + 404s
{ const { ctx, page } = await open(1440, 900); const reqs = [], bad = [];
  ctx.on("request", (r) => { if (/\.wasm/.test(r.url())) reqs.push(r.url().split("/").pop()); }); ctx.on("response", (r) => { if (r.status() >= 400) bad.push(r.status() + " " + r.url()); });
  page.on("console", (m) => { if (m.type() === "error") bad.push("console " + m.text() + " @ " + JSON.stringify(m.location())); });
  await ready(page); await page.evaluate(() => window.__peg.jumpTo("dispatch", 0.8)); await page.waitForTimeout(8000);
  console.log("wasm GETs normal load", reqs.length, reqs, "404s", JSON.stringify(bad)); await ctx.close(); }
await b.close();
