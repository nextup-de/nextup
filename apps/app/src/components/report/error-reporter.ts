// Script errors in this tab go to /api/client-errors (src/app/api/client-errors/route.ts), where
// they are counted by kind like a server error and reach admin.sellux.ch as auto tickets.
//
// Only uncaught errors and unhandled promise rejections - not console.error lines or failed
// requests, which are the bug report's business (./capture.ts) - and only the pathname, never the
// query. At most five per page load, each kind once. Sent with sendBeacon, so it also leaves a page
// that is being closed, and never through the app's own fetch.
import { isBrowserNoise } from "@/features/errors/noise";

const MAX_PER_PAGE = 5;
const seen = new Set<string>();
const flag = globalThis as unknown as { __nextupErrorReporter?: true };

/** Report one error. Never throws. */
export function reportClientError(err: unknown, fallback = "Error"): void {
  try {
    if (seen.size >= MAX_PER_PAGE || typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;
    const e = err instanceof Error ? err : null;
    const name = (e?.name || "Error").slice(0, 200);
    const message = (e ? e.message : typeof err === "string" ? err : fallback).slice(0, 2_000);
    const stack = (e?.stack ?? "").slice(0, 6_000);
    if (isBrowserNoise({ message, stack })) return;
    const key = `${name}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    // A string goes as text/plain: no preflight, and the server reads the body as JSON anyway.
    navigator.sendBeacon("/api/client-errors", JSON.stringify({ name, message, stack, path: location.pathname.slice(0, 500) }));
  } catch {
    // Reporting an error must not raise one.
  }
}

/** Start listening. Safe to call more than once; only the first call does anything. */
export function installErrorReporter(): void {
  if (typeof window === "undefined" || flag.__nextupErrorReporter) return;
  flag.__nextupErrorReporter = true;
  window.addEventListener("error", (e) => reportClientError(e.error ?? e.message, e.message));
  window.addEventListener("unhandledrejection", (e) => reportClientError(e.reason, "Unhandled promise rejection"));
}
