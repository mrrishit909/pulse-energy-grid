/** Number formats for copy (tabular, en-US grouping, explicit sign where a delta is shown). */
export const int = (x: number) => Math.round(x).toLocaleString("en-US");
export const fixed = (x: number, d: number) => x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const signedInt = (x: number) => { const r = Math.round(x); return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r).toLocaleString("en-US")}`; };
export const usd = (x: number) => `$${int(x)}`;
export const signedUsd = (x: number) => { const r = Math.round(x); return `${r > 0 ? "+" : r < 0 ? "−" : "±"}$${Math.abs(r).toLocaleString("en-US")}`; };
export const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
