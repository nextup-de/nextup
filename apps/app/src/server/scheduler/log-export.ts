// The log export scheduler (EID D13). Every minute, for each company whose `logsink` row is on: take the
// 120 s lease, read up to 500 audit rows after the cursor, write them, move the cursor only after the write
// resolved. A failure keeps the cursor, stores lastError and the next tick retries (at least once).
//
// Not a "use server" module.
import { advanceExport, auditAfter, claimExportLease, loadExportRun, recordExportError, releaseExportLease, startExportAt } from "@/lib/db/audit-export";
import { hasDatabase } from "@/lib/db/client";
import { companiesWithIntegrationOn } from "@/lib/db/integrations";
import { LOGSINK, logSinkFor } from "@/server/logsink";
import { toLogRecord } from "@/server/logsink/record";

const LEASE_MS = 120_000;
const BATCH = 500;
/** A backlog drains within one tick, but never holds the lease for ever. */
const MAX_BATCHES = 10;
const INTERVAL_MS = 60_000;

export type ExportResult = { slug: string; sent: number; error?: string };

export async function runLogExportOnce(now: Date = new Date()): Promise<ExportResult[]> {
  const out: ExportResult[] = [];
  let companies: { id: string; slug: string }[];
  try {
    companies = await companiesWithIntegrationOn(LOGSINK);
  } catch (e) {
    console.warn(`[log-export] run: ${e instanceof Error ? e.message : String(e)}`);
    return out;
  }
  for (const c of companies) {
    let leased = false;
    try {
      leased = await claimExportLease(c.id, LEASE_MS, now);
      if (!leased) continue;
      const sink = await logSinkFor(c.id);
      if (!sink) continue;
      const run = await loadExportRun(c.id);
      // Switched on without startExportAt: begin now, never with the history.
      if (!run?.cursorAt) { await startExportAt(c.id, now); continue; }
      let cursor = { at: run.cursorAt, id: run.cursorId };
      let sent = 0;
      for (let i = 0; i < MAX_BATCHES; i++) {
        const rows = await auditAfter(c.id, cursor, BATCH);
        if (rows.length === 0) break;
        await sink.write(rows.map(toLogRecord));
        const last = rows[rows.length - 1];
        await advanceExport(c.id, { at: last.at, id: last.id }, rows.length, now);
        cursor = { at: last.at, id: last.id };
        sent += rows.length;
        if (rows.length < BATCH) break;
      }
      out.push({ slug: c.slug, sent });
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      console.warn(`[log-export] ${c.slug}: ${why}`);
      await recordExportError(c.id, why, now).catch(() => undefined);
      out.push({ slug: c.slug, sent: 0, error: why });
    } finally {
      if (leased) await releaseExportLease(c.id).catch(() => undefined);
    }
  }
  return out;
}

const g = globalThis as unknown as { __nextupLogExport?: ReturnType<typeof setInterval>; __nextupLogExportBusy?: boolean };

async function tick(): Promise<void> {
  if (g.__nextupLogExportBusy) return;
  g.__nextupLogExportBusy = true;
  try {
    await runLogExportOnce();
  } finally {
    g.__nextupLogExportBusy = false;
  }
}

/** Start the loop from instrumentation.ts. Idempotent; a no-op without a database. */
export function startLogExport(): void {
  if (!hasDatabase() || g.__nextupLogExport) return;
  g.__nextupLogExport = setInterval(() => void tick(), INTERVAL_MS);
  void tick();
}
