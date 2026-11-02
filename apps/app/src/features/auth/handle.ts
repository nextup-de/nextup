// Anonymous handles for members (IDN/D11). Pure.
import type { Role } from "@/config/roles";

export const HANDLE_PREFIX = "Anonymous #";

const handle = (n: number, digits: number) => HANDLE_PREFIX + String(n).padStart(digits, "0");

/**
 * "Anonymous #" plus 4 digits (0000-9999) not in `taken`. One draw, then up to 50 tries stepping
 * forward from it (so a stuck `random` still finds a free number); 6 digits after that.
 */
export function newHandle(taken: Iterable<string>, random: () => number = Math.random): string {
  const used = new Set(taken);
  const start = Math.floor(random() * 10_000);
  for (let i = 0; i < 50; i++) {
    const h = handle((start + i) % 10_000, 4);
    if (!used.has(h)) return h;
  }
  for (let n = Math.floor(random() * 1_000_000); ; n = (n + 1) % 1_000_000) {
    const h = handle(n, 6);
    if (!used.has(h)) return h;
  }
}

/** Only members get a handle. */
export const needsHandle = (role: Role): boolean => role === "member";
