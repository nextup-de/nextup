// What leaves the server for one browser (VIS/D8, D9): the events of the cases the viewer may open
// inside the window, of the projects those cases opened or joined, every idea.* event and every event
// with no target. The reducer runs on this smaller log unchanged - an absent case is simply not there.
import type { Role } from "@/config/roles";
import { meFor } from "@/features/auth/identity";
import type { EventLog, EventPayload } from "@/features/cases/events";
import { logFromRows, type EventRow } from "@/features/cases/persist";
import { membersForViewer, unitsOf, viewerKeys, type VisMember } from "@/features/cases/visibility";
import type { Seed, SeedCase } from "@/features/demo/types";
import type { SeedProject } from "@/features/projects/types";
import { loadCalendar } from "./calendar";
import { getDb } from "./client";
import { companySeed } from "./companies";
import { companyDay, loadLog } from "./events";
import { loadSeats } from "./holders";
import { loadKnowledge, loadMembers } from "./knowledge";
import { caseView, visibleCaseIds } from "./projections/readers";
import { relabelRows } from "./pseudonymise";

/** The window of VIS/D9: open cases, and closed ones whose last day is within this many working days. */
export const WINDOW_DAYS = 90;
/** At most this many cases (the newest by lastDay) are shipped. */
export const WINDOW_CASES = 500;

const SELECT = { id: true, seq: true, day: true, ts: true, type: true, actor: true, actorUserId: true, targetId: true, payload: true } as const;

export type LogViewer = { userId: string; role: Role };

/** The log a browser gets, with the ids it was cut to; `caseIds`/`projectIds` are null when it is the full log (no CaseView rows, Q3). */
export type ViewerLog = { log: EventLog; caseIds: string[] | null; projectIds: string[] | null };

async function keysOf(companyId: string, viewer: LogViewer): Promise<string[]> {
  const [seats, knowledge, members] = await Promise.all([loadSeats(companyId), loadKnowledge(companyId), loadMembers(companyId)]);
  const me = meFor(viewer.userId, seats);
  return viewerKeys(me, viewer.role, unitsOf(me, { roles: knowledge.roles, members }));
}

/** The people without a seat this viewer's browser needs, so its lists agree with the server (FX3). */
export async function membersOfViewer(companyId: string, userId: string): Promise<VisMember[]> {
  const [seats, knowledge, members] = await Promise.all([loadSeats(companyId), loadKnowledge(companyId), loadMembers(companyId)]);
  return membersForViewer(members, meFor(userId, seats), knowledge);
}

const projectIdOf = (payload: unknown): string[] => {
  const id = (payload as EventPayload | null)?.projectId;
  return typeof id === "string" ? [id] : [];
};

/** The company's seed as the pages see it. */
async function seedOf(companyId: string): Promise<Seed> {
  const row = await getDb().company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, seedJson: true, stage: true } });
  return companySeed(row);
}

/** The events of these cases and of the projects they opened or joined, in seq order; `shared` adds the idea.* and untargeted ones. */
async function eventsOf(companyId: string, caseIds: string[], seed: Seed, shared: boolean): Promise<{ rows: EventRow[]; projectIds: string[] }> {
  const db = getDb();
  const where = shared
    ? { companyId, OR: [{ targetId: { in: caseIds } }, { targetId: null }, { type: { startsWith: "idea." } }] }
    : { companyId, targetId: { in: caseIds } };
  const own: EventRow[] = await db.caseEvent.findMany({ where, orderBy: { seq: "asc" }, select: SELECT });
  const seedIds = (seed.projects ?? []).filter((p) => (p.sources ?? []).some((c) => caseIds.includes(c))).map((p) => p.id);
  const projectIds = [...new Set([...own.flatMap((r) => projectIdOf(r.payload)), ...seedIds])].filter((p) => !caseIds.includes(p));
  const more: EventRow[] = projectIds.length === 0 ? [] : await db.caseEvent.findMany({ where: { companyId, targetId: { in: projectIds } }, select: SELECT });
  const seen = new Set(own.map((r) => r.id));
  const rows = [...own, ...more.filter((r) => !seen.has(r.id))].sort((a, b) => a.seq - b.seq);
  return { rows: [...await relabelRows(companyId, rows)], projectIds };
}

/**
 * The log for one viewer (VIS/D8). A company without CaseView rows (not projected yet) gets the
 * full log, so nothing disappears before the first rebuild.
 */
export async function loadLogFor(companyId: string, viewer: LogViewer, now: Date = new Date()): Promise<ViewerLog> {
  const db = getDb();
  if ((await db.caseView.count({ where: { companyId } })) === 0) return { log: await loadLog(companyId, now), caseIds: null, projectIds: null };
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { stage: true, demoDay: true } });
  const cal = company.stage === "demo" ? null : await loadCalendar(companyId);
  const day = cal ? companyDay(company, cal, now) : company.demoDay;
  const keys = await keysOf(companyId, viewer);
  const caseIds = await visibleCaseIds(companyId, keys, { sinceDay: day - WINDOW_DAYS, limit: WINDOW_CASES });
  const { rows, projectIds } = await eventsOf(companyId, caseIds, await seedOf(companyId), true);
  return { log: logFromRows(rows, day), caseIds, projectIds };
}

/** The seed with only these cases and projects; everything else in it stays. */
export function seedForViewer(seed: Seed, caseIds: readonly string[], projectIds: readonly string[]): Seed {
  const cases = new Set(caseIds);
  const projects = new Set(projectIds);
  return {
    ...seed,
    cases: seed.cases.filter((c) => cases.has(c.id)),
    projects: seed.projects?.filter((p) => projects.has(p.id) || (p.sources ?? []).some((s) => cases.has(s))),
  };
}

export type LoadedCase = { events: EventRow[]; seedCase: SeedCase | null; seedProjects: SeedProject[] };

/** One case for a viewer who may open it (D9): its events (and its projects'), and its seed row; null when the viewer may not open it. */
export async function loadCaseFor(companyId: string, viewer: LogViewer, caseId: string): Promise<LoadedCase | null> {
  const row = await caseView(companyId, caseId);
  if (!row) return null;
  const mine = new Set(await keysOf(companyId, viewer));
  if (!row.accessKeys.some((k) => mine.has(k))) return null;
  const seed = await seedOf(companyId);
  const { rows, projectIds } = await eventsOf(companyId, [caseId], seed, false);
  return {
    events: rows,
    seedCase: seed.cases.find((c) => c.id === caseId) ?? null,
    seedProjects: (seed.projects ?? []).filter((p) => projectIds.includes(p.id)),
  };
}

/** May this viewer open this case? null when the case has no row (not projected), so the caller cannot tell. */
export async function mayOpen(companyId: string, viewer: LogViewer, caseId: string): Promise<boolean | null> {
  const row = await caseView(companyId, caseId);
  if (!row) return null;
  const mine = new Set(await keysOf(companyId, viewer));
  return row.accessKeys.some((k) => mine.has(k));
}
