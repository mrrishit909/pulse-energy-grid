import { expect, test, type Page } from "@playwright/test";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The rose's canvas hour labels never sit under visible DOM text of the active scene (generic bbox test). */
async function overlaps(page: Page, id: string) {
  return page.evaluate((sid) => {
    const labels = (window as any).__peg.debug().labels as { h: number; x: number; y: number; w: number; hgt: number }[];
    const stage = document.getElementById(sid)!.querySelector(".stage")!;
    const texts = [...stage.querySelectorAll<HTMLElement>("p, h1, h2, h3, li, button, label, span.chip, figcaption, .readout-hour")]
      .filter((e) => e.offsetParent !== null && e.textContent?.trim() && getComputedStyle(e).visibility !== "hidden" && Number(getComputedStyle(e).opacity) > 0.05);
    const hits: string[] = [];
    for (const b of labels) for (const e of texts) {
      // text boxes only where the element's own text lies: use Range rects, not the padded box
      const r = document.createRange(); r.selectNodeContents(e);
      for (const t of r.getClientRects()) {
        if (b.x < t.right && b.x + b.w > t.left && b.y < t.bottom && b.y + b.hgt > t.top) hits.push(`${String(b.h).padStart(2, "0")} vs "${e.textContent!.trim().slice(0, 40)}"`);
      }
    }
    return { n: labels.length, hits: [...new Set(hits)] };
  }, id);
}

for (const [id, p] of [["demand", 0.74], ["dispatch", 0.8]] as const) {
  test(`hour labels clear of text: ${id}`, async ({ page }) => {
    await page.goto("?quality=high");
    await page.keyboard.press("Escape");
    await page.evaluate(([i, q]) => (window as any).__peg.jumpTo(i, q), [id, p] as const);
    if (id === "dispatch") await page.waitForFunction(() => (window as any).__peg.solver().parity !== null, null, { timeout: 60_000 });
    await page.waitForTimeout(900);
    const r = await overlaps(page, id);
    expect(r.n).toBeGreaterThan(0);
    expect(r.hits).toEqual([]);
  });
}
