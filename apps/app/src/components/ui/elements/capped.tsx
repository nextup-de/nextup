"use client";
// A long list's "Show all": the list shows its top few (lib/utils/quiet.ts) until the reader opens it.
// The list closes again when `resetKey` changes - another filter or sort is another list.
import { useState } from "react";
import { capped, LIST_FITS } from "@/lib/utils/quiet";
import s from "./elements.module.css";

export type Capped<T> = { shown: T[]; total: number; open: boolean; toggle: (() => void) | null };

/** The items to show now. `toggle` is null when there is nothing to open or close; `keepOpen` holds it open (an item past the top is picked). */
export function useCapped<T>(list: readonly T[], resetKey = "", keepOpen = false): Capped<T> {
  const [state, setState] = useState({ key: resetKey, open: false });
  const open = keepOpen || (state.key === resetKey && state.open);
  const { shown } = capped(list, open);
  const toggle = list.length > LIST_FITS && !keepOpen ? () => setState({ key: resetKey, open: !open }) : null;
  return { shown, total: list.length, open, toggle };
}

/** "Show all 12" under a capped list, "Show less" once open; nothing when the list fits. The words come in as props. */
export function ShowAll<T>({ list, showAll, showLess, className }: { list: Capped<T>; showAll: (count: number) => string; showLess: string; className?: string }) {
  if (!list.toggle) return null;
  return (
    <button type="button" className={[s.showAll, className].filter(Boolean).join(" ")} onClick={list.toggle} aria-expanded={list.open}>
      {list.open ? showLess : showAll(list.total)}
    </button>
  );
}
