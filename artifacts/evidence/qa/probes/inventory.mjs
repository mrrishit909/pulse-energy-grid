// P04-QA-001: control inventory per scene (role, name, state) at 1440x900.
import { chromium } from "../../../../site/node_modules/@playwright/test/index.mjs";
const base = "http://localhost:4331/pulse-energy-grid/";
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto(base + "?quality=high"); await p.keyboard.press("Escape");
await p.waitForFunction(() => window.__peg && !window.__peg.introStats().playing);
for (const id of ["pulse","source","demand","netload","forecast","dispatch","stress","evidence","control","closing"]) {
  await p.evaluate((i) => window.__peg.jumpTo(i), id); await p.waitForTimeout(1500);
  const c = await p.evaluate((i) => [...document.getElementById(i).querySelectorAll("button, a[href], input, select, summary, [role=tab], [role=radio], [tabindex]")].map((e) => `${e.tagName.toLowerCase()}${e.getAttribute("role") ? "[" + e.getAttribute("role") + "]" : ""} "${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30)}"${e.getAttribute("aria-checked") ? " checked=" + e.getAttribute("aria-checked") : ""}${e.getAttribute("aria-selected") ? " sel=" + e.getAttribute("aria-selected") : ""}${e.getAttribute("aria-disabled") ? " dis=" + e.getAttribute("aria-disabled") : ""}${e.type === "range" ? ` range ${e.min}..${e.max} step ${e.step} = ${e.value}` : ""}`), id);
  console.log("== " + id + " (" + c.length + ")\n  " + c.join("\n  "));
}
await b.close();
