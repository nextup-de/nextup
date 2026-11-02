// Readers over the CaseView rows (VIS/D7). Each answers for the one company it is asked about:
// every query names the companyId, and the key overlap goes through $queryRaw with parameters only.
import type { Me } from "@/features/auth/identity";
import { getDb } from "../client";

export type CaseViewRow = {
  caseId: string; kind: string; status: string; open: boolean; routeId: string | null; assigneeSeatId: string | null;
  assigneeRoleId: string | null; escalatedRoleId: string | null; fromUserId: string | null; dueDay: number;
  firstAnswerDay: number | null; lastDay: number; lastSeq: number; accessKeys: string[];
};

/** The shipping window of VIS/D9: open cases always, closed ones back to `sinceDay`, at most `limit` newest by lastDay. */
export type CaseWindow = { sinceDay: number; limit: number };

const COLUMNS = {
  caseId: true, kind: true, status: true, open: true, routeId: true, assigneeSeatId: true, assigneeRoleId: true,
  escalatedRoleId: true, fromUserId: true, dueDay: true, firstAnswerDay: true, lastDay: true, lastSeq: true, accessKeys: true,
} as const;

/** One case's row, or null. */
export async function caseView(companyId: string, caseId: string): Promise<CaseViewRow | null> {
  return getDb().caseView.findUnique({ where: { companyId_caseId: { companyId, caseId } }, select: COLUMNS });
}

/** Open cases on the viewer's desk (their seat, their role, or an escalation to their role) that they may open. */
export async function inboxView(companyId: string, viewerKeys: string[], me: Me): Promise<CaseViewRow[]> {
  if (viewerKeys.length === 0) return [];
  const ids = await getDb().$queryRaw<{ caseId: string }[]>`
    SELECT "caseId" FROM "CaseView"
    WHERE "companyId" = ${companyId} AND "open" = true AND "accessKeys" && ${viewerKeys}::text[]
      AND ("assigneeSeatId" = ANY(${me.seatIds}::text[]) OR "assigneeRoleId" = ANY(${me.roleIds}::text[]) OR "escalatedRoleId" = ANY(${me.roleIds}::text[]))`;
  if (ids.length === 0) return [];
  return getDb().caseView.findMany({ where: { companyId, caseId: { in: ids.map((r) => r.caseId) } }, orderBy: [{ dueDay: "asc" }, { caseId: "asc" }], select: COLUMNS });
}

/** The ids of the cases the viewer may open inside the window, newest first. */
export async function visibleCaseIds(companyId: string, viewerKeys: string[], window: CaseWindow): Promise<string[]> {
  if (viewerKeys.length === 0) return [];
  const rows = await getDb().$queryRaw<{ caseId: string }[]>`
    SELECT "caseId" FROM "CaseView"
    WHERE "companyId" = ${companyId} AND "accessKeys" && ${viewerKeys}::text[] AND ("open" = true OR "lastDay" >= ${window.sinceDay})
    ORDER BY "lastDay" DESC, "caseId" ASC
    LIMIT ${window.limit}`;
  return rows.map((r) => r.caseId);
}

export type MetricInput = { caseId: string; status: string; routeId: string | null; dueDay: number; firstAnswerDay: number | null; lastDay: number };

/** Per case with activity between the days `from` and `to` (inclusive): no person, only the facts MET counts. */
export async function metricInputs(companyId: string, from: number, to: number): Promise<MetricInput[]> {
  return getDb().caseView.findMany({
    where: { companyId, lastDay: { gte: from, lte: to } },
    orderBy: { caseId: "asc" },
    select: { caseId: true, status: true, routeId: true, dueDay: true, firstAnswerDay: true, lastDay: true },
  });
}
