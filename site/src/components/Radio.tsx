import { useRef, type KeyboardEvent } from "react";

/** Parameter segmented control (5.14): a radio group of square chips; arrow keys move the choice. */
export function Radio<T extends string>({ label, value, options, onChange, render, disabled, asSelect }: {
  label: string; value: T; options: readonly T[]; onChange: (v: T) => void; render?: (v: T) => string; disabled?: (v: T) => string | null;
  /** M: a native select (opens as the platform picker) instead of a chip row */
  asSelect?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  if (asSelect) {
    return (
      <label className="seg-ctl seg-ctl--select">
        <span className="seg-ctl__label">{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => <option key={o} value={o} disabled={!!disabled?.(o)}>{render ? render(o) : o}</option>)}
        </select>
      </label>
    );
  }
  const key = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    for (let k = 1; k <= options.length; k++) {
      const j = (i + d * k + options.length) % options.length;
      if (!disabled?.(options[j]!)) { onChange(options[j]!); refs.current[j]?.focus(); break; }
    }
  };
  return (
    <div className="seg-ctl" role="radiogroup" aria-label={label}>
      <span className="seg-ctl__label" aria-hidden="true">{label}</span>
      <div className="seg-ctl__row">
        {options.map((o, i) => {
          const why = disabled?.(o) ?? null;
          return (
            <button key={o} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={o === value} aria-disabled={why ? true : undefined}
              tabIndex={o === value ? 0 : -1} title={why ?? undefined} className={`chip-btn ${o === value ? "is-on" : ""} ${why ? "is-disabled" : ""}`}
              onClick={() => { if (!why) onChange(o); }} onKeyDown={(e) => key(e, i)}>
              {render ? render(o) : o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
