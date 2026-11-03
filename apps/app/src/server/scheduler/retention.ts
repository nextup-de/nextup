// The retention scheduler (GDP D16). Every RETENTION_INTERVAL_MS (default 1 h), for every company that
// is not a demo: when its last ok run is before today's 03:00 and it is past 03:00, take the lease on
// its RetentionRun row, run runRetention(), record the result, release. A failing company records its
// error and never stops the others. Started from instrumentation.ts, like the clock.
//
// Not a "use server" module.
import { retentionDue } from "@/features/privacy/retention";
import { getDb, hasDatabase } from "@/lib/db/client";
import { runRetention } from "@/lib/db/retention";

/** A run that dies without releasing loses its lease after this. */
const LEASE_MS = 10 * 60_000;
const MAX_ERROR = 500;

const intervalMs = (): number => {
  const n = Number(process.env.RETENTION_INTERVAL_MS);
  return Number.isFinite(n) && n >= 500 ? n : 3_600_000;
};

/** Take the lease: an update guarded on the row's old lease value, so one runner wins. */
async function claim(companyId: string, now: Date): Promise<boolean> {
  const db = getDb();
  await db.retentionRun.createMany({ data: [{ companyId }], skipDuplicates: true });
  const r = await db.retentionRun.updateMany({
    where: { companyId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseUntil: new Date(now.getTime() + LEASE_MS), lastRunAt: now },
  });
  return r.count === 1;
}

/** One pass over every non-demo company. Never throws. Returns the slugs that ran. */
export async function runRetentionOnce(now: Date = new Date()): Promise<string[]> {
  const ran: string[] = [];
  try {
    const db = getDb();
    const companies = await db.company.findMany({ where: { stage: { not: "demo" } }, select: { id: true, slug: true }, orderBy: { createdAt: "asc" } });
    for (const company of companies) {
      try {
        const state = await db.retentionRun.findUnique({ where: { companyId: company.id }, select: { lastOkAt: true } });
        if (!retentionDue(state?.lastOkAt ?? null, now)) continue;
        if (!(await claim(company.id, now))) continue;
      } catch (e) {
        console.warn(`[retention] ${company.slug}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      try {
        await runRetention(company.id, now);
        await db.retentionRun.updateMany({ where: { companyId: company.id }, data: { lastRunAt: now, lastOkAt: now, lastError: null } });
        ran.push(company.slug);
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        console.warn(`[retention] ${company.slug}: ${why}`);
        await db.retentionRun
          .updateMany({ where: { companyId: company.id }, data: { lastRunAt: now, lastError: why.slice(0, MAX_ERROR) || "failed" } })
          .catch(() => undefined);
      } finally {
        await db.retentionRun.updateMany({ where: { companyId: company.id }, data: { leaseUntil: null } }).catch(() => undefined);
      }
    }
  } catch (e) {
    console.warn(`[retention] run: ${e instanceof Error ? e.message : String(e)}`);
  }
  return ran;
}

const globalForRetention = globalThis as unknown as { __nextupRetention?: ReturnType<typeof setInterval> };

/** Start the loop from instrumentation.ts. Idempotent (dev reloads this module); a no-op without a database. */
export function startRetention(): void {
  if (!hasDatabase() || globalForRetention.__nextupRetention) return;
  globalForRetention.__nextupRetention = setInterval(() => void runRetentionOnce(), intervalMs());
  void runRetentionOnce();
}
