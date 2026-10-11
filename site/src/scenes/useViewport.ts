import { useEffect, useState } from "react";
import { currentClass } from "../graphics/canvas";

/** w: the stage box (without classic scrollbars) for geometry; cls: the composition class, from the CSS media queries (L1). */
const read = () => ({ w: document.documentElement.clientWidth, h: innerHeight, cls: currentClass() });
/** The stage box (viewport without classic scrollbars), re-read on resize. */
export function useViewport() {
  const [v, set] = useState(read);
  useEffect(() => {
    const on = () => set((o) => { const n = read(); return n.w === o.w && n.h === o.h && n.cls === o.cls ? o : n; });
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return v;
}
