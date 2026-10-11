/** DEV GALLERY: shared primitives on one page. Excluded from production builds (see main.tsx). */
import { useState } from "react";
import "../styles/gallery.css";
import { Orb } from "../components/Orb";
import { HonestyChip, type Honesty } from "../components/HonestyChip";
import { NotificationCard } from "../components/NotificationCard";
import { Tooltip } from "../components/Tooltip";
import { StoryDeck, type DeckCard } from "../components/StoryDeck";
import { Track } from "../scroll/Track";
import { ArtifactStatus } from "../components/StateUI";
import type { LoadState } from "../data/loader";
import { WordReveal } from "../components/WordReveal";

const TAGS: Honesty[] = ["OBSERVED", "DERIVED", "PREDICTED", "SIMULATED", "SYNTHETIC"];
const cards: DeckCard[] = (["dark", "blue", "light", "orb"] as const).map((variant, i) => ({
  variant, chip: `CARD ${i + 1}`, title: "Specimen title", body: <p>Specimen body, not real copy.</p>,
  visual: i === 3 ? <Orb family="solar" size={160} /> : undefined,
}));
const states: [string, LoadState<string>][] = [
  ["loading", { status: "loading", attempt: 1, loaded: 40, total: 100, retrying: false }],
  ["error", { status: "error", attempt: 2, reason: "HTTP 404" }],
  ["empty", { status: "empty", attempt: 1, data: "" }],
];

export default function Gallery() {
  const [tip, setTip] = useState(false);
  return (
    <div className="gallery">
      <div className="g-pad">
        <p className="g-label">DEV GALLERY · SPECIMENS ONLY</p>
        <WordReveal as="h1" text="Word reveal specimen" mode={{ kind: "value", t: 1 }} />
        <div className="g-row">{TAGS.map((t) => <HonestyChip key={t} tag={t} />)}</div>
        <div className="g-row">
          <Orb family="solar" size={120} /><Orb family="electric" size={120} /><Orb family="spectral" size={120} />
        </div>
        <NotificationCard from="SPECIMEN" when="NOW" body="Notification specimen." playKey={0} />
        <p className="g-tip-target" onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}>HOVER FOR TOOLTIP</p>
        <Tooltip x={200} y={200} visible={tip}>Tooltip specimen</Tooltip>
        {states.map(([name, s]) => (
          <div key={name} className="g-live"><ArtifactStatus file="example.json" state={s} retry={() => {}} empty="NOTHING TO SHOW">{() => null}</ArtifactStatus></div>
        ))}
      </div>
      <Track id="g-deck" height="400vh"><StoryDeck track="g-deck" cards={cards} /></Track>
    </div>
  );
}
