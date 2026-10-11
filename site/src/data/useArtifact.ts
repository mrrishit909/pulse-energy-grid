import { useEffect, useSyncExternalStore } from "react";
import { getStore, type ArtifactSpec, type LoadState } from "./loader";

/** Subscribe to an artifact and start loading it on mount. Returns [state, retry]. */
export function useArtifact<T>(spec: ArtifactSpec<T>, autoload = true): [LoadState<T>, () => void] {
  const store = getStore(spec);
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  useEffect(() => {
    if (autoload) store.prefetch();
  }, [store, autoload]);
  return [state, store.load];
}
