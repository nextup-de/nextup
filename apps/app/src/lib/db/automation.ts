// What /admin needs to answer "are route owners actually being told?": how many notices each
// company has had written onto its cases, and which raise each one answers.
//
// Both queries name their companies. CaseEvent is a tenant table, so scope.ts refuses an unscoped
// read - and rightly: "every company" is an admin intention, not a property of the query. The
// caller passes the ids it already listed, and `companyId: { in: ids }` is what the guard checks.
import type { CompanyAutomation } from "@/features/integrations/automation";
import { NOTICE_SOURCES, noticeKey } from "@/features/cases/notice";
import { getDb } from "./client";

/** A notice: the note written onto a case once its owner was emailed (features/cases/notice.ts). */
const isNotice = { source: { in: [...NOTICE_SOURCES] }, idemKey: { startsWith: noticeKey("") } };

/** One row per company given, in that order. */
export async function automationFor(
  companies: readonly { id: string; slug: string; name: string }[],
): Promise<CompanyAutomation[]> {
  if (companies.length === 0) return [];

  const written = await getDb().caseEvent.groupBy({
    by: ["companyId"],
    where: { companyId: { in: companies.map((c) => c.id) }, ...isNotice },
    _count: { _all: true },
    _max: { ts: true },
  });
  const byCompany = new Map(written.map((w) => [w.companyId, w]));

  return companies.map((c) => {
    const w = byCompany.get(c.id);
    return {
      slug: c.slug,
      name: c.name,
      notices: w?._count._all ?? 0,
      lastNoticeAt: w?._max.ts?.toISOString() ?? null,
    };
  });
}

/** A raise, with whatever the automation did about it. Ordered newest first. */
export type RaiseRow = {
  eventId: string;
  companyId: string;
  caseId: string | null;
  payload: unknown;
  raisedAt: string;
  noticeAt: string | null;
};

/**
 * The last `limit` raises across the companies given, each paired with its notice.
 *
 * The join is on the notice's idempotency key (`notify:<eventId>`), so a raise is matched to its
 * own notice and to no other. Two queries rather than a relation: CaseEvent has no
 * self-relation, and inventing one for this would be a schema change.
 */
export async function raisesFor(
  companyIds: readonly string[],
  limit = 25,
): Promise<RaiseRow[]> {
  if (companyIds.length === 0) return [];
  const ids = [...companyIds];

  const raises = await getDb().caseEvent.findMany({
    where: { companyId: { in: ids }, type: "case.raised" },
    orderBy: { seq: "desc" },
    take: limit,
    select: { id: true, companyId: true, targetId: true, payload: true, ts: true },
  });
  if (raises.length === 0) return [];

  const notices = await getDb().caseEvent.findMany({
    where: {
      companyId: { in: ids },
      source: { in: [...NOTICE_SOURCES] },
      idemKey: { in: raises.map((r) => noticeKey(r.id)) },
    },
    select: { idemKey: true, ts: true },
  });
  const noticeAt = new Map(notices.map((n) => [n.idemKey, n.ts]));

  return raises.map((r) => ({
    eventId: r.id,
    companyId: r.companyId,
    caseId: r.targetId,
    payload: r.payload,
    raisedAt: r.ts.toISOString(),
    noticeAt: noticeAt.get(noticeKey(r.id))?.toISOString() ?? null,
  }));
}

/** How many cases have been raised across these companies. Cheap, and it is what tells the
 *  notices card apart from "nothing raised yet" and "raised, but nobody was emailed". */
export async function raiseCountFor(companyIds: readonly string[]): Promise<number> {
  if (companyIds.length === 0) return 0;
  return getDb().caseEvent.count({
    where: { companyId: { in: [...companyIds] }, type: "case.raised" },
  });
}
