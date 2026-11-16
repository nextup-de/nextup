"use client";
// The Projects sidebar's open or hidden state, shared by the frame that draws it and the parts that depend on it (the
// project's head moves into the open sidebar). Remembered in this browser.
import { useSyncExternalStore } from "react";

const KEY = "nh.projectsSidebar";
// Open or hidden, remembered in this browser. It starts hidden, the calm start (Kevin, 13 Nov 2026): a project
// page leads through its steps by itself, and the button at the top left opens the rest. The server draws it hidden.
const listeners = new Set<() => void>();
const readSb = (): "open" | "hidden" => { try { return window.localStorage.getItem(KEY) === "open" ? "open" : "hidden"; } catch { return "hidden"; } };
const subscribeSb = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const PHONE = "(max-width: 760px)";
const onPhoneChange = (fn: () => void) => { const m = window.matchMedia(PHONE); m.addEventListener("change", fn); return () => m.removeEventListener("change", fn); };

/**
 * Does the open sidebar carry the project's head (Paper "Project head · options", A)? Then the page shows no head: the
 * status, the viewer's move and Manage sit under the project's title in the sidebar. Hidden, or on a phone (no
 * sidebar), the page keeps its head.
 */
export function useHeadInSidebar(): boolean {
  const sb = useSyncExternalStore(subscribeSb, readSb, () => "hidden" as const);
  const phone = useSyncExternalStore(onPhoneChange, () => window.matchMedia(PHONE).matches, () => false);
  return sb === "open" && !phone;
}

/** Open or hidden, and the way to change it. */
export function useSidebarState(): ["open" | "hidden", (v: "open" | "hidden") => void] {
  const sb = useSyncExternalStore(subscribeSb, readSb, () => "hidden" as const);
  const set = (v: "open" | "hidden") => { try { window.localStorage.setItem(KEY, v); } catch { /* storage off */ } listeners.forEach((fn) => fn()); };
  return [sb, set];
}
