import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { percent, type ArtifactSpec, type LoadState } from "../data/loader";
import { useArtifact } from "../data/useArtifact";
import { useActiveScene } from "../scroll/hooks";

const upper = (f: string) => f.toUpperCase();

export function LoadingLine({ file, loaded, total }: { file: string; loaded: number; total: number | null }) {
  const pct = percent(loaded, total);
  return (
    <p className="state-line state-line--loading" role="status">
      LOADING {upper(file)}
      {pct === null ? <span className="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span> : <span className="tnum"> · {pct}%</span>}
    </p>
  );
}

export function RetryButton({ onClick, busy, children = "RETRY" }: { onClick: () => void; busy?: boolean; children?: ReactNode }) {
  return (
    <button type="button" className="btn-square" onClick={onClick} disabled={busy} aria-disabled={busy}>
      {busy ? "RETRYING" : children}
    </button>
  );
}

/** Inline error lines are not live regions: the scene banner (SceneErrors) is the one alert per failed file (QA L4). */
export function ErrorLine({ file, reason, attempt, onRetry, live = false }: { file: string; reason: string; attempt: number; onRetry: () => void; live?: boolean }) {
  return (
    <div className="state-error" role={live ? "alert" : undefined} data-file={file}>
      <p className="state-line state-line--error">
        COULD NOT LOAD {upper(file)} ({reason}){attempt > 1 ? ` (ATTEMPT ${attempt})` : ""}
      </p>
      <RetryButton onClick={onRetry} />
    </div>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="state-line state-line--empty">{children}</p>;
}

/** Maps a loader state to the shared state UI; renders children only when ready. */
export function ArtifactStatus<T>({ file, state, retry, empty, children }: {
  file: string;
  state: LoadState<T>;
  retry: () => void;
  empty: ReactNode;
  children: (data: T) => ReactNode;
}) {
  switch (state.status) {
    case "initial":
      return null;
    case "loading":
      return state.retrying ? <p className="state-line" role="status">RETRYING {upper(file)}</p> : <LoadingLine file={file} loaded={state.loaded} total={state.total} />;
    case "error":
      return <ErrorLine file={file} reason={state.reason} attempt={state.attempt} onRetry={retry} />;
    case "empty":
      return <EmptyLine>{empty}</EmptyLine>;
    case "ready":
      return <>{children(state.data)}</>;
  }
}

/** Several artifacts at once: the first one not ready decides the state line (loading %, error + RETRY, empty). */
export function AllReady({ items, children }: { items: { file: string; state: LoadState<unknown>; retry: () => void }[]; children: () => ReactNode }) {
  const bad = items.find((i) => i.state.status !== "ready");
  if (!bad) return <>{children()}</>;
  return <ArtifactStatus file={bad.file} state={bad.state} retry={bad.retry} empty="UNAVAILABLE">{() => null}</ArtifactStatus>;
}

function SceneError({ spec }: { spec: ArtifactSpec<unknown> }) {
  const [st, retry] = useArtifact(spec, false);
  if (st.status === "error") return <ErrorLine live file={spec.file} reason={st.reason} attempt={st.attempt} onRetry={retry} />;
  if (st.status === "loading" && st.retrying) return <p className="state-line" role="status">RETRYING {upper(spec.file)}</p>;
  return null;
}

/**
 * QA L4: every artifact a scene consumes, with its own error + RETRY, pinned in view while that scene owns the viewport.
 * Only the active scene renders it, so a failed file has exactly one live region at a time.
 */
export function SceneErrors({ id, specs }: { id: string; specs: ArtifactSpec<unknown>[] }) {
  const active = useActiveScene() === id;
  if (!active || typeof document === "undefined") return null;
  return createPortal(<div className="scene-errors" data-scene-errors={id}>{specs.map((s) => <SceneError key={s.file} spec={s} />)}</div>, document.body);
}
