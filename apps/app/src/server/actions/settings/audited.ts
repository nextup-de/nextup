// A settings or member change and its audit row in one database transaction (GDP-C1, D11). Not a
// "use server" module. If the audit row cannot be written the transaction rolls back and the caller gets
// `{ ok: false }` to turn into its own error: a success is never shown without the row.
import { getDb } from "@/lib/db/client";
import { recordAudit, type AuditEntry } from "@/server/audit/record";

export type { Tx } from "@/lib/db/org-edit";
import type { Tx } from "@/lib/db/org-edit";
export type Audited<T> = { ok: true; value: T } | { ok: false };

/** Marks a failure of the audit write itself, so a failure of the change keeps throwing as before. */
class AuditWriteFailed extends Error {}

/**
 * Runs `work` and then records `entry(result)` through the same transaction client. `entry` may return
 * null for a change that turned out to be a no-op: then no row is written.
 */
export async function audited<T>(
  companyId: string,
  entry: (result: T) => AuditEntry | null,
  work: (tx: Tx) => Promise<T>,
): Promise<Audited<T>> {
  try {
    const value = await getDb().$transaction(async (tx) => {
      const result = await work(tx);
      const e = entry(result);
      if (e) {
        try {
          await recordAudit(companyId, e, tx);
        } catch (err) {
          console.error(`[audit] ${e.action} not written: ${err instanceof Error ? err.message : String(err)}`);
          throw new AuditWriteFailed();
        }
      }
      return result;
    });
    return { ok: true, value };
  } catch (err) {
    if (err instanceof AuditWriteFailed) return { ok: false };
    throw err;
  }
}
