import { Fragment, useEffect, useRef, type ElementType } from "react";
import { Reveal } from "../motion/reveal";
import { useFrame, useProgress } from "../scroll/hooks";
import { windowed } from "../motion/progress";
import { getProgress } from "../scroll/engine";

type Mode =
  | { kind: "scrub"; track: string; from?: number; to?: number }
  | { kind: "time"; playKey: number; per?: number; stagger?: number }
  | { kind: "value"; t: number };

interface Props {
  text: string;
  as?: ElementType;
  className?: string;
  mode: Mode;
  blur?: number;
  id?: string;
  tabIndex?: number;
  "data-scene-heading"?: boolean;
}

/** Blur-to-sharp word reveal. Text is in the DOM, ghosted (never opacity 0), from first paint. */
export function WordReveal({ text, as: Tag = "h2", className = "", mode, blur = 12, ...rest }: Props) {
  const ref = useRef<HTMLElement>(null);
  const reveal = useRef<Reveal | null>(null);
  const start = useRef(0);
  const busy = useRef(false);
  const words = text.split(/\s+/);

  const scrubWin = mode.kind === "scrub" ? `${mode.track}:${mode.from ?? 0}:${mode.to ?? 1}` : "";
  useEffect(() => {
    reveal.current = ref.current ? new Reveal(ref.current, blur) : null;
    // new words (copy arrived / swapped): show the state the current progress implies
    if (scrubWin) {
      const [track, a, b] = scrubWin.split(":");
      reveal.current?.scrub(windowed(getProgress(track!), Number(a), Number(b)));
    } else if (!busy.current && start.current) reveal.current?.set(1);
  }, [text, blur, scrubWin]);
  const valueT = mode.kind === "value" ? mode.t : -1;
  useEffect(() => {
    if (valueT >= 0) reveal.current?.scrub(valueT);
  }, [valueT, text]);

  const trackId = mode.kind === "scrub" ? mode.track : "";
  useProgress(trackId, (p) => {
    if (mode.kind !== "scrub") return;
    reveal.current?.scrub(windowed(p, mode.from ?? 0, mode.to ?? 1));
  });

  const playKey = mode.kind === "time" ? mode.playKey : 0;
  useEffect(() => {
    if (!playKey) return;
    start.current = 0;
    busy.current = true;
    reveal.current?.set(0);
  }, [playKey]);
  useFrame((now) => {
    if (mode.kind !== "time" || !busy.current || !reveal.current) return;
    if (!start.current) start.current = now;
    busy.current = reveal.current.timed(now - start.current, mode.per, mode.stagger);
  });

  return (
    <Tag ref={ref} className={`wr ${className}`} {...rest}>
      {words.map((w, i) => (
        <Fragment key={i}>
          <span className="wr-word">{w}</span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </Tag>
  );
}
