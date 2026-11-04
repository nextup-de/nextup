// The break-glass window (SEC/D4, D6). Pure: node:crypto only, no file, no clock of its own.
//
// stack/break-glass.sh writes the window as JSON; the app only reads it. A broken or unknown file is
// "no window", which is closed: this module never guesses.
import { createHash, timingSafeEqual } from "node:crypto";

export type BreakGlassWindow = {
  v: 1;
  /** sha256 of the code, hex. */
  codeSha256: string;
  openedAt: Date;
  until: Date;
  by: string;
  reason: string;
};

const HEX64 = /^[0-9a-f]{64}$/i;

function when(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const t = new Date(value);
  return Number.isNaN(t.getTime()) ? null : t;
}

/** The window in the script's JSON, or null when it is missing, malformed or of another version. */
export function parseWindow(json: string): BreakGlassWindow | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || typeof r.codeSha256 !== "string" || !HEX64.test(r.codeSha256)) return null;
  const openedAt = when(r.openedAt);
  const until = when(r.until);
  if (!openedAt || !until) return null;
  return {
    v: 1,
    codeSha256: r.codeSha256.toLowerCase(),
    openedAt,
    until,
    by: typeof r.by === "string" ? r.by : "",
    reason: typeof r.reason === "string" ? r.reason : "",
  };
}

/** Open only strictly before `until`. */
export function windowOpen(window: BreakGlassWindow | null, now: Date): window is BreakGlassWindow {
  return window !== null && now.getTime() < window.until.getTime();
}

/** The code against the window's hash, timing-safe. Whitespace around a pasted code is ignored. */
export function codeMatches(code: string, window: BreakGlassWindow): boolean {
  const given = createHash("sha256").update(code.trim()).digest();
  return timingSafeEqual(given, Buffer.from(window.codeSha256, "hex"));
}

/** A window session carries the window's openedAt as the cookie's `by`, so a new window ends the old session. */
export const BREAK_GLASS_BY = "bg:";
export const breakGlassBy = (openedAt: Date) => BREAK_GLASS_BY + openedAt.toISOString();
