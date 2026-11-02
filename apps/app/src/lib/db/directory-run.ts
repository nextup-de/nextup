// A company's directory sync row (DirectoryRun, phase DIR): the switch, the source, the cursor and
// the lease that keeps one runner per company. Same pattern as integrations.ts (claimLease, recordRun).
import type { Prisma } from "@prisma/client";
import { sourceKind, type DirectoryCounts, type DirectorySourceKind, type DirectoryStatus } from "@/features/directory";
import { getDb } from "./client";

/** A failed round records its reason; cut so one bad response cannot fill the row. */
const MAX_ERROR = 500;

const where = (companyId: string) => ({ companyId });

/** The raw row, cursor included - for the sync itself. Null when the company has none. */
export async function loadDirectoryRun(companyId: string) {
  return getDb().directoryRun.findUnique({ where: where(companyId) });
}

/** Switch it on or off and choose the source. Creates the row when missing; releases any lease. */
export async function setDirectoryOn(companyId: string, on: boolean, source: DirectorySourceKind, by: string | null): Promise<void> {
  const data = { on, source: sourceKind(source), leaseUntil: null, updatedBy: by };
  await getDb().directoryRun.upsert({ where: where(companyId), create: { companyId, ...data }, update: data });
}

/** Take the lease for `ms`. True only for the one winner, also across processes (one conditional UPDATE). */
export async function claimDirectoryLease(companyId: string, ms: number, now = new Date()): Promise<boolean> {
  const db = getDb();
  await db.directoryRun.createMany({ data: [{ companyId }], skipDuplicates: true });
  const r = await db.directoryRun.updateMany({
    where: { companyId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseUntil: new Date(now.getTime() + ms), lastRunAt: now },
  });
  return r.count === 1;
}

export async function releaseDirectoryLease(companyId: string): Promise<void> {
  await getDb().directoryRun.updateMany({ where: where(companyId), data: { leaseUntil: null } });
}

/** Keep the source's cursor (the Graph deltaLink) for the next round. */
export async function saveDirectoryCursor(companyId: string, cursor: string | null): Promise<void> {
  await getDb().directoryRun.updateMany({ where: where(companyId), data: { cursor } });
}

/** A good round (no `error`) sets lastOkAt, clears lastError and stores its counts; a failed one only says why. */
export async function recordDirectoryRun(
  companyId: string,
  r: { counts?: DirectoryCounts; error?: string },
  now = new Date(),
): Promise<void> {
  const data: Prisma.DirectoryRunUpdateManyMutationInput =
    r.error !== undefined
      ? { lastError: r.error.slice(0, MAX_ERROR) || "failed" }
      : { lastOkAt: now, lastError: null, ...(r.counts ?? {}) };
  await getDb().directoryRun.updateMany({ where: where(companyId), data });
}

const NONE: DirectoryCounts = { added: 0, updated: 0, deactivated: 0, handed: 0 };

/** What a page may show. Never the cursor. */
export async function loadDirectoryStatus(companyId: string): Promise<DirectoryStatus> {
  const row = await getDb().directoryRun.findUnique({
    where: where(companyId),
    select: { on: true, source: true, lastRunAt: true, lastOkAt: true, lastError: true, added: true, updated: true, deactivated: true, handed: true },
  });
  if (!row) return { on: false, source: "graph", lastRunAt: null, lastOkAt: null, lastError: null, counts: { ...NONE } };
  return {
    on: row.on,
    source: sourceKind(row.source),
    lastRunAt: row.lastRunAt,
    lastOkAt: row.lastOkAt,
    lastError: row.lastError,
    counts: { added: row.added, updated: row.updated, deactivated: row.deactivated, handed: row.handed },
  };
}

/** The companies with the sync switched on - what the loop walks. */
export async function companiesWithDirectoryOn(): Promise<{ id: string; slug: string }[]> {
  // A relation filter from Company, which the tenant guard does not look into; the rows returned are companies.
  return getDb().company.findMany({
    where: { directoryRun: { is: { on: true } } },
    select: { id: true, slug: true },
    orderBy: { createdAt: "asc" },
  });
}
