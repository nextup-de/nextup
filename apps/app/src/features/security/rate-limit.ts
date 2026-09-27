// A fixed-window attempt counter: "at most N tries per key per window".
//
// Pure: the clock is passed in, the store is a Map the caller owns. That keeps it unit-testable
// and lets src/server/throttle.ts swap the in-process Map for a shared store (Postgres, Redis)
// the day the app runs on more than one process - the rules below do not change.
//
// Fixed windows, not sliding: a guesser gets at most 2N tries across a window boundary, which is
// irrelevant against a ~59-bit personal login code and costs nothing to reason about.

export type Rule = { limit: number; windowMs: number };

export type Window = { count: number; resetAt: number };

export type Verdict = { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number };

/** Count one attempt against `key`. Mutates `store`. */
export function hit(store: Map<string, Window>, key: string, rule: Rule, now: number): Verdict {
  const w = store.get(key);
  if (!w || w.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { ok: true, remaining: rule.limit - 1 };
  }
  if (w.count >= rule.limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
  }
  w.count += 1;
  return { ok: true, remaining: rule.limit - w.count };
}

/** Forget a key - after a successful login, so a typo or two earlier do not linger. */
export function clear(store: Map<string, Window>, key: string): void {
  store.delete(key);
}

/** Drop expired windows so the Map cannot grow without bound under a spray of distinct keys. */
export function sweep(store: Map<string, Window>, now: number): void {
  for (const [key, w] of store) if (w.resetAt <= now) store.delete(key);
}

/** "3 minutes", "40 seconds" - for the message a person reads. */
export function waitText(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const m = Math.ceil(seconds / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}

/**
 * The client address from proxy headers. On Vercel and behind Caddy the edge overwrites
 * x-forwarded-for with the real client first, so the first entry is the one to trust. Anything
 * else (a direct `next start` with no proxy) falls back to one shared bucket - stricter, not looser.
 */
export function clientAddress(forwardedFor: string | null, realIp: string | null): string {
  const first = forwardedFor?.split(",")[0]?.trim();
  return first || realIp?.trim() || "unknown";
}
