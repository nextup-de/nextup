// Reading and appending the event log. The only place the app writes history.
import type { EventLog } from "@/features/cases/events";
import { logFromRows, type NewEventRow } from "@/features/cases/persist";
import { workdayOf } from "@/features/clock/calendar";
import { DEFAULT_CALENDAR, type CalendarSpec } from "@/features/clock";
import { loadCalendar } from "./calendar";
import { getDb } from "./client";
import { projectCases } from "./projections/case-view";
import { relabelRows } from "./pseudonymise";

const SELECT = {
  id: true,
  seq: true,
  day: true,
  ts: true,
  type: true,
  actor: true,
  actorUserId: true,
  targetId: true,
  payload: true,
} as const;

/**
 * The company's day now: a demo company keeps its simulated counter, any other stage counts
 * working days of its calendar (CLK/D9).
 */
export function companyDay(company: { stage: string; demoDay: number }, cal: CalendarSpec, now: Date): number {
  return company.stage === "demo" ? company.demoDay : workdayOf(now, cal);
}

/** Every event for one company, plus its clock (demoDay, or today's working-day number). */
export async function loadLog(companyId: string, now: Date = new Date()): Promise<EventLog> {
  const db = getDb();
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { stage: true, demoDay: true } });
  const cal = company.stage === "demo" ? null : await loadCalendar(companyId);
  const rows = await db.caseEvent.findMany({
    where: { companyId },
    orderBy: { seq: "asc" },
    select: SELECT,
  });
  return logFromRows(await relabelRows(companyId, rows), cal ? companyDay(company, cal, now) : company.demoDay);
}

/** Load a company's log by slug, resolving its clock in the same trip. */
export async function loadLogForSlug(slug: string, now: Date = new Date()): Promise<EventLog | null> {
  const company = await getDb().company.findUnique({ where: { slug }, select: { id: true } });
  if (!company) return null;
  return loadLog(company.id, now);
}

/** Has this company already stored an event under this integration idempotency key? */
export async function hasIdemKey(companyId: string, idemKey: string): Promise<boolean> {
  const row = await getDb().caseEvent.findUnique({
    where: { companyId_idemKey: { companyId, idemKey } },
    select: { id: true },
  });
  return row !== null;
}

export type AppendResult = { ok: true; duplicate: boolean } | { ok: false; error: string };

/**
 * Append one event.
 *
 * The row's `day` is the company's clock (companyDay) BEFORE this event, matching appendEvent() in
 * features/cases/events.ts - a day.advanced event carries the day it left, not the one it
 * arrived at. Both the insert and the clock move happen in one transaction.
 *
 * The id is minted by the caller, so a retried action collides on the primary key instead of
 * writing a second row. That collision is reported as `duplicate`, not as an error.
 */
export async function appendEventRow(
  companyId: string,
  event: NewEventRow,
  opts: { actorUserId?: string | null; source?: string; idemKey?: string | null; now?: Date } = {},
): Promise<AppendResult> {
  const db = getDb();
  try {
    await db.$transaction(async (tx) => {
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { stage: true, demoDay: true },
      });
      const cal = company.stage === "demo" ? DEFAULT_CALENDAR : await loadCalendar(companyId);
      await tx.caseEvent.create({
        data: {
          id: event.id,
          companyId,
          day: companyDay(company, cal, opts.now ?? new Date()),
          type: event.type,
          actor: event.actor,
          actorUserId: opts.actorUserId ?? null,
          targetId: event.targetId,
          payload: event.payload as object,
          source: opts.source ?? "app",
          idemKey: opts.idemKey ?? null,
        },
      });
      if (event.type === "day.advanced") {
        const by = typeof event.payload.by === "number" ? event.payload.by : 1;
        await tx.company.update({ where: { id: companyId }, data: { demoDay: { increment: by } } });
      }
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: true, duplicate: true };
    return { ok: false, error: err instanceof Error ? err.message : "could not save" };
  }
  // After the commit: a projection error is logged and never fails the append (VIS/D6).
  if (event.targetId !== null) {
    try {
      await projectCases(companyId, [event.targetId], opts.now);
    } catch (err) {
      console.error("projectCases failed", err);
    }
  }
  return { ok: true, duplicate: false };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

/** Reset a company to its seed: drop what happened, put the clock back to today. */
export async function resetCompanyLog(companyId: string): Promise<number> {
  const db = getDb();
  const { count } = await db.caseEvent.deleteMany({ where: { companyId } });
  await db.company.update({ where: { id: companyId }, data: { demoDay: 0 } });
  return count;
}

/** Drop everything about the given targets - the dev panel's "delete added cases". */
export async function deleteEventsForTargets(companyId: string, targetIds: string[]): Promise<number> {
  if (targetIds.length === 0) return 0;
  const { count } = await getDb().caseEvent.deleteMany({
    where: { companyId, targetId: { in: targetIds } },
  });
  return count;
}
