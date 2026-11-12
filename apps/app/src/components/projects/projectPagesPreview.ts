"use client";
// STAND-IN (PROJECT-PAGES-FOR-KEVIN.txt): the pages a team adds to a project or an idea, their order and their
// content live in this browser's localStorage until the event log can record them (a project.page.*
// event is Kevin's call). Every component that shows them reads the same store, so the sidebar and the
// page stay in step. The rules themselves are pure (features/projects/sidebar.ts).
import { useCallback, useSyncExternalStore } from "react";
import { NO_PAGES, type PagesState } from "@/features/projects/sidebar";

const keyOf = (company: string, ownerId: string) => `nh.projectPages.${company}.${ownerId}`;
/** The store id of an idea's pages (a project's is its own id). */
export const ideaPagesId = (caseId: string) => "case:" + caseId;
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: PagesState }>();

function read(key: string, fallback: string | null = null): PagesState {
  if (typeof window === "undefined") return NO_PAGES;
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(key) ?? (fallback ? window.localStorage.getItem(fallback) : null); } catch { /* storage off: no pages of its own */ }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value; // the same object while nothing changed (useSyncExternalStore needs that)
  let value = NO_PAGES;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as PagesState).order) && Array.isArray((parsed as PagesState).pages)) value = parsed as PagesState;
  } catch { /* a broken entry reads as none */ }
  cache.set(key, { raw, value });
  return value;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => { if (e.key?.startsWith("nh.projectPages.")) fn(); }; // another tab changed them
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(fn); window.removeEventListener("storage", onStorage); };
}

/**
 * One project's or idea's pages and a setter that takes the next state from the current one. `from`: the
 * store id to start from while this one has none yet - a project starts with the pages of the idea it grew from.
 */
export function useProjectPages(company: string, ownerId: string, from: string | null = null): [PagesState, (next: (s: PagesState) => PagesState) => void] {
  const key = keyOf(company, ownerId);
  const fallback = from ? keyOf(company, from) : null;
  const state = useSyncExternalStore(subscribe, () => read(key, fallback), () => NO_PAGES);
  const set = useCallback((next: (s: PagesState) => PagesState) => {
    try { window.localStorage.setItem(key, JSON.stringify(next(read(key, fallback)))); } catch { return; }
    listeners.forEach((fn) => fn());
  }, [key, fallback]);
  return [state, set];
}

/** A fresh id for a page (ids stay in this browser until the stand-in becomes an event). */
export const newPageId = () => "pg_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
