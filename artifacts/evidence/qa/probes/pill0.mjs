import { chromium } from "/Users/rishitmathurrishit/data-frontier/projects/04-pulse-energy-grid/site/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch();
for (const [w,h] of [[390,844],[375,812],[360,800],[768,1024]]) for (const rm of ["reduce","no-preference"]) {
const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: rm, isMobile: w<768, hasTouch: true }); const page = await ctx.newPage();
await page.goto("http://localhost:4331/pulse-energy-grid/"); await page.keyboard.press("Escape"); await page.waitForTimeout(2500);
const out=[];
for (const y of [0, 200, 400, 800]) { await page.evaluate((v)=>window.scrollTo(0,v), y); await page.waitForTimeout(500);
 out.push(y+":"+await page.evaluate(() => { const p=document.querySelector(".menu-pill"); const r=p.getBoundingClientRect(); const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2); return (t===p||p.contains(t))?"ok":"COVERED by ."+String(t?.className).slice(0,30); })); 
 if (y===0 && rm==="reduce" && w===390) await page.screenshot({path:"/Users/rishitmathurrishit/data-frontier/projects/04-pulse-energy-grid/artifacts/evidence/qa/screens/pill-covered-390-reduced-top.jpg",type:"jpeg",quality:60});
}
let clicked="n/a"; await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(400);
try { await page.locator(".menu-pill").click({timeout:3000}); clicked = await page.locator(".menu-pill").getAttribute("aria-expanded"); } catch { clicked="CLICK BLOCKED"; }
console.log(w,rm,out.join(" | "),"click@top:",clicked);
await ctx.close(); }
await b.close();
