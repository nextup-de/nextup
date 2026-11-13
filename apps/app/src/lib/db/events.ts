// Reading and appending the event log. The only place the app writes history.
import type { EventLog } from "@/features/cases/events";
import { logFromRows, type EventRow, type NewEventRow } from "@/features/cases/persist";
import type { Seed } from "@/features/demo/types";
import { dateOfWorkday, workdayOf } from "@/features/clock/calendar";
import { DEFAULT_CALENDAR, type CalendarSpec } from "@/features/clock";
import { loadCalendar } from "./calendar";
import { getDb } from "./client";
import type { Tx } from "./integrations";
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

/** The date of a company's working day, ISO. A demo company counts simulated days, so it has none. */
export function dateOfCompanyDay(company: { stage: string }, cal: CalendarSpec, day: number): string | null {
  if (company.stage === "demo" || !Number.isInteger(day) || day < 1) return null;
  try {
    return dateOfWorkday(day, cal);
  } catch {
    return null; // a calendar without working days
  }
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

/** Every round of loadLogAround follows one more link; a real chain is two or three long. */
const MAX_ROUNDS = 8;

const projectIdOf = (payload: unknown): string | null => {
  const id = (payload as { projectId?: unknown } | null)?.projectId;
  return typeof id === "string" ? id : null;
};

/**
 * The part of the log that decides these targets (cases, ideas, projects), plus every event with no target. Reduced
 * with the company's seed it gives the same state for each target as the whole log does - the rule appendEventAction
 * checks a new event against - at the cost of the target's own events instead of the company's history. One field
 * differs: a project's `number` counts the company's projects in opening order, so here it counts only the ones loaded.
 * It is a label on screen; no rule reads it, and a caller that shows it needs the whole log.
 *
 * The reducer changes only an event's own target, with one exception: a yes on a case opens or joins the project it
 * names. So the projects come along (the ones named, and the ones a case here opened, joined or is a seed source of),
 * with the events on them and every case.decided that names them - and so their other source cases, so a join is
 * reduced in the order it happened. Links are followed until nothing new turns up.
 */
export async function loadLogAround(
  companyId: string,
  seed: Pick<Seed, "projects">,
  targets: readonly (string | null | undefined)[],
  now: Date = new Date(),
): Promise<EventLog> {
  const db = getDb();
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { stage: true, demoDay: true } });
  const cal = company.stage === "demo" ? null : await loadCalendar(companyId);

  const ids = new Set(targets.filter((t): t is string => typeof t === "string" && t.length > 0));
  // A target may be a project: the yes that opened it names it, so look every target up as one (a case id names none).
  const projects = new Set(ids);
  const doneIds = new Set<string>();
  const doneProjects = new Set<string>();
  const rows = new Map<string, EventRow>();
  let untargeted = false;
  let settled = false;

  for (let round = 0; round < MAX_ROUNDS && !settled; round++) {
    for (const p of seed.projects ?? []) if (ids.has(p.id) || (p.sources ?? []).some((s) => ids.has(s))) projects.add(p.id);
    for (const p of projects) ids.add(p);
    const newIds = [...ids].filter((id) => !doneIds.has(id));
    const newProjects = [...projects].filter((p) => !doneProjects.has(p));
    if (newIds.length === 0 && newProjects.length === 0 && untargeted) {
      settled = true;
      break;
    }
    newIds.forEach((id) => doneIds.add(id));
    newProjects.forEach((p) => doneProjects.add(p));

    const found: EventRow[] = await db.caseEvent.findMany({
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
      if (r.targetId !== null && !ids.has(r.targetId)) ids.add(r.targetId); // a source case of a project here
      const p = r.type === "case.decided" ? projectIdOf(r.payload) : null;
      if (p !== null) projects.add(p);
    }
  }

  // Not settled: a chain longer than any the product makes. The whole log is slower but never wrong.
  if (!settled) return loadLog(companyId, now);
  const ordered = [...rows.values()].sort((a, b) => a.seq - b.seq);
  return logFromRows(await relabelRows(companyId, ordered), cal ? companyDay(company, cal, now) : company.demoDay);
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
 *
 * `along`: a write that must land with the event or not at all (the idea draft a raise publishes, Q1.11).
 * It runs in the same transaction; when it throws, neither is kept and its message is the error.
 */
export async function appendEventRow(
  companyId: string,
  event: NewEventRow,
  opts: { actorUserId?: string | null; source?: string; idemKey?: string | null; now?: Date; along?: (tx: Tx) => Promise<void> } = {},
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
      if (opts.along) await opts.along(tx);
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
