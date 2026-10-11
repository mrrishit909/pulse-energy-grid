/** Stage B capture sections, one per scene (loaded by tests/stage-b-capture.mjs). */
const base = {
  async s06(page, shot, { jump, wait }) {
    await page.waitForFunction(() => window.__peg && true);
    await jump(page, "stress", 0.1); await wait(page, 1600); await shot("s06-1-renewables-up");
    await jump(page, "stress", 0.64); await wait(page, 1600); await shot("s06-4-heat-wave");
    await jump(page, "stress", 0.82); await wait(page, 1600); await shot("s06-5-outage");
    await page.evaluate(() => window.__peg.setStress({ ba: "ERCO", dayId: "summer", layer: "price" }));
    await jump(page, "stress", 0.28); await wait(page, 1700); await shot("s06-2-demand-growth-erco-summer-price");
  },
};
export const ctrlSection = {
  async ctrl(page, shot, { jump, wait, vp }) {
    const toCtrl = async () => { await jump(page, "control"); await page.waitForFunction(() => window.__peg.ctrl().source === "browser", null, { timeout: 60000 }); await wait(page, 900); };
    await toCtrl(); await shot("ctrl-1-default-live");
    let seq = await page.evaluate(() => window.__peg.ctrl().seq);
    await page.evaluate(() => window.__peg.setCtrl({ renewables_scale: 1.8, battery_power_mw: 4000, battery_hours: 6, heat_wave_c: 3, demand_growth_pct: 10 }));
    await page.waitForFunction((s) => window.__peg.ctrl().seq > s, seq, { timeout: 30000 }); await wait(page, 1200);
    await jump(page, "control"); await wait(page, 300);
    await shot("ctrl-2-your-scenario");
    await page.locator(".ctrl [role=radiogroup][aria-label=LAYER] [role=radio]", { hasText: "PRICE" }).first().click().catch(() => {});
    await page.evaluate(() => window.__peg.setCtrlTimeLimit(0.000001));
    await page.evaluate(() => window.__peg.setCtrl({ battery_hours: 5 }));
    await page.waitForFunction(() => /TIME LIMIT/.test(window.__peg.ctrl().check ?? ""), null, { timeout: 30000 }); await wait(page, 900);
    await jump(page, "control"); await wait(page, 300);
    await shot("ctrl-3-price-layer-time-limit-reached");
    await page.evaluate(() => window.__peg.setCtrlTimeLimit(10));
    await page.evaluate(() => window.__peg.openHour("control", 19)); await wait(page, 800);
    await shot("ctrl-4-hour-inspector");
    if (vp.width < 768) { await page.evaluate(() => window.__peg.openHour("x", 0)); await page.locator(".ctrl-open").click(); await wait(page, 600); await shot("ctrl-5-m-controls-sheet"); }
  },
};

export default { ...base, ...ctrlSection };
