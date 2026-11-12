// One case, one writer at a time (plan GAT, D32): a transaction that takes a per-case advisory lock, reads the case's log inside it, and lets the caller
// write rows that commit together or not at all. Two approvers answering the last step at the same moment are serialized by the lock, so the second one
// reads the first one's answer and its decision before it checks anything. Every query names the company at the top level, so the tenant guard sees it.
import type { CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { logFromRows, type EventRow } from "@/features/cases/persist";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { loadCalendar } from "./calendar";
import { getDb } from "./client";
import { companyDay } from "./events";
import type { Tx } from "./integrations";
import { projectCases } from "./projections/case-view";

const SELECT = { id: true, seq: true, day: true, ts: true, type: true, actor: true, actorUserId: true, targetId: true, payload: true } as const;
/** Every round follows one more link (a case, the project its yes names, that project's other cases); a real chain is two or three long. */
const MAX_ROUNDS = 8;

const projectIdOf = (payload: unknown): string | null => {
  const id = (payload as { projectId?: unknown } | null)?.projectId;
  return typeof id === "string" ? id : null;
};

/**
 * The case's log and everything that decides it, read inside the transaction: its own events, the project its yes or provisional yes names with that
 * project's events, and the other cases that yes joined, until nothing new turns up; plus the events without a target. The same part of the log as
 * lib/db/events.ts loadLogAround reads, through the lock's own connection.
 */
async function loadAround(tx: Tx, companyId: string, caseId: string, now: Date): Promise<EventLog> {
  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { stage: true, demoDay: true } });
  const cal = company.stage === "demo" ? DEFAULT_CALENDAR : await loadCalendar(companyId);
  const ids = new Set<string>([caseId]);
  const projects = new Set<string>();
  const doneIds = new Set<string>();
  const doneProjects = new Set<string>();
  const rows = new Map<string, EventRow>();
  let untargeted = false;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    for (const p of projects) ids.add(p);
    const newIds = [...ids].filter((id) => !doneIds.has(id));
    const newProjects = [...projects].filter((p) => !doneProjects.has(p));
    if (newIds.length === 0 && newProjects.length === 0 && untargeted) break;
    newIds.forEach((id) => doneIds.add(id));
    newProjects.forEach((p) => doneProjects.add(p));
    const found: EventRow[] = await tx.caseEvent.findMany({
      where: {
        companyId,
        OR: [
          ...(newIds.length > 0 ? [{ targetId: { in: newIds } }] : []),
          ...(untargeted ? [] : [{ targetId: null }]),
          ...newProjects.map((p) => ({ type: "case.decided", payload: { path: ["projectId"], equals: p } })),
        ],
      },
      select: SELECT,
    });
    untargeted = true;
    for (const r of found) {
      rows.set(r.id, r);
      if (r.targetId !== null && !ids.has(r.targetId)) ids.add(r.targetId);
      const p = r.type === "case.decided" || r.type === "case.provisional" ? projectIdOf(r.payload) : null;
      if (p !== null) projects.add(p);
    }
  }
  return logFromRows([...rows.values()].sort((a, b) => a.seq - b.seq), companyDay(company, cal, now));
}

/**
 * Runs `fn` in one transaction under the case's lock: `pg_advisory_xact_lock` on the company and the case, then the case's log, read after the lock was
 * granted. What `fn` writes through insertEventRows is committed with it or, when it throws, not at all. After the commit the case's projection is
 * refreshed, as appendEventRow does; a projection error is logged and never fails the write.
 */
export async function withCaseLock<T>(companyId: string, caseId: string, fn: (tx: Tx, log: EventLog) => Promise<T>, now: Date = new Date()): Promise<T> {
  const result = await getDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${companyId + ":" + caseId}::text, 0::bigint))`;
    return fn(tx, await loadAround(tx, companyId, caseId, now));
  });
  try {
    await projectCases(companyId, [caseId], now);
  } catch (err) {
    console.error("projectCases failed", err);
  }
  return result;
}

/** One event to insert: the id is the caller's (a retry collides on it), `idemKey` makes a second write of the same decision impossible. */
export type NewRow = {
  id: string;
  type: CaseEventType;
  actor: string;
  actorUserId?: string | null;
  targetId: string | null;
  payload: EventPayload;
  source?: string;
  idemKey?: string | null;
};

/** Inserts the rows in order, in the caller's transaction, each with the company's day now (as appendEventRow stamps it). */
export async function insertEventRows(tx: Tx, companyId: string, rows: readonly NewRow[], now: Date = new Date()): Promise<void> {
  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { stage: true, demoDay: true } });
  const cal = company.stage === "demo" ? DEFAULT_CALENDAR : await loadCalendar(companyId);
  const day = companyDay(company, cal, now);
  for (const r of rows) {
    await tx.caseEvent.create({
      data: {
        id: r.id, companyId, day, type: r.type, actor: r.actor, actorUserId: r.actorUserId ?? null, targetId: r.targetId,
        payload: r.payload as object, source: r.source ?? "app", idemKey: r.idemKey ?? null,
      },
    });
  }
}
