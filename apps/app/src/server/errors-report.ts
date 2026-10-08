// Errors this stack counted -> admin.sellux.ch (@nextup/contracts errors.ts), where each kind becomes
// one "auto" ticket with a count. docs/plans/2026-10-05_admin-vs-ses.md, PR 3.
//
// Once a minute, on the ticket sync's timer (server/tickets-sync.ts). Only a one-company stack
// sends: its token names that company, and admin refuses a batch for any other slug. An admin from
// before /api/errors answers 404: the groups stay pending, and the next try is an hour later.
// Not a "use server" module.
import { ErrorBatchAccepted } from "@nextup/contracts";
import { toErrorBatch } from "@/features/errors";
import { singleCompany } from "@/features/tenant/urls";
import { markErrorsFailed, markErrorsSent, pendingErrorGroups } from "@/lib/db/errors";
import { flushErrors } from "@/server/errors";
import { call, opsConfig } from "@/server/tickets-sync";

const g = globalThis as unknown as { __nextupErrorsReport?: Promise<void> | null; __nextupErrorsNotBefore?: number };

/** Send one batch. Overlapping calls share the one in flight; a failure is noted on the rows and retried next minute. */
export function reportErrors(): Promise<void> {
  const ops = opsConfig();
  const slug = singleCompany();
  if (!ops || !slug || Date.now() < (g.__nextupErrorsNotBefore ?? 0)) return Promise.resolve();
  g.__nextupErrorsReport ??= (async () => {
    let fingerprints: string[] = [];
    try {
      // What was counted in memory since the last flush goes into the table first.
      await flushErrors();
      const rows = await pendingErrorGroups();
      if (rows.length === 0) return;
      fingerprints = rows.map((r) => r.fingerprint);
      const res = await call(ops, "/api/errors", { method: "POST", body: JSON.stringify(toErrorBatch(rows, slug, new Date())) });
      if (res.status === 404) {
        g.__nextupErrorsNotBefore = Date.now() + 60 * 60_000;
        return;
      }
      if (!res.ok) throw new Error(`errors answered ${res.status}`);
      ErrorBatchAccepted.parse(await res.json());
      await markErrorsSent(rows, new Date());
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      console.warn(`[errors] ${slug} not sent: ${why}`);
      if (fingerprints.length > 0) await markErrorsFailed(fingerprints, why).catch(() => {});
    } finally {
      g.__nextupErrorsReport = null;
    }
  })();
  return g.__nextupErrorsReport;
}
