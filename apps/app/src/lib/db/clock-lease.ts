// The lease a scheduler holds on one company's clock (CLK/D13), so two runners never tick it at once.
// Same pattern as claimLease/releaseLease/recordRun in integrations.ts; the row is created on first use.
import { getDb } from "./client";

const MAX_ERROR = 500;

/** Take the company's clock lease. True only for the one run that got it. */
export async function claimClockLease(companyId: string, ms: number, now = new Date()): Promise<boolean> {
  const db = getDb();
  await db.clockLease.createMany({ data: [{ companyId }], skipDuplicates: true });
  const r = await db.clockLease.updateMany({
    where: { companyId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseUntil: new Date(now.getTime() + ms), lastRunAt: now },
  });
  return r.count === 1;
}

/** Give the lease back at the end of a run. */
export async function releaseClockLease(companyId: string): Promise<void> {
  await getDb().clockLease.updateMany({ where: { companyId }, data: { leaseUntil: null } });
}

/** What a finished run records: a good one sets lastOkAt and clears lastError, a failed one says why. */
export async function recordClockRun(companyId: string, r: { error?: string } = {}, now = new Date()): Promise<void> {
  const data = r.error !== undefined
    ? { lastRunAt: now, lastError: r.error.slice(0, MAX_ERROR) || "failed" }
    : { lastRunAt: now, lastOkAt: now, lastError: null };
  await getDb().clockLease.updateMany({ where: { companyId }, data });
}
