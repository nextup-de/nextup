// The log export's state per company (EID D13): the cursor over AuditEvent rows (at, id), the lease that
// keeps one exporter per company, and what the settings card shows. The cursor moves only after a write
// resolved. Every query is scoped by company.
import { getDb } from "@/lib/db/client";
import type { AuditRow } from "@/lib/db/audit";

const MAX_ERROR = 500;
const MAX_TAKE = 500;

export type ExportCursor = { at: Date; id: string | null };
export type ExportRun = {
  companyId: string;
  cursorAt: Date | null;
  cursorId: string | null;
  leaseUntil: Date | null;
  lastRunAt: Date | null;
  lastOkAt: Date | null;
  lastError: string | null;
  day: string | null;
  sentToday: number;
};

const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

export async function loadExportRun(companyId: string): Promise<ExportRun | null> {
  return getDb().auditExportRun.findUnique({ where: { companyId } });
}

/** Switching the export on: from now, history stays in the CSV. */
export async function startExportAt(companyId: string, now: Date): Promise<void> {
  const data = { cursorAt: now, cursorId: null, leaseUntil: null, lastError: null };
  await getDb().auditExportRun.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
}

/** One conditional update, so one exporter wins, also across processes. */
export async function claimExportLease(companyId: string, ms: number, now: Date): Promise<boolean> {
  const db = getDb();
  await db.auditExportRun.createMany({ data: [{ companyId }], skipDuplicates: true });
  const r = await db.auditExportRun.updateMany({
    where: { companyId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseUntil: new Date(now.getTime() + ms), lastRunAt: now },
  });
  return r.count === 1;
}

export async function releaseExportLease(companyId: string): Promise<void> {
  await getDb().auditExportRun.updateMany({ where: { companyId }, data: { leaseUntil: null } });
}

/** The rows after the cursor, oldest first (at, id). */
export async function auditAfter(companyId: string, cursor: ExportCursor, take: number): Promise<AuditRow[]> {
  const n = Math.max(0, Math.min(Math.floor(take), MAX_TAKE));
  const after = cursor.id === null
    ? { at: { gt: cursor.at } }
    : { OR: [{ at: { gt: cursor.at } }, { at: cursor.at, id: { gt: cursor.id } }] };
  return getDb().auditEvent.findMany({ where: { companyId, ...after }, orderBy: [{ at: "asc" }, { id: "asc" }], take: n });
}

/** The write resolved: move the cursor to the last row sent and count them. */
export async function advanceExport(companyId: string, last: { at: Date; id: string }, count: number, now: Date): Promise<void> {
  const db = getDb();
  const today = dayOf(now);
  const run = await db.auditExportRun.findUnique({ where: { companyId }, select: { day: true, sentToday: true } });
  const sentToday = (run?.day === today ? run.sentToday : 0) + count;
  await db.auditExportRun.update({
    where: { companyId },
    data: { cursorAt: last.at, cursorId: last.id, lastRunAt: now, lastOkAt: now, lastError: null, day: today, sentToday },
  });
}

export async function recordExportError(companyId: string, error: string, now: Date): Promise<void> {
  await getDb().auditExportRun.updateMany({
    where: { companyId },
    data: { lastRunAt: now, lastError: error.slice(0, MAX_ERROR) || "failed" },
  });
}

export async function exportStatus(
  companyId: string,
  now: Date = new Date(),
): Promise<{ lastOkAt: Date | null; sentToday: number; lastError: string | null }> {
  const run = await loadExportRun(companyId);
  return {
    lastOkAt: run?.lastOkAt ?? null,
    sentToday: run && run.day === dayOf(now) ? run.sentToday : 0,
    lastError: run?.lastError ?? null,
  };
}
