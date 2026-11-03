// The decision log (LOOP/D21): every yes and no on a case the viewer may open, newest first, paged.
// Built on CaseView (who may open) and CaseEvent (the decisions); no table of its own. Every query
// names the companyId, and the key overlap goes through $queryRaw with parameters only.
import { getDb } from "../client";

export const DECISION_PAGE_SIZE = 50;

export type DecisionRow = {
  caseId: string; title: string; kind: string; day: number; answer: "yes" | "no"; reason: string; note: string;
  deciderUserId: string | null; roleId: string | null; projectId: string | null;
};

export type DecisionFilter = {
  /** Only decisions made on this day or later (a working day in a real company). */
  fromDay?: number;
  answer?: "yes" | "no";
  project?: "with" | "without";
  /** Matches the case title, the case id, the reason and the note, ignoring case. */
  q?: string;
};

type Raw = {
  caseId: string; title: string | null; kind: string; day: number; answer: string | null; reason: string | null; note: string | null;
  actorUserId: string | null; roleId: string | null; projectId: string | null;
};

const escapeLike = (s: string): string => s.replace(/[\%_]/g, (c) => "\\" + c);

/** One page (1-based) of the log and the number of decisions that match all together. */
export async function decisionLog(
  companyId: string, viewerKeys: string[], filter: DecisionFilter = {}, page = 1,
): Promise<{ rows: DecisionRow[]; total: number }> {
  if (viewerKeys.length === 0) return { rows: [], total: 0 };
  const from = filter.fromDay ?? null;
  const answer = filter.answer ?? null;
  const project = filter.project ?? null;
  const q = filter.q?.trim() ? `%${escapeLike(filter.q.trim())}%` : null;
  const offset = (Math.max(1, Math.floor(page) || 1) - 1) * DECISION_PAGE_SIZE;
  const db = getDb();

  const [rows, count] = await Promise.all([
    db.$queryRaw<Raw[]>`
      SELECT e."targetId" AS "caseId", r."payload"->>'title' AS "title", v."kind" AS "kind", e."day" AS "day",
             e."payload"->>'answer' AS "answer", e."payload"->>'reason' AS "reason", e."payload"->>'note' AS "note",
             e."actorUserId" AS "actorUserId", v."assigneeRoleId" AS "roleId", NULLIF(e."payload"->>'projectId', '') AS "projectId"
      FROM "CaseEvent" e
      JOIN "CaseView" v ON v."companyId" = e."companyId" AND v."caseId" = e."targetId"
      LEFT JOIN LATERAL (
        SELECT x."payload" FROM "CaseEvent" x
        WHERE x."companyId" = e."companyId" AND x."targetId" = e."targetId" AND x."type" = 'case.raised'
        ORDER BY x."seq" ASC LIMIT 1
      ) r ON true
      WHERE e."companyId" = ${companyId} AND e."type" = 'case.decided' AND v."accessKeys" && ${viewerKeys}::text[]
        AND (${from}::int IS NULL OR e."day" >= ${from}::int)
        AND (${answer}::text IS NULL OR e."payload"->>'answer' = ${answer}::text)
        AND (${project}::text IS NULL
             OR (${project}::text = 'with' AND COALESCE(e."payload"->>'projectId', '') <> '')
             OR (${project}::text = 'without' AND COALESCE(e."payload"->>'projectId', '') = ''))
        AND (${q}::text IS NULL
             OR COALESCE(r."payload"->>'title', '') ILIKE ${q}::text OR e."targetId" ILIKE ${q}::text
             OR COALESCE(e."payload"->>'reason', '') ILIKE ${q}::text OR COALESCE(e."payload"->>'note', '') ILIKE ${q}::text)
      ORDER BY e."day" DESC, e."seq" DESC
      LIMIT ${DECISION_PAGE_SIZE} OFFSET ${offset}`,
    db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS "n"
      FROM "CaseEvent" e
      JOIN "CaseView" v ON v."companyId" = e."companyId" AND v."caseId" = e."targetId"
      LEFT JOIN LATERAL (
        SELECT x."payload" FROM "CaseEvent" x
        WHERE x."companyId" = e."companyId" AND x."targetId" = e."targetId" AND x."type" = 'case.raised'
        ORDER BY x."seq" ASC LIMIT 1
      ) r ON true
      WHERE e."companyId" = ${companyId} AND e."type" = 'case.decided' AND v."accessKeys" && ${viewerKeys}::text[]
        AND (${from}::int IS NULL OR e."day" >= ${from}::int)
        AND (${answer}::text IS NULL OR e."payload"->>'answer' = ${answer}::text)
        AND (${project}::text IS NULL
             OR (${project}::text = 'with' AND COALESCE(e."payload"->>'projectId', '') <> '')
             OR (${project}::text = 'without' AND COALESCE(e."payload"->>'projectId', '') = ''))
        AND (${q}::text IS NULL
             OR COALESCE(r."payload"->>'title', '') ILIKE ${q}::text OR e."targetId" ILIKE ${q}::text
             OR COALESCE(e."payload"->>'reason', '') ILIKE ${q}::text OR COALESCE(e."payload"->>'note', '') ILIKE ${q}::text)`,
  ]);

  return {
    total: Number(count[0]?.n ?? 0),
    rows: rows.map((r) => ({
      caseId: r.caseId, title: r.title?.trim() ? r.title : r.caseId, kind: r.kind, day: r.day,
      answer: r.answer === "no" ? "no" : "yes", reason: r.reason ?? "", note: r.note ?? "",
      deciderUserId: r.actorUserId, roleId: r.roleId, projectId: r.projectId,
    })),
  };
}
