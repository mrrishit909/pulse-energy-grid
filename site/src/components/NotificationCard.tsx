import type { ReactNode } from "react";
import { WordReveal } from "./WordReveal";

interface Props {
  from: string;
  when: string;
  body: string;
  variant?: "dark" | "light";
  tag?: ReactNode;
  /** Changing this number replays the typing. 0 = show final text. */
  playKey: number;
}

/** #161616 (or light-blue) notification card; the body types in word by word. */
export function NotificationCard({ from, when, body, variant = "dark", tag, playKey }: Props) {
  return (
    <article className={`note note--${variant}`}>
      <header className="note__head">
        <span>{from}</span>
        <span>{when}</span>
      </header>
      <WordReveal
        as="p"
        className="note__body"
        text={body}
        blur={6}
        mode={playKey ? { kind: "time", playKey, per: 260, stagger: 70 } : { kind: "value", t: 1 }}
      />
      {tag ? <div className="note__tag">{tag}</div> : null}
    </article>
  );
}
