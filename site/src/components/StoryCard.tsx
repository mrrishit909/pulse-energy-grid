import type { ReactNode } from "react";

export type CardVariant = "dark" | "blue" | "light" | "orb";

export interface StoryCardProps {
  variant: CardVariant;
  chip: string;
  title: string;
  body: ReactNode;
  visual?: ReactNode;
  tag?: ReactNode;
  index: number;
  count: number;
  /** Only the active card's segments are an interactive tablist. */
  active?: boolean;
  onSelect?: (i: number) => void;
}

/** Story card: chip, 4-segment progress, serif title, visual zone, mono body, tag. */
export function StoryCard({ variant, chip, title, body, visual, tag, index, count, active, onSelect }: StoryCardProps) {
  const segs = Array.from({ length: count }, (_, i) => i);
  return (
    <article className={`story-card story-card--${variant}`} data-card={index} aria-roledescription="story card">
      <span className="story-card__chip">{chip}</span>
      {active && onSelect ? (
        <div className="segs" role="tablist" aria-label="Story progress" onKeyDown={(e) => {
          if (e.key === "ArrowRight" && index < count - 1) onSelect(index + 1);
          if (e.key === "ArrowLeft" && index > 0) onSelect(index - 1);
        }}>
          {segs.map((i) => (
            <button key={i} type="button" role="tab" className="seg" aria-selected={i === index} aria-label={`Card ${i + 1} of ${count}`}
              tabIndex={i === index ? 0 : -1} onClick={() => onSelect(i)}>
              <span className="seg__fill" data-seg-fill={i} />
            </button>
          ))}
        </div>
      ) : (
        <div className="segs" aria-hidden="true">
          {segs.map((i) => (
            <span key={i} className="seg"><span className="seg__fill" data-seg-fill={i} /></span>
          ))}
        </div>
      )}
      <h3 className="story-card__title">{title}</h3>
      <div className="story-card__visual">{visual}</div>
      <div className="story-card__body">{body}</div>
      {tag ? <div className="story-card__tag">{tag}</div> : null}
    </article>
  );
}
