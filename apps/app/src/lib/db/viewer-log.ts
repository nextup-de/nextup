// What leaves the server for one browser (VIS/D8, D9): the events of the cases the viewer may open
// inside the window, of the projects those cases opened or joined, every idea.* event and every event
// with no target. The reducer runs on this smaller log unchanged - an absent case is simply not there.
import { cache } from "react";
import type { Role } from "@/config/roles";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { EventLog, EventPayload } from "@/features/cases/events";
import { logFromRows, type EventRow } from "@/features/cases/persist";
import { reduce, type ReducedCase } from "@/features/cases/reducer";
import { canOpen, membersForViewer, unitsOf, viewerKeys, type VisMember } from "@/features/cases/visibility";
import type { ReducedProject } from "@/features/projects/types";
import { isOpenDraft, mayReadDraft } from "@/features/projects/views";
import { isPrivateIdea } from "@/features/cases/visibility";
import type { Seed, SeedCase } from "@/features/demo/types";
import type { SeedProject } from "@/features/projects/types";
import { loadCalendar } from "./calendar";
import { getDb } from "./client";
import { memo } from "./company-memo";
import { companySeed } from "./companies";
import { companyDay, loadLog } from "./events";
import { loadSeats as readSeats } from "./holders";
import { loadKnowledge as readKnowledge, loadMembers as readMembers } from "./knowledge";
import { caseView, visibleCaseIds } from "./projections/readers";
import { relabelRows } from "./pseudonymise";

/** The window of VIS/D9: open cases, and closed ones whose last day is within this many working days. */
export const WINDOW_DAYS = 90;
/** At most this many cases (the newest by lastDay) are shipped. */
export const WINDOW_CASES = 500;

const SELECT = { id: true, seq: true, day: true, ts: true, type: true, actor: true, actorUserId: true, targetId: true, payload: true } as const;

// One request asks for the seats, the knowledge and the members several times (the shell's log, its people
// without a seat, then the page's mayOpen); within one request they are read once. Outside a request, as in
// the tests, `cache` does not remember, so a write is seen at once.
const loadSeats = cache(readSeats);
const loadKnowledge = cache(readKnowledge);
const loadMembers = cache(readMembers);

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
function seedOf(companyId: string): Promise<Seed> {
  return memo("viewer-seed", companyId, async () => {
    const row = await getDb().company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, seedJson: true, stage: true } });
    return companySeed(row);
  });
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

/** What a viewer who may open a draft's case but not read the draft keeps of the draft's own events (D13): who leads it and when it should start. No reasons. */
const DRAFT_SUMMARY: Record<string, readonly string[]> = {
  "project.handed": ["to", "toUserId"],
  "project.lead.answered": ["take", "lapsed", "askId"],
  "project.start.moved": ["dueDay"],
};
/** ... and the raiser of the case, not on the draft, also keeps what the lead wrote down of the goal (D20). */
const RAISER_SUMMARY: Record<string, readonly string[]> = { ...DRAFT_SUMMARY, "project.goal": ["goal", "doneWhen", "doneBy", "brief"] };

const pick = (payload: unknown, keys: readonly string[]): EventPayload => {
  const from = (payload ?? {}) as Record<string, unknown>;
  return Object.fromEntries(keys.filter((k) => from[k] !== undefined).map((k) => [k, from[k]])) as EventPayload;
};

/**
 * The person who holds the seat a late draft was given to reads it like the people on it, while that escalation is live
 * (D15, D22): they keep, hand on or stop it, which they cannot do blind. By seat and user id, never by name.
 */
function holdsDraftEscalation(p: ReducedProject, viewer: LogViewer, seats: readonly SeatRow[]): boolean {
  const up = p.escalated;
  if (up === null || up.what !== "draft" || !up.live || up.toSeatId === null) return false;
  return seats.some((s) => s.id === up.toSeatId && s.userId === viewer.userId);
}

/**
 * The boundary of a draft (SET D13, D20): a viewer who may open the idea but is not on the draft does not receive the
 * draft's steps, invitations, comments or any other event of it, only the summary events above. The reducer then rebuilds
 * a draft that visibleProjectsFor hides and the case page describes as "being set up". Pure over the rows; the case
 * events themselves are untouched, so a project that has started, and every legacy project, passes unchanged.
 */
export async function cutDrafts(companyId: string, viewer: LogViewer, rows: EventRow[], seed: Seed, day: number): Promise<EventRow[]> {
  const drafts = new Set(rows.flatMap((r) => (r.type === "case.decided" && (r.payload as EventPayload | null)?.draft === true ? projectIdOf(r.payload) : [])));
  if (drafts.size === 0) return rows;
  const seats = await loadSeats(companyId);
  const state = reduce({ ...seed, seats }, logFromRows(rows, day));
  const cut = new Map<string, readonly string[]>();
  for (const p of state.projects) {
    if (!drafts.has(p.id) || !isOpenDraft(p)) continue;
    const cases = state.cases.filter((c) => p.sources.includes(c.id));
    if (mayReadDraft(p, viewer, cases.some(isPrivateIdea)) || holdsDraftEscalation(p, viewer, seats)) continue;
    cut.set(p.id, cases.some((c) => c.fromUserId === viewer.userId) ? Object.keys(RAISER_SUMMARY) : Object.keys(DRAFT_SUMMARY));
  }
  // The desk's line to the raiser (D23) is for the raiser and the people on the draft, not for everyone who may read the case.
  const noteHeld = (r: EventRow): boolean => {
    const pl = r.payload as EventPayload | null;
    if (r.type !== "case.decided" || pl?.draft !== true || pl.raiserNote === undefined) return true;
    const p = state.projects.find((x) => projectIdOf(r.payload).includes(x.id));
    const cases = state.cases.filter((c) => c.id === r.targetId);
    if (cases.some((c) => c.fromUserId === viewer.userId)) return true;
    return p !== undefined && (mayReadDraft(p, viewer, cases.some(isPrivateIdea)) || holdsDraftEscalation(p, viewer, seats));
  };
  const stripped = new Set(rows.filter((r) => !noteHeld(r)).map((r) => r.id));
  if (cut.size === 0 && stripped.size === 0) return rows;
  return rows.flatMap((r) => {
    if (stripped.has(r.id)) {
      const rest = Object.entries((r.payload ?? {}) as Record<string, unknown>).filter(([k]) => k !== "raiserNote");
      return [{ ...r, payload: Object.fromEntries(rest) as EventPayload }];
    }
    const keep = r.targetId === null ? undefined : cut.get(r.targetId);
    if (keep === undefined) return [r];
    if (!keep.includes(r.type)) return [];
    return [{ ...r, payload: pick(r.payload, (keep.includes("project.goal") ? RAISER_SUMMARY : DRAFT_SUMMARY)[r.type]) }];
  });
}

/**
 * The log for one viewer (VIS/D8). A company without CaseView rows (not projected yet) gets the
 * full log, so nothing disappears before the first rebuild. A caller that already holds the company seed passes it,
 * so the structure is not read twice in one request.
 */
export async function loadLogFor(companyId: string, viewer: LogViewer, now: Date = new Date(), seed?: Seed): Promise<ViewerLog> {
  const db = getDb();
  const [shipped, company, keys] = await Promise.all([
    db.caseView.count({ where: { companyId } }),
    memo("stage", companyId, () => db.company.findUniqueOrThrow({ where: { id: companyId }, select: { stage: true, demoDay: true } })),
    keysOf(companyId, viewer),
  ]);
  if (shipped === 0) return { log: await loadLog(companyId, now), caseIds: null, projectIds: null };
  const cal = company.stage === "demo" ? null : await loadCalendar(companyId);
  const day = cal ? companyDay(company, cal, now) : company.demoDay;
  const caseIds = await visibleCaseIds(companyId, keys, { sinceDay: day - WINDOW_DAYS, limit: WINDOW_CASES });
  const full = seed ?? (await seedOf(companyId));
  const { rows, projectIds } = await eventsOf(companyId, caseIds, full, true);
  return { log: logFromRows(await cutDrafts(companyId, viewer, rows, full, day), day), caseIds, projectIds };
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
  const company = await memo("stage", companyId, () => getDb().company.findUniqueOrThrow({ where: { id: companyId }, select: { stage: true, demoDay: true } }));
  const day = company.stage === "demo" ? company.demoDay : companyDay(company, await loadCalendar(companyId), new Date());
  return {
    events: await cutDrafts(companyId, viewer, rows, seed, day),
    seedCase: seed.cases.find((c) => c.id === caseId) ?? null,
    seedProjects: (seed.projects ?? []).filter((p) => projectIds.includes(p.id)),
  };
}

/** The rule itself for a caller holding the whole state, so it holds before the first projection too (no CaseView rows, Q3). */
export async function caseFilterFor(companyId: string, viewer: LogViewer, projects: ReducedProject[]): Promise<(c: ReducedCase) => boolean> {
  const [seats, knowledge, members] = await Promise.all([loadSeats(companyId), loadKnowledge(companyId), loadMembers(companyId)]);
  const me = meFor(viewer.userId, seats);
  const ctx = { seats, roles: knowledge.roles, projects, members };
  const who = { me, role: viewer.role, unitIds: unitsOf(me, ctx) };
  return (c) => canOpen(c, who, ctx);
}

/** May this viewer open this case? null when the case has no row (not projected), so the caller cannot tell. */
export async function mayOpen(companyId: string, viewer: LogViewer, caseId: string): Promise<boolean | null> {
  const row = await caseView(companyId, caseId);
  if (!row) return null;
  const mine = new Set(await keysOf(companyId, viewer));
  return row.accessKeys.some((k) => mine.has(k));
}
