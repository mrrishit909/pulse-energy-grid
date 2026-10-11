export type Honesty = "OBSERVED" | "DERIVED" | "PREDICTED" | "SIMULATED" | "SYNTHETIC";

interface Props {
  tag: Honesty;
  /** Extra mono detail after the tag, e.g. "BPR VOLUME-DELAY". */
  detail?: string;
  /** On light fills (light-blue cards) the chip switches to black ink. */
  onLight?: boolean;
  className?: string;
}

/** Data honesty tag. SIMULATED always carries hatch + dashed edge, never colour alone. */
export function HonestyChip({ tag, detail, onLight, className = "" }: Props) {
  return (
    <span className={`chip chip--${tag.toLowerCase()} ${onLight ? "chip--on-light" : ""} ${className}`}>
      <span className="chip__mark" aria-hidden="true" />
      {tag}
      {detail ? <span className="chip__detail"> · {detail}</span> : null}
    </span>
  );
}
