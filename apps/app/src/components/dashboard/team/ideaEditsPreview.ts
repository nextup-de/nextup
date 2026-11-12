"use client";
// STAND-IN (IDEA-EDIT-FOR-KEVIN.txt): what someone changed in an idea's Affects and Context lives in this
// browser's localStorage until an event can record it. The title and the text are real (case.revised).
// The overlay itself is pure (features/ideas/edits.ts).
import { useCallback, useSyncExternalStore } from "react";
import type { IdeaEdits } from "@/features/ideas/edits";

const keyOf = (company: string, caseId: string) => `nh.ideaEdits.${company}.${caseId}`;
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: IdeaEdits | null }>();

function read(key: string): IdeaEdits | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(key); } catch { /* storage off: no edits */ }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  let value: IdeaEdits | null = null;
  try { const v: unknown = raw ? JSON.parse(raw) : null; if (v && typeof v === "object") value = v as IdeaEdits; } catch { /* broken: none */ }
  cache.set(key, { raw, value });
  return value;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => { if (e.key?.startsWith("nh.ideaEdits.")) fn(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(fn); window.removeEventListener("storage", onStorage); };
}

/** One idea's edited Affects and Context, and a setter that merges more edits in. */
export function useIdeaEdits(company: string, caseId: string): [IdeaEdits | null, (more: IdeaEdits) => void] {
  const key = keyOf(company, caseId);
  const edits = useSyncExternalStore(subscribe, () => read(key), () => null);
  const add = useCallback((more: IdeaEdits) => {
    try { window.localStorage.setItem(key, JSON.stringify({ ...read(key), ...more })); } catch { return; }
    listeners.forEach((fn) => fn());
  }, [key]);
  return [edits, add];
}
