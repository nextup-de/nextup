// The stack's health report: it answers, and how the nightly retention is doing (plan REM, Q10.15). `ok` is the process's own and stays true; `retention` is "ok" or "warn" (some company's
// retention run has failed two nights in a row, features/privacy/retention-health.ts) and carries no company and no error text: the report is public. Without a database, or when
// it cannot be read, retention is "unknown" and nothing else changes.
import { retentionHealth } from "@/features/privacy/retention-health";
import { getDb, hasDatabase } from "@/lib/db/client";

export async function GET() {
  let retention: "ok" | "warn" | "unknown" = "unknown";
  if (hasDatabase()) {
    try {
      const runs = await getDb().retentionRun.findMany({ select: { lastRunAt: true, lastOkAt: true, lastError: true } });
      retention = retentionHealth(runs).status;
    } catch {
      retention = "unknown";
    }
  }
  return Response.json({ ok: true, retention });
}
