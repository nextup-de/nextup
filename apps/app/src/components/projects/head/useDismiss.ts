"use client";
// A <details> popover closes on Escape and on a click outside it.
import { useEffect, type RefObject } from "react";

export function useDismiss(box: RefObject<HTMLDetailsElement | null>): void {
  useEffect(() => {
    const close = (e: Event) => {
      const d = box.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", close); };
  }, [box]);
}
