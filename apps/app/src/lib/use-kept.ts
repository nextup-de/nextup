"use client";
// useState that outlives the page: the value is kept in this module, per `scope` and field, so leaving a
// page for another and coming back finds it as it was. Module memory survives client-side navigation and
// is gone on a reload - the same lifetime as the static demo's own fresh start (components/demo/StaticDemo).
// The raise page keeps its open conversation with it (components/ideas/Raise.tsx).
import { useCallback, useEffect, useState, type SetStateAction } from "react";

const kept = new Map<string, unknown>();
const keptOr = <T,>(key: string, fallback: T): T => (kept.has(key) ? (kept.get(key) as T) : fallback);

export function useKept<T>(scope: string, field: string, initial: T): [T, (next: SetStateAction<T>) => void] {
  const key = scope + "\u0000" + field;
  const [first] = useState(initial);
  const [state, setState] = useState(() => ({ key, value: keptOr(key, initial) }));
  // Another scope (the person changed while the page stayed): that scope's value, from now on.
  const current = state.key === key ? state : { key, value: keptOr(key, first) };
  if (current !== state) setState(current);
  useEffect(() => { kept.set(current.key, current.value); }, [current.key, current.value]);
  const set = useCallback((next: SetStateAction<T>) => setState((s) => {
    const prev = s.key === key ? s.value : keptOr(key, first);
    return { key, value: typeof next === "function" ? (next as (p: T) => T)(prev) : next };
  }), [key, first]);
  return [current.value, set];
}
