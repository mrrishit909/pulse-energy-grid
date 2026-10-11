import { useEffect, useState } from "react";

const read = () => ({ w: document.documentElement.clientWidth, h: innerHeight });
/** The stage box (viewport without classic scrollbars), re-read on resize. */
export function useViewport() {
  const [v, set] = useState(read);
  useEffect(() => {
    const on = () => set((o) => { const n = read(); return n.w === o.w && n.h === o.h ? o : n; });
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return v;
}
