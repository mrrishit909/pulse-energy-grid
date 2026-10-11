import type { ReactNode } from "react";
import { percent, type LoadState } from "../data/loader";

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

export function ErrorLine({ file, reason, attempt, onRetry }: { file: string; reason: string; attempt: number; onRetry: () => void }) {
  return (
    <div className="state-error" role="alert">
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
