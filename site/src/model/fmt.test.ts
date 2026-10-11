import { describe, expect, it } from "vitest";
import { g10 } from "./fmt";

describe("%.10g", () => {
  it("matches C/Python on the shapes the LP text uses", () => {
    const cases: [number, string][] = [
      [0, "0"], [-0, "-0"], [9, "9"], [34.5, "34.5"], [52.25, "52.25"], [1000, "1000"], [22079, "22079"],
      [0.9486832980505138, "0.9486832981"], [1.0540925533894598, "1.054092553"], [46.18, "46.18"], [1962.65, "1962.65"],
      [1e-5, "1e-05"], [0.0001, "0.0001"], [0.00012345678912, "0.0001234567891"], [12345678901, "1.23456789e+10"],
      [1234567890, "1234567890"], [9999999999.6, "1e+10"], [-3.25, "-3.25"], [0.1 + 0.2, "0.3"], [1 / 3, "0.3333333333"],
    ];
    for (const [x, s] of cases) expect(g10(x), String(x)).toBe(s);
  });
  it("rounds exact ties half-even like Python (toPrecision rounds them up)", () => {
    // 1234567.8125 = 12345678125e-4 exactly: an exact tie at 10 digits
    expect((1234567.8125).toPrecision(10)).toBe("1234567.813");
    expect(g10(1234567.8125)).toBe("1234567.812");
    expect(g10(1234567.8375)).toBe("1234567.837"); // not a tie: stored slightly below .8375 (Python agrees)
  });
});
