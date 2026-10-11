/** Tiny external store shared by scene DOM (React) and the canvas director (per frame). */
export function store<T extends object>(init: T) {
  let v = init;
  let version = 0;
  const ls = new Set<() => void>();
  return {
    get: () => v,
    version: () => version,
    set: (p: Partial<T>) => { v = { ...v, ...p }; version++; ls.forEach((l) => l()); },
    subscribe: (l: () => void) => { ls.add(l); return () => void ls.delete(l); },
  };
}

