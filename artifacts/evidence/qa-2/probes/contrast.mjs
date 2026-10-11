// P04-QA-002 L16: pixel-sampled contrast. For each scene point: collect visible text-bearing elements (own text node,
// effective opacity > 0.3, font >= 0), screenshot the frame with ALL text made transparent (backings kept), then for
// each element box take the worst-case backdrop pixel (p95 luminance for light text, p5 for dark text) and compute the
// WCAG ratio against the element's computed colour (alpha-composited over that pixel). Threshold 4.5 (3.0 for >= 24px).
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
const base = "http://localhost:4331/pulse-energy-grid/";
const WALK = [["pulse", 0.02], ["pulse", 0.78], ["source", 0.36], ["source", 0.58], ["demand", 0.74], ["netload", 0.6], ["netload", 0.8], ["forecast", 0.03], ["forecast", 0.9],
  ["dispatch", 0.4], ["dispatch", 0.8], ["stress", 0.1], ["stress", 0.64], ["evidence", 0.05], ["evidence", 0.5], ["evidence", 0.8], ["control", 0], ["closing", 0.5], ["closing", 0.76], ["closing", 0.97]];
const TMP = new URL("../logs/tmp-contrast.png", import.meta.url).pathname;
const py = `
import sys,json
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB'); els=json.load(open(sys.argv[2])); out=[]
lin=lambda c:(c/255)/12.92 if c/255<=0.04045 else ((c/255+0.055)/1.055)**2.4
L=lambda p:0.2126*lin(p[0])+0.7152*lin(p[1])+0.0722*lin(p[2])
for e in els:
  x0,y0,x1,y1=[int(v) for v in (e['x'],e['y'],e['x']+e['w'],e['y']+e['h'])]
  px=[im.getpixel((x,y)) for y in range(max(0,y0),min(im.height,y1),2) for x in range(max(0,x0),min(im.width,x1),2)]
  if not px: continue
  px.sort(key=L); r,g,b,a=e['c']
  light=L((r,g,b))>0.18
  bg=px[int(len(px)*0.95)] if light else px[int(len(px)*0.05)]
  t=tuple(a*c+(1-a)*k for c,k in zip((r,g,b),bg))
  lt,lb=L(t),L(bg); ratio=(max(lt,lb)+0.05)/(min(lt,lb)+0.05)
  need=3.0 if e['fs']>=24 else 4.5
  if ratio<need: out.append({'t':e['t'],'ratio':round(ratio,2),'need':need,'fg':[round(v) for v in t],'bg':bg,'box':[x0,y0,x1-x0,y1-y0]})
print(json.dumps(out))
`;
const b = await chromium.launch({ headless: false });
const res = [];
for (const [w, h, rm] of [[1440, 900, "no-preference"], [768, 1024, "no-preference"], [390, 844, "no-preference"], [360, 800, "no-preference"], [390, 844, "reduce"], [1440, 900, "reduce"]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 1024, reducedMotion: rm, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(base + "?quality=high"); await page.waitForTimeout(300); await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
  for (const [id, p] of WALK) {
    await page.evaluate(([i, q]) => window.__peg.jumpTo(i, q), [id, p]); await page.waitForTimeout(1600);
    const els = await page.evaluate(() => {
      const out = []; const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const seen = new Set();
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        const el = n.parentElement; if (!el || seen.has(el) || !n.textContent.trim() || el.closest(".sr-only, [aria-hidden=true], details:not([open])")) continue; seen.add(el);
        let op = 1, hidden = false; for (let k = el; k; k = k.parentElement) { const cs = getComputedStyle(k); op *= +cs.opacity; if (cs.visibility === "hidden" || cs.display === "none") hidden = true; }
        if (hidden || op < 0.3) continue;
        const rg = document.createRange(); rg.selectNodeContents(n); const r = rg.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        const m = getComputedStyle(el).color.match(/[\d.]+/g).map(Number); const c = [m[0], m[1], m[2], (m[3] ?? 1) * op];
        out.push({ t: n.textContent.trim().slice(0, 40), x: r.left, y: r.top, w: r.width, h: r.height, c, fs: parseFloat(getComputedStyle(el).fontSize) });
      }
      return out;
    });
    await page.addStyleTag({ content: "*{color:transparent!important;text-shadow:none!important;-webkit-text-stroke:0!important;caret-color:transparent!important} *::placeholder{color:transparent!important}" }).then((h) => h.evaluate((e) => e.id = "qa-hide"));
    await page.waitForTimeout(250);
    await page.screenshot({ path: TMP });
    await page.evaluate(() => document.getElementById("qa-hide")?.remove());
    writeFileSync(TMP + ".json", JSON.stringify(els));
    const fails = JSON.parse(execFileSync("python3", ["-c", py, TMP, TMP + ".json"]).toString());
    const row = { vp: `${w}x${h}${rm === "reduce" ? "-reduced" : ""}`, scene: id, p, n: els.length, fails };
    res.push(row); if (fails.length) console.log(JSON.stringify(row).slice(0, 700));
  }
  await ctx.close();
}
unlinkSync(TMP); unlinkSync(TMP + ".json");
writeFileSync(new URL("../logs/contrast.json", import.meta.url).pathname, JSON.stringify(res, null, 1));
console.log("points", res.length, "elements", res.reduce((a, r) => a + r.n, 0), "fails", res.reduce((a, r) => a + r.fails.length, 0));
await b.close();
