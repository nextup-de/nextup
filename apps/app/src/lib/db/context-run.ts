// A company's context run (CompanyContextRun, docs/COMPANY_KNOWLEDGE.md): one row per company, the latest
// run. Every query names the company; the lease sits on the row, with the same claim-then-release shape
// as lib/db/clock-lease.ts. The draft is text that came from a file, so nothing here logs it.
import { Prisma } from "@prisma/client";
import { readDraft, type ContextDraft, type ContextError, type ContextRunStatus } from "@/features/settings/context-draft";
import { getDb, type Db } from "./client";
import type { Tx } from "./org-edit";

export type ContextRunRow = {
  status: ContextRunStatus;
  startedById: string;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
  draft: ContextDraft | null;
  reviewedAt: Date | null;
};

const asStatus = (s: string): ContextRunStatus => (s === "running" || s === "ready" ? s : "failed");

export async function loadContextRun(companyId: string, client: Tx | Db = getDb()): Promise<ContextRunRow | null> {
  const r = await client.companyContextRun.findUnique({
    where: { companyId },
    select: { status: true, startedById: true, startedAt: true, finishedAt: true, error: true, draft: true, reviewedAt: true },
  });
  return r ? { ...r, status: asStatus(r.status), draft: readDraft(r.draft) } : null;
}

/** Start a run, replacing the last one. False while one is running: one run at a time, per company. */
export async function beginContextRun(companyId: string, startedById: string, now = new Date(), client: Tx | Db = getDb()): Promise<boolean> {
  await client.companyContextRun.createMany({
    data: [{ companyId, startedById, startedAt: now, status: "failed", error: "interrupted" }],
    skipDuplicates: true,
  });
  const r = await client.companyContextRun.updateMany({
    where: { companyId, status: { not: "running" } },
    data: {
      status: "running", startedById, startedAt: now, finishedAt: null, error: null, draft: Prisma.DbNull,
      reviewedAt: null, mailedAt: null, leaseUntil: null, attempts: 0,
    },
  });
  return r.count === 1;
}

/** Companies with a run waiting. A plain Company read, no tenant rows (as companiesWithIntegrationOn). */
export async function companiesWithRunningContext(): Promise<{ id: string; slug: string; name: string }[]> {
  return getDb().company.findMany({
    where: { contextRun: { is: { status: "running" } } },
    select: { id: true, slug: true, name: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Companies whose finished run has not told its starter yet, within `since`. */
export async function companiesWithContextMailDue(since: Date): Promise<{ id: string; slug: string; name: string }[]> {
  return getDb().company.findMany({
    where: { contextRun: { is: { status: { in: ["ready", "failed"] }, mailedAt: null, finishedAt: { gte: since } } } },
    select: { id: true, slug: true, name: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Take the lease. The new attempt count for the one run that got it, null for every other. */
export async function claimContextRun(companyId: string, ms: number, now = new Date()): Promise<{ attempts: number; startedById: string } | null> {
  const db = getDb();
  const r = await db.companyContextRun.updateMany({
    where: { companyId, status: "running", OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseUntil: new Date(now.getTime() + ms), attempts: { increment: 1 } },
  });
  if (r.count !== 1) return null;
  return db.companyContextRun.findUnique({ where: { companyId }, select: { attempts: true, startedById: true } });
}

/** The end of a run: its draft, or the reason there is none. Only a running row can finish. */
export async function finishContextRun(
  companyId: string,
  end: { draft: ContextDraft } | { error: ContextError },
  now = new Date(),
  client: Tx | Db = getDb(),
): Promise<boolean> {
  const r = await client.companyContextRun.updateMany({
    where: { companyId, status: "running" },
    data: "draft" in end
      ? { status: "ready", draft: end.draft as unknown as Prisma.InputJsonValue, error: null, finishedAt: now, leaseUntil: null }
      : { status: "failed", draft: Prisma.DbNull, error: end.error, finishedAt: now, leaseUntil: null },
  });
  return r.count === 1;
}

export async function markContextMailed(companyId: string, now = new Date()): Promise<void> {
  await getDb().companyContextRun.updateMany({ where: { companyId }, data: { mailedAt: now } });
}

/**
 * What was saved leaves the draft; the rest stays to decide later. When nothing is left the draft is gone
 * and the run counts as reviewed. `discard`: the person is done with all of it.
 */
export async function settleContextDraft(companyId: string, draft: ContextDraft | null, now = new Date(), client: Tx | Db = getDb()): Promise<void> {
  await client.companyContextRun.updateMany({
    where: { companyId, status: "ready" },
    data: draft
      ? { draft: draft as unknown as Prisma.InputJsonValue }
      : { draft: Prisma.DbNull, reviewedAt: now },
  });
}

/** Old drafts leave the database even if nobody looked at them (they hold text from files). Returns how many. */
export async function expireContextDrafts(before: Date, client: Tx | Db = getDb()): Promise<number> {
  const companies = await getDb().company.findMany({
    where: { contextRun: { is: { status: "ready", finishedAt: { lt: before }, reviewedAt: null, error: null } } },
    select: { id: true },
  });
  let n = 0;
  for (const c of companies) {
    const r = await client.companyContextRun.updateMany({
      where: { companyId: c.id, status: "ready", reviewedAt: null },
      data: { draft: Prisma.DbNull, error: "expired" },
    });
    n += r.count;
  }
  return n;
}
