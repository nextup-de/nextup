// One runner per company, across processes (plan AGT, D16, and the review of 12 Nov). A session lock taken on one pooled query and released on
// another would sit on connections that have nothing to do with each other, so the lock here lives and dies with one transaction: the
// transaction holds its own connection, takes `pg_try_advisory_xact_lock` on it, and everything the caller awaits runs while that
// transaction is open. The lock goes at the commit or rollback, whatever the work did, and at the latest when the transaction's
// time runs out (LOCK_MAX_MS): `deadline` tells the work when to stop starting new calls. The work itself uses the ordinary client,
// never this transaction. Not a "use server" module.
import { getDb } from "@/lib/db/client";

/** The longest the lock is held; a runner that dies loses it with its connection, one that hangs loses it here. */
export const LOCK_MAX_MS = 30 * 60_000;

/** A word for the lock: the same name always maps to the same number. */
const keyOf = (companyId: string, name: string): string => `${name}:${companyId}`;

export type Locked<T> = { locked: true; value: T } | { locked: false };

/**
 * Runs `work` while this company's lock `name` is held, or says it is not (another runner has it). `work` gets the time (ms since the epoch)
 * by which it should not start anything new. A throw in `work` releases the lock and is thrown on.
 */
export async function withCompanyLock<T>(companyId: string, name: string, work: (deadline: number) => Promise<T>, maxMs: number = LOCK_MAX_MS): Promise<Locked<T>> {
  return getDb().$transaction(
    async (tx): Promise<Locked<T>> => {
      const rows = await tx.$queryRaw<{ ok: boolean }[]>`select pg_try_advisory_xact_lock(hashtextextended(${keyOf(companyId, name)}, 0)) as ok`;
      if (rows[0]?.ok !== true) return { locked: false };
      return { locked: true, value: await work(Date.now() + maxMs) };
    },
    { maxWait: 5_000, timeout: maxMs },
  );
}
