// Rate-limit windows shared between server instances (VIS/D11). One row per key in RateCounter; the
// same fixed-window rule as the pure `hit` in features/security/rate-limit.ts, decided in one SQL
// statement so two instances cannot both read "1 of 2" and both pass.
//
// RateCounter has no company: the key already names whatever it counts (bucket, company, person).
import { getDb } from "@/lib/db/client";
import type { Rule, Verdict } from "@/features/security/rate-limit";

type Row = { count: number; resetAt: Date };

/**
 * Count one attempt against `key`. A missing or expired window starts again at 1; a live one
 * increments. The count keeps rising on refused attempts (the pure `hit` stops at the limit) -
 * harmless, since the verdict is only "count <= limit" and the row goes with its window.
 */
export async function hitShared(key: string, rule: Rule, now: number): Promise<Verdict> {
  const nowAt = new Date(now);
  const resetAt = new Date(now + rule.windowMs);
  const rows = await getDb().$queryRaw<Row[]>`
    INSERT INTO "RateCounter" ("key", "count", "resetAt")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateCounter"."resetAt" <= ${nowAt} THEN 1 ELSE "RateCounter"."count" + 1 END,
      "resetAt" = CASE WHEN "RateCounter"."resetAt" <= ${nowAt} THEN EXCLUDED."resetAt" ELSE "RateCounter"."resetAt" END
    RETURNING "count", "resetAt"`;
  const row = rows[0];
  if (!row) throw new Error("RateCounter upsert returned no row");
  if (row.count <= rule.limit) return { ok: true, remaining: rule.limit - row.count };
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((row.resetAt.getTime() - now) / 1000)) };
}

/** Forget a key - after a successful login, so a typo or two earlier do not linger. */
export async function clearShared(key: string): Promise<void> {
  await getDb().$executeRaw`DELETE FROM "RateCounter" WHERE "key" = ${key}`;
}

/** Delete expired windows; server/throttle.ts calls it once an hour. Returns how many rows went. */
export async function sweepShared(now: number): Promise<number> {
  return getDb().$executeRaw`DELETE FROM "RateCounter" WHERE "resetAt" <= ${new Date(now)}`;
}
