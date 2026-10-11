import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMotion } from "../scroll/hooks";
import { setMotion } from "../state/motion";

export interface NavItem { id: string; label: string }

interface Props {
  items: NavItem[];
  active: string | null;
  onJump: (id: string) => void;
  introPlaying: boolean;
  onSkip: () => void;
  onReplay: () => void;
  /** Render inline (gallery specimen) instead of fixed to the viewport. */
  specimen?: "bar" | "pill";
  defaultOpen?: boolean;
}

/**
 * Floating nav (MOTION_SYSTEM 6.1). D (>= 1024px): bottom-centre square blur bar
 * with a sliding white active block. T/M: white MENU pill naming the current
 * section that expands upward into a blurred list.
 */
export function Nav({ items, active, onJump, introPlaying, onSkip, onReplay, specimen, defaultOpen = false }: Props) {
  const motion = useMotion();
  const [open, setOpen] = useState(defaultOpen);
  const barRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  const pillRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const activeLabel = items.find((i) => i.id === active)?.label ?? items[0]?.label ?? "MENU";

  // Slide the white block under the active item: transform only (translateX + scaleX of a 100px block).
  const place = () => {
    const bar = barRef.current, block = blockRef.current;
    if (!bar || !block) return;
    const a = bar.querySelector<HTMLElement>('[aria-current="location"]');
    if (!a) { block.style.opacity = "0"; return; }
    block.style.transition = placed.current ? "" : "none";
    block.style.opacity = "1";
    const br = bar.getBoundingClientRect(), ar = a.getBoundingClientRect();
    block.style.transform = `translateX(${ar.left - br.left}px) scaleX(${ar.width / 100})`;
    placed.current = true;
  };
  useLayoutEffect(place);
  useEffect(() => {
    addEventListener("resize", place);
    document.fonts?.ready.then(place);
    return () => removeEventListener("resize", place);
  });

  useEffect(() => {
    if (!open || specimen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); pillRef.current?.focus(); }
    };
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    addEventListener("keydown", onKey);
    addEventListener("pointerdown", onDown);
    return () => { removeEventListener("keydown", onKey); removeEventListener("pointerdown", onDown); };
  }, [open, specimen]);

  const jump = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setOpen(false);
    onJump(id);
  };
  const motionBtn = (
    <button type="button" className="nav__util" aria-pressed={!motion} onClick={() => setMotion(!motion)}>
      {motion ? "MOTION ON" : "MOTION OFF"}
    </button>
  );
  const fixed = !specimen;

  return (
    <>
      {(fixed || specimen === "bar") && (
        <nav className={`nav-bar ${fixed ? "is-fixed" : "is-specimen"} ${introPlaying && fixed ? "is-hidden" : ""}`} aria-label={fixed ? "Chapters" : "Chapters, desktop specimen"}>
          <div ref={barRef} className="nav-bar__track">
          <span ref={blockRef} className="nav-bar__block" aria-hidden="true" />
          <ul className="nav-bar__items">
            {items.map((it) => (
              <li key={it.id}>
                <a href={`#${it.id}`} className="nav__item" aria-current={active === it.id ? "location" : undefined} onClick={jump(it.id)}>
                  {it.label}
                </a>
              </li>
            ))}
          </ul>
          </div>
          <div className="nav-bar__utils">
            <button type="button" className="nav__util" onClick={onReplay}>REPLAY INTRO</button>
            {motionBtn}
          </div>
        </nav>
      )}

      {(fixed || specimen === "pill") && (
        <div ref={wrapRef} className={`nav-pill ${fixed ? "is-fixed" : "is-specimen"} ${introPlaying && fixed ? "is-hidden" : ""}`}>
          <nav id={specimen ? "menu-panel-specimen" : "menu-panel"} className={`menu-panel ${open ? "is-open" : ""}`} aria-label={fixed ? "Chapters menu" : "Chapters menu, mobile specimen"} aria-hidden={!open}>
            <ul>
              {items.map((it, i) => (
                <li key={it.id} style={{ "--i": items.length - i } as React.CSSProperties}>
                  <a href={`#${it.id}`} className="nav__item" tabIndex={open ? 0 : -1} aria-current={active === it.id ? "location" : undefined} onClick={jump(it.id)}>
                    {it.label}
                  </a>
                </li>
              ))}
              <li className="menu-panel__utils" style={{ "--i": 0 } as React.CSSProperties}>
                <button type="button" className="nav__util" tabIndex={open ? 0 : -1} onClick={() => { setOpen(false); onReplay(); }}>REPLAY INTRO</button>
                <button type="button" className="nav__util" tabIndex={open ? 0 : -1} aria-pressed={!motion} onClick={() => setMotion(!motion)}>
                  {motion ? "MOTION ON" : "MOTION OFF"}
                </button>
              </li>
            </ul>
          </nav>
          <button ref={pillRef} type="button" className={`menu-pill ${open ? "is-open" : ""}`} aria-expanded={open}
            aria-controls={specimen ? "menu-panel-specimen" : "menu-panel"} onClick={() => setOpen((o) => !o)}>
            <span key={activeLabel} className="menu-pill__label">{open ? "MENU" : activeLabel}</span>
            <span className="menu-pill__icon" aria-hidden="true"><i /><i /></span>
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
      )}

      {fixed && (introPlaying ? (
        <button type="button" className="corner-btn" onClick={onSkip}>SKIP INTRO</button>
      ) : (
        <button type="button" className="corner-btn corner-btn--compact" onClick={onReplay}>REPLAY INTRO</button>
      ))}
    </>
  );
}
