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
 *
 * An IPv6 address counts by its /64. A home line or a rented server gets a whole /64, so keying by
 * the full address would hand a guesser 2^64 fresh buckets - and a cheap way to fill the
 * per-company bucket that locks everyone else out of the login.
 */
export function clientAddress(forwardedFor: string | null, realIp: string | null): string {
  const first = forwardedFor?.split(",")[0]?.trim();
  const address = first || realIp?.trim() || "unknown";
  return ipv6Network(address) ?? address;
}

/** "2001:db8:a:b::/64" for an IPv6 address, the IPv4 one inside "::ffff:a.b.c.d", null otherwise. */
function ipv6Network(address: string): string | null {
  if (!address.includes(":")) return null;
  const a = address.replace(/^\[|\](:\d+)?$/g, "").split("%")[0].toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(a);
  if (mapped) return mapped[1];

  const halves = a.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}
