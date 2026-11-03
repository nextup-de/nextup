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
 */
export function useIdInUrl(current: string | null, apply: (id: string | null) => void, key = "id"): void {
  const inUrl = useSearchParams().get(key);
  const seen = useRef(inUrl);
  // Read, not watched: only a change of the address applies.
  const now = useRef({ current, apply });
  useEffect(() => { now.current = { current, apply }; });

  // The view -> the address.
  useEffect(() => {
    const url = new URL(window.location.href);
    const was = url.searchParams.get(key);
    if (was === current) return;
    if (current === null) url.searchParams.delete(key); else url.searchParams.set(key, current);
    const to = url.pathname + url.search + url.hash;
    if (was !== null && current !== null) window.history.replaceState(null, "", to);
    else window.history.pushState(null, "", to);
  }, [current, key]);

  // The address -> the view, when it moved without the view (Back, Forward).
  useEffect(() => {
    if (inUrl === seen.current) return;
    seen.current = inUrl;
    if (inUrl !== now.current.current) now.current.apply(inUrl);
  }, [inUrl]);
}
