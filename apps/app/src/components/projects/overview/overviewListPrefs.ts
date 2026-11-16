"use client";
// A stand-in (OVERVIEW-LIST-FOR-KEVIN.txt): what the Overview remembers per browser until it is a person's setting -
// list or grid, the sort - and the two actions that have no event yet: Remind (a nudge to whoever holds the item) and
// Follow (updates on it). Kept in localStorage per company; nothing leaves the browser.
import { useCallback, useState } from "react";
import { SORT_KEYS, type SortDir, type SortKey } from "@/features/overview/items";

export type OverviewPrefs = { view: "list" | "grid"; sort: SortKey; dir: SortDir; reminded: string[]; followed: string[] };
export type PrefsChange = Partial<Pick<OverviewPrefs, "view" | "sort" | "dir">> & { remind?: string; follow?: string };

const DEFAULTS: OverviewPrefs = { view: "list", sort: "needs", dir: "newest", reminded: [], followed: [] };
const keyOf = (slug: string) => "nextup:" + slug + ":overview-list";

function read(slug: string): OverviewPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(keyOf(slug)) ?? "null") as Partial<OverviewPrefs> | null;
    if (!raw || typeof raw !== "object") return DEFAULTS;
    const ids = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : []);
    return {
      view: raw.view === "grid" ? "grid" : "list",
      sort: SORT_KEYS.includes(raw.sort as SortKey) ? (raw.sort as SortKey) : "needs",
      dir: raw.dir === "oldest" ? "oldest" : "newest",
      reminded: ids(raw.reminded), followed: ids(raw.followed),
    };
  } catch {
    return DEFAULTS;
  }
}

export function useOverviewPrefs(slug: string): [OverviewPrefs, (c: PrefsChange) => void] {
  // Drawn only once the page is ready in the browser (ProjectsHub waits for it), so the saved values are there at once.
  const [prefs, setPrefs] = useState<OverviewPrefs>(() => (typeof window === "undefined" ? DEFAULTS : read(slug)));
  const change = useCallback((c: PrefsChange) => {
    setPrefs((was) => {
      const next: OverviewPrefs = {
        view: c.view ?? was.view, sort: c.sort ?? was.sort, dir: c.dir ?? was.dir,
        reminded: c.remind && !was.reminded.includes(c.remind) ? [...was.reminded, c.remind] : was.reminded,
        followed: c.follow ? (was.followed.includes(c.follow) ? was.followed.filter((x) => x !== c.follow) : [...was.followed, c.follow]) : was.followed,
      };
      try { window.localStorage.setItem(keyOf(slug), JSON.stringify(next)); } catch { /* private mode: it lasts this visit */ }
      return next;
    });
  }, [slug]);
  return [prefs, change];
}
