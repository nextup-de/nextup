"use client";
// STAND-IN (PROJECT-AI-FOR-KEVIN.txt): whether the NextUp AI side chat is open, remembered in this browser.
import { useSyncExternalStore } from "react";

const KEY = "nh.projectAi";
const listeners = new Set<() => void>();
const read = (): boolean => { try { return window.localStorage.getItem(KEY) === "open"; } catch { return false; } };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Whether the chat is open, and a setter. The server draws it closed. */
export function useProjectAiOpen(): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(subscribe, read, () => false);
  const set = (v: boolean) => {
    try { window.localStorage.setItem(KEY, v ? "open" : "closed"); } catch { /* storage off */ }
    listeners.forEach((fn) => fn());
  };
  return [open, set];
}
