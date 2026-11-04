"use client";
// The item a page has open, kept in its address (?id=… by default): a link, a reload and the back
// button land on the same idea, case, problem or step. Each view keeps its own state; this keeps the
// address and that state in step, both ways. Written with the browser's own history, which Next
// keeps in step with useSearchParams (as Raise does), so opening an item never waits for the server.
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

/** The id the address names now, for a view's first state. */
export function useUrlId(key = "id"): string | null {
  return useSearchParams().get(key);
}

/**
 * Keep `current` (what the view has open, null: nothing) in the address under `key`. Opening and
 * closing add a history entry, so Back closes and Forward reopens; walking from one item to the next
 * replaces it. When the address changes from outside (Back, Forward), `apply` gets the new id.
 * `paths`: an open item has its own address (`open`, the page shows the same view there) and closing
 * goes back to `closed`. An address that says otherwise is corrected without a history entry.
 */
export function useIdInUrl(current: string | null, apply: (id: string | null) => void, key = "id", paths?: { open: string; closed: string }): void {
  const open = paths?.open, closed = paths?.closed;
  const inUrl = useSearchParams().get(key);
  const seen = useRef(inUrl);
  // Read, not watched: only a change of the address applies.
  const now = useRef({ current, apply });
  useEffect(() => { now.current = { current, apply }; });

  // The view -> the address.
  useEffect(() => {
    const url = new URL(window.location.href);
    const was = url.searchParams.get(key);
    const path = (current === null ? closed : open) ?? url.pathname;
    if (was === current && url.pathname === path) return;
    if (current === null) url.searchParams.delete(key); else url.searchParams.set(key, current);
    url.pathname = path;
    const to = url.pathname + url.search + url.hash;
    if ((was === null) === (current === null)) window.history.replaceState(null, "", to);
    else window.history.pushState(null, "", to);
  }, [current, key, open, closed]);

  // The address -> the view, when it moved without the view: a link, or Back and Forward below.
  useEffect(() => {
    if (inUrl === seen.current) return;
    seen.current = inUrl;
    // useSearchParams can lag behind the address. What it says now may already be out of date.
    if (inUrl !== new URLSearchParams(window.location.search).get(key)) return;
    if (inUrl !== now.current.current) now.current.apply(inUrl);
  }, [inUrl, key]);

  // Back and Forward, read from the address itself: useSearchParams follows in a transition, so right
  // after closing it may not have seen the close yet, and then Back looks to it like no change at all.
  useEffect(() => {
    const onPop = () => {
      const url = new URL(window.location.href);
      // Back to another page: leave it to the router, or closing here would move the address again.
      if (open !== undefined && url.pathname !== open && url.pathname !== closed) return;
      const id = url.searchParams.get(key);
      seen.current = id;
      if (id !== now.current.current) now.current.apply(id);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [key, open, closed]);
}
