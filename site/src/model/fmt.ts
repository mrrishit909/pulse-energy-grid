/**
 * C/Python `%.10g` for doubles, byte-for-byte (the LP text hash depends on it).
 * Differences from toPrecision(10): the exponent switch is at e < -4 (not -6),
 * the exponent has at least two digits ("e-05"), trailing zeros and a bare dot
 * are stripped, "-0" keeps its sign, and exact ties round half-even on the exact
 * binary value (toPrecision rounds ties up). toExponential(99) prints 100
 * correctly rounded digits, which is exact for every double the LP produces
 * (|x| >= 1e-4 has at most ~75 significant decimal digits), so the tie test is exact.
 */
export function g10(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  if (x === 0) return Object.is(x, -0) ? "-0" : "0";
  const neg = x < 0;
  const [mant, expS] = Math.abs(x).toExponential(99).split("e") as [string, string];
  const digits = mant.replace(".", "").split("").map(Number);
  let exp = Number(expS);
  const P = 10;
  const head = digits.slice(0, P);
  const next = digits[P]!;
  const restZero = digits.slice(P + 1).every((d) => d === 0);
  const roundUp = next > 5 || (next === 5 && (!restZero || head[P - 1]! % 2 === 1));
  if (roundUp) {
    let i = P - 1;
    while (i >= 0 && head[i] === 9) head[i--] = 0;
    if (i >= 0) head[i]!++;
    else { head.unshift(1); head.pop(); exp++; }
  }
  let out: string;
  if (exp < -4 || exp >= P) {
    const m = strip(`${head[0]}.${head.slice(1).join("")}`);
    out = `${m}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
  } else if (exp >= 0) {
    out = strip(`${head.slice(0, exp + 1).join("")}.${head.slice(exp + 1).join("")}`);
  } else {
    out = strip(`0.${"0".repeat(-exp - 1)}${head.join("")}`);
  }
  return neg ? `-${out}` : out;
}

function strip(s: string) {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** Inputs are published rounded to 4 decimals (DATA_CONTRACTS DR-7); visitor params get the same rule. */
export const round4 = (x: number) => Math.floor(x * 1e4 + 0.5) / 1e4;
