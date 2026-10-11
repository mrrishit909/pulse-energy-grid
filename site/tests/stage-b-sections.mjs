/** Stage B capture sections, one per scene (loaded by tests/stage-b-capture.mjs). */
export default {
  async s06(page, shot, { jump, wait }) {
    await page.waitForFunction(() => window.__peg && true);
    await jump(page, "stress", 0.1); await wait(page, 1600); await shot("s06-1-renewables-up");
    await jump(page, "stress", 0.64); await wait(page, 1600); await shot("s06-4-heat-wave");
    await jump(page, "stress", 0.82); await wait(page, 1600); await shot("s06-5-outage");
    await page.evaluate(() => window.__peg.setStress({ ba: "ERCO", dayId: "summer", layer: "price" }));
    await jump(page, "stress", 0.28); await wait(page, 1700); await shot("s06-2-demand-growth-erco-summer-price");
  },
};
