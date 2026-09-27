// Brute-force brakes for the doors that take a secret or accept anonymous writes.
//
// In-process memory: right for the one Hetzner box, and per-instance on Vercel (each serverless
// instance counts on its own - weaker, still far better than nothing). When the app scales out,
// replace `stores` with a shared table; src/features/security/rate-limit.ts stays as it is.
//
// Not a "use server" module: helpers the actions call, not actions themselves.
import { headers } from "next/headers";
import { clear, clientAddress, hit, sweep, waitText, type Rule, type Window } from "@/features/security/rate-limit";

/** Every limit in one table, so tuning them is one diff. */
export const RULES = {
  /** Personal login code, per address and company: a person mistyping, not a script guessing. */
  loginCode: { limit: 10, windowMs: 10 * 60_000 },
  /** Personal login code, per company from everywhere: caps a distributed guess at one company. */
  loginCodeAll: { limit: 200, windowMs: 10 * 60_000 },
  /** Login step 1, "find your company": a person finding theirs, not a script mapping domains. */
  findCompany: { limit: 30, windowMs: 10 * 60_000 },
  /** The /admin code opens everything - the tightest door. */
  adminLogin: { limit: 5, windowMs: 15 * 60_000 },
  /** The public /contact form: a real prospect sends one or two. */
  pilotRequest: { limit: 5, windowMs: 60 * 60_000 },
  /** Raise-page assistant, per person: a conversation, not a script draining the model budget. */
  assistAsk: { limit: 20, windowMs: 10 * 60_000 },
  /** Raise-page assistant, per company from everyone: caps what one company can spend. */
  assistAskAll: { limit: 600, windowMs: 10 * 60_000 },
} satisfies Record<string, Rule>;

export type Bucket = keyof typeof RULES;

const globalForThrottle = globalThis as unknown as { __nextupThrottle?: Map<Bucket, Map<string, Window>> };
const stores = (globalForThrottle.__nextupThrottle ??= new Map());

function storeFor(bucket: Bucket): Map<string, Window> {
  let s = stores.get(bucket);
  if (!s) stores.set(bucket, (s = new Map()));
  return s;
}

export async function clientKey(): Promise<string> {
  const h = await headers();
  return clientAddress(h.get("x-forwarded-for"), h.get("x-real-ip"));
}

/** Null when the attempt may go ahead, otherwise the sentence to show. */
export function throttle(bucket: Bucket, key: string): string | null {
  const store = storeFor(bucket);
  const now = Date.now();
  if (store.size > 10_000) sweep(store, now);
  const v = hit(store, key, RULES[bucket], now);
  if (v.ok) return null;
  console.warn(`[throttle] ${bucket} blocked for ${key}`);
  return `Too many attempts. Wait ${waitText(v.retryAfterSeconds)} and try again.`;
}

export function forgive(bucket: Bucket, key: string): void {
  clear(storeFor(bucket), key);
}
