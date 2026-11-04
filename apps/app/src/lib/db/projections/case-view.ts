// The CaseView read model (VIS/D5, D6): one row per case, with the access keys that open it.
// Built from the same reducer the pages use, so a row can never disagree with it; rebuildProjections
// recomputes every row (org changes, a new rule, a bug fix), projectCases keeps single rows current.
// Every query names the company at the top level.
import type { EventPayload } from "@/features/cases/events";
import { logFromRows } from "@/features/cases/persist";
import { reduce, type ReducedCase } from "@/features/cases/reducer";
import { accessKeys, type VisCtx } from "@/features/cases/visibility";
import { workdayOf } from "@/features/clock/calendar";
import { userByLabel, type DemoUser } from "@/features/demo/identity";
import type { Seed } from "@/features/demo/types";
import { loadCalendar } from "../calendar";
import { getDb } from "../client";
import { companySeed } from "../companies";
import { loadSeats } from "../holders";
import { loadKnowledge, loadMembers } from "../knowledge";

type Row = { id: string; seq: number; day: number; ts: Date; type: string; actor: string; actorUserId: string | null; targetId: string | null; payload: unknown };

const SELECT = { id: true, seq: true, day: true, ts: true, type: true, actor: true, actorUserId: true, targetId: true, payload: true } as const;
const CHUNK = 200;
/** The events that count as the desk's first answer: it asked, answered, handed over or decided. */
const ANSWER_TYPES = new Set(["case.asked", "case.answered", "case.handed", "case.decided"]);

type Base = { seed: Seed; ctx: VisCtx; day: number };

/** What every projection needs: the company's reduce seed, its seats and roles, and today. */
async function loadBase(companyId: string, now: Date): Promise<Base> {
  const db = getDb();
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, seedJson: true, stage: true, demoDay: true } });
  const [seed, seats, knowledge, cal] = await Promise.all([
    companySeed(company),
    loadSeats(companyId),
    loadKnowledge(companyId),
    company.stage === "demo" ? Promise.resolve(null) : loadCalendar(companyId),
  ]);
  const day = cal ? workdayOf(now, cal) : company.demoDay;
  const roles = knowledge.roles.map((r) => ({ id: r.id, orgUnitId: r.orgUnitId, reportsToId: r.reportsToId }));
  return { seed: { ...seed, seats }, ctx: { seats, roles, projects: [], members: await loadMembers(companyId) }, day };
}

export type CaseViewData = {
  kind: string; status: string; open: boolean; routeId: string | null; assigneeSeatId: string | null; assigneeRoleId: string | null;
  escalatedRoleId: string | null; fromUserId: string | null; dueDay: number; firstAnswerDay: number | null; lastDay: number; lastSeq: number; accessKeys: string[];
};

/** The day of the last thing that happened to the case (its raising when nothing else did). */
export function lastDayOf(c: ReducedCase): number {
  return c.history.reduce((m, e) => Math.max(m, e.day | 0), c.raisedDay);
}

/** The day of the first answer, question, hand-over or decision, or null while none. */
export function firstAnswerDayOf(c: ReducedCase): number | null {
  const e = c.history.find((x) => ANSWER_TYPES.has(x.type));
  return e ? e.day | 0 : null;
}

/** One case as its row. */
export function rowOf(c: ReducedCase, ctx: VisCtx, lastSeq: number): CaseViewData {
  return {
    kind: c.kind, status: c.status, open: c.open, routeId: c.routeId, assigneeSeatId: c.assigneeSeatId, assigneeRoleId: c.assigneeRoleId,
    escalatedRoleId: c.escalated?.toRoleId ?? null, fromUserId: c.fromUserId, dueDay: c.dueDay, firstAnswerDay: firstAnswerDayOf(c),
    lastDay: lastDayOf(c), lastSeq, accessKeys: accessKeys(c, ctx),
  };
}

async function writeRows(companyId: string, rows: { caseId: string; data: CaseViewData }[]): Promise<void> {
  const db = getDb();
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.$transaction(
      rows.slice(i, i + CHUNK).map(({ caseId, data }) =>
        db.caseView.upsert({ where: { companyId_caseId: { companyId, caseId } }, create: { companyId, caseId, ...data }, update: data }),
      ),
    );
  }
}

async function lastSeqs(companyId: string, caseIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (caseIds.length === 0) return out;
  const groups = await getDb().caseEvent.groupBy({ by: ["targetId"], where: { companyId, targetId: { in: caseIds } }, _max: { seq: true } });
  for (const g of groups) if (g.targetId !== null && g._max.seq !== null) out.set(g.targetId, g._max.seq);
  return out;
}

const projectIdOf = (r: Row): string[] => {
  const id = (r.payload as EventPayload | null)?.projectId;
  return typeof id === "string" ? [id] : [];
};

/**
 * Bring the rows of these cases up to date: reduce the company's seed with only their events (and the
 * events of the projects they opened or joined, and the null-target ones), then upsert each row.
 * A project id stands for the cases that opened or joined it. An id that is no case gets no row.
 */
export async function projectCases(companyId: string, caseIds: string[], now: Date = new Date()): Promise<void> {
  const ids = [...new Set(caseIds)];
  if (ids.length === 0) return;
  const db = getDb();
  const base = await loadBase(companyId, now);

  // A project id in the list means the cases that opened or joined it.
  const joined = await db.caseEvent.findMany({
    where: { companyId, type: "case.decided", OR: ids.map((id) => ({ payload: { path: ["projectId"], equals: id } })) },
    select: { targetId: true },
  });
  const seedSources = (base.seed.projects ?? []).filter((p) => ids.includes(p.id)).flatMap((p) => p.sources ?? []);
  const targets = [...new Set([...ids, ...joined.flatMap((j) => (j.targetId === null ? [] : [j.targetId])), ...seedSources])];

  const own: Row[] = await db.caseEvent.findMany({ where: { companyId, OR: [{ targetId: { in: targets } }, { targetId: null }] }, orderBy: { seq: "asc" }, select: SELECT });
  const projectIds = [...new Set(own.flatMap(projectIdOf))].filter((p) => !targets.includes(p));
  const more: Row[] = projectIds.length === 0 ? [] : await db.caseEvent.findMany({ where: { companyId, targetId: { in: projectIds } }, select: SELECT });
  const rows = [...own, ...more].sort((a, b) => a.seq - b.seq);

  const state = reduce(base.seed, logFromRows(rows, base.day));
  const ctx: VisCtx = { ...base.ctx, projects: state.projects };
  const wanted = new Set(targets);
  const mine = state.cases.filter((c) => wanted.has(c.id));
  const seqs = await lastSeqs(companyId, mine.map((c) => c.id));
  await writeRows(companyId, mine.map((c) => ({ caseId: c.id, data: rowOf(c, ctx, seqs.get(c.id) ?? 0) })));
}

/** Old custom raises carry the audience as labels only; give them user ids once (VIS/D10, the IDN rule). */
async function backfillAudience(companyId: string, rows: Row[]): Promise<void> {
  const db = getDb();
  const users: DemoUser[] = await db.user.findMany({ where: { companyId }, select: { id: true, name: true, handle: true } });
  for (const r of rows) {
    if (r.type !== "case.raised") continue;
    const p = r.payload as EventPayload | null;
    if (!p || p.visibility !== "custom" || p.seenByUserIds !== undefined || !Array.isArray(p.seenBy)) continue;
    const found = p.seenBy.flatMap((label) => { const id = userByLabel(users, label); return id === null ? [] : [id]; });
    if (found.length === 0) continue;
    const payload = { ...p, seenByUserIds: [...new Set(found)] };
    await db.caseEvent.update({ where: { id: r.id, companyId }, data: { payload: payload as object } });
    r.payload = payload;
  }
}

/** Rebuild every row of the company from its seed and log; rows of cases that are gone are dropped. Returns the case count. */
export async function rebuildProjections(companyId: string, now: Date = new Date()): Promise<number> {
  const db = getDb();
  const base = await loadBase(companyId, now);
  const rows: Row[] = await db.caseEvent.findMany({ where: { companyId }, orderBy: { seq: "asc" }, select: SELECT });
  await backfillAudience(companyId, rows);
  const state = reduce(base.seed, logFromRows(rows, base.day));
  const ctx: VisCtx = { ...base.ctx, projects: state.projects };
  const seqs = new Map<string, number>();
  for (const r of rows) if (r.targetId !== null) seqs.set(r.targetId, r.seq);
  await writeRows(companyId, state.cases.map((c) => ({ caseId: c.id, data: rowOf(c, ctx, seqs.get(c.id) ?? 0) })));
  await db.caseView.deleteMany({ where: { companyId, caseId: { notIn: state.cases.map((c) => c.id) } } });
  return state.cases.length;
}
