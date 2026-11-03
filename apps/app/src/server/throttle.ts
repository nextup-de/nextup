// Brute-force brakes for the doors that take a secret or accept anonymous writes.
//
// With a database the windows live in the RateCounter table, so every instance counts against the
// same limit (src/lib/db/rate-limit.ts, VIS/D11). Without one - the built-in demo, or Postgres
// gone away - they live in this process's memory, per instance. The pure rules in
// src/features/security/rate-limit.ts are the same either way.
//
// Not a "use server" module: helpers the actions call, not actions themselves.
import { headers } from "next/headers";
import { clear, clientAddress, hit, sweep, type Rule, type Verdict, type Window } from "@/features/security/rate-limit";
import { getT } from "@/i18n/server";
import { isConnectionError } from "@/lib/db/client";
import { clearShared, hitShared, sweepShared } from "@/lib/db/rate-limit";
import { hasDatabase } from "@/lib/db/mode";

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
  /** Idea studio, per person: one message is one scoring and at most one model call. */
  ideaTurn: { limit: 40, windowMs: 10 * 60_000 },
  /** Idea studio, per company from everyone. */
  ideaTurnAll: { limit: 800, windowMs: 10 * 60_000 },
  /** The brain's routing proposal at publish, per person: one per published idea. */
  brainRoute: { limit: 20, windowMs: 10 * 60_000 },
  /** The brain's steps and metric for an accepted idea, and a check-in draft, per person. */
  brainPlan: { limit: 20, windowMs: 10 * 60_000 },
  /** The bug icon, per person: a few reports in a row is a bad day, dozens is a script. */
  ticketReport: { limit: 10, windowMs: 10 * 60_000 },
  /** Browser errors (api/client-errors), per address: a tab sends at most five per page load. */
  clientError: { limit: 30, windowMs: 10 * 60_000 },
  /** Shop floor, a report, per device and area: someone reporting, not a script. Key `<device key>|<area id>`. */
  floorRaise: { limit: 5, windowMs: 10 * 60_000 },
  /** Shop floor, a report, per area from every device: caps what one printed code can send. Key `<area id>`. */
  floorRaiseAll: { limit: 60, windowMs: 60 * 60_000 },
  /** Shop floor, a floor code tried, per device. Key `<device key>`. */
  floorCode: { limit: 5, windowMs: 15 * 60_000 },
  /** Shop floor, a status lookup by reference, per device. Key `<device key>`. */
  floorStatus: { limit: 20, windowMs: 10 * 60_000 },
  /** Shop floor, a pairing code tried, per address. Key clientKey(). */
  floorPair: { limit: 5, windowMs: 15 * 60_000 },
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

const SWEEP_EVERY_MS = 60 * 60_000;

/** Once an hour, delete expired shared windows. Fire and forget: a failed sweep is retried next hour. */
function sweepSharedHourly(now: number): void {
  const g = globalThis as unknown as { __nextupThrottleSweptAt?: number };
  if (g.__nextupThrottleSweptAt !== undefined && now - g.__nextupThrottleSweptAt < SWEEP_EVERY_MS) return;
  g.__nextupThrottleSweptAt = now;
  sweepShared(now).catch((err) => console.warn("[throttle] sweep failed", err));
}

async function verdictFor(bucket: Bucket, key: string, now: number): Promise<Verdict> {
  const rule = RULES[bucket];
  if (hasDatabase()) {
    sweepSharedHourly(now);
    try {
      return await hitShared(`${bucket}|${key}`, rule, now);
    } catch (err) {
      if (!isConnectionError(err)) throw err;
      // Postgres went away: count in memory rather than let the door open.
    }
  }
  const store = storeFor(bucket);
  if (store.size > 10_000) sweep(store, now);
  return hit(store, key, rule, now);
}

/** Null when the attempt may go ahead, otherwise the sentence to show, in the reader's language. */
export async function throttle(bucket: Bucket, key: string): Promise<string | null> {
  const v = await verdictFor(bucket, key, Date.now());
  if (v.ok) return null;
  console.warn(`[throttle] ${bucket} blocked for ${key}`);
  const t = await getT();
  const s = v.retryAfterSeconds;
  const wait =
    s < 60 ? t("errors.waitSeconds", { count: s }) : t("errors.waitMinutes", { count: Math.ceil(s / 60) });
  return t("errors.tooManyAttempts", { wait });
}

export async function forgive(bucket: Bucket, key: string): Promise<void> {
  clear(storeFor(bucket), key);
  if (!hasDatabase()) return;
  try {
    await clearShared(`${bucket}|${key}`);
  } catch (err) {
    if (!isConnectionError(err)) throw err;
  }
}
