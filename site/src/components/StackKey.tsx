import type { CSSProperties } from "react";
import { FUEL, TOKEN } from "../graphics/rose";

const NAME: Record<string, string> = { gas: "GAS", peaker: "GAS PEAKER", battery: "BATTERY" };

/** QA L3: a compact colour key for a rose (one swatch per fuel token present, wrapping), never hidden on any viewport. */
export function StackKey({ keys, className = "" }: { keys: string[]; className?: string }) {
  const tokens = [...new Set(keys.map((k) => TOKEN[k] ?? "other"))];
  return (
    <ul className={`stack-key ${className}`} aria-label="Colour key, centre outward">
      {tokens.map((t) => <li key={t}><span className="swatch" style={{ "--c0": FUEL[t]!.c0, "--c1": FUEL[t]!.c1 } as CSSProperties} aria-hidden="true" />{NAME[t] ?? t.toUpperCase()}</li>)}
    </ul>
  );
}
