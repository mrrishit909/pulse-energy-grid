import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Bottom sheet (T/M): the M ledger, the CTRL controls and the T/M Hour Inspector. Opens upward (350ms premium),
 * Esc or CLOSE closes and returns focus to the opener. On D the same content can render as a side card (`side`).
 */
export function Sheet({ open, onClose, title, children, side = false, className = "", returnFocus }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; side?: boolean; className?: string; returnFocus?: () => HTMLElement | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); returnFocus?.()?.focus({ preventScroll: true }); } };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [open, onClose, returnFocus]);
  if (!open || typeof document === "undefined") return null;
  // portalled to <body>: a pinned stage is transformed, which would make `position: fixed` resolve against it (QA D-006)
  return createPortal(
    <div ref={ref} tabIndex={-1} role="dialog" aria-label={title} className={`sheet ${side ? "sheet--side" : ""} ${className}`}>
      <div className="sheet__head">
        <span className="sheet__title">{title}</span>
        <button type="button" className="btn-square sheet__close" onClick={() => { onClose(); returnFocus?.()?.focus({ preventScroll: true }); }}>CLOSE</button>
      </div>
      <div className="sheet__body">{children}</div>
    </div>,
    document.body,
  );
}
