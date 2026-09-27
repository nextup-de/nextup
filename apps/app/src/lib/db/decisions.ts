// The rows behind /admin/decisions: each raise, the events that later said whether its proposed
// route held, and n8n's write-back. Every query names its companies (`companyId: { in: ids }`),
// which is what the tenant guard checks - "all companies" is the admin's intention, not the query's.
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import type { DecisionInput } from "@/features/admin/decisions";
import { raisesFor } from "./automation";
import { getDb } from "./client";

/** The events that settle a proposal: overruled, handed on, answered. */
const SETTLING: CaseEventType[] = ["case.override", "case.handed", "case.decided"];

export async function decisionInputs(
  companies: readonly { id: string; slug: string }[],
  limit = 200,
): Promise<DecisionInput[]> {
  if (companies.length === 0) return [];
  const ids = companies.map((c) => c.id);
  const slugOf = new Map(companies.map((c) => [c.id, c.slug]));

  const raises = await raisesFor(ids, limit);
  const caseIds = raises.flatMap((r) => (r.caseId ? [r.caseId] : []));
  const later = caseIds.length
    ? await getDb().caseEvent.findMany({
        where: { companyId: { in: ids }, targetId: { in: caseIds }, type: { in: SETTLING } },
        orderBy: { seq: "asc" },
        select: { companyId: true, targetId: true, type: true, payload: true },
      })
    : [];

  // Case ids are minted per browser, so the company is part of the key.
  const key = (companyId: string, caseId: string | null) => companyId + "/" + caseId;
  const laterByCase = new Map<string, DecisionInput["later"]>();
  for (const e of later) {
    const k = key(e.companyId, e.targetId);
    laterByCase.set(k, [...(laterByCase.get(k) ?? []), { type: e.type as CaseEventType, payload: (e.payload ?? {}) as EventPayload }]);
  }

  return raises.map((r) => ({
    eventId: r.eventId,
    company: slugOf.get(r.companyId) ?? "",
    caseId: r.caseId,
    raisedAt: r.raisedAt,
    payload: (r.payload ?? {}) as EventPayload,
    later: laterByCase.get(key(r.companyId, r.caseId)) ?? [],
    noticeAt: r.noticeAt,
    desks: [], // filled by the caller, which knows each company's routing table
  }));
}
