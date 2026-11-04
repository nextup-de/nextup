// Bulk case history for the VIS acceptance (VIS-Z1, D13): cases and events written straight with
// createMany, then the projections rebuilt. Lives under tests/, never in prisma/seed.ts. Deterministic:
// the same company and options give the same rows (a seeded generator, no Math.random, no clock but `now`).
import type { EventPayload, CaseEventType, Visibility } from "../../../../src/features/cases/events";
import { workdayOf } from "../../../../src/features/clock/calendar";
import { getDb } from "../../../../src/lib/db/client";
import { loadCalendar } from "../../../../src/lib/db/calendar";
import { rebuildProjections } from "../../../../src/lib/db/projections/case-view";

export type BulkOptions = { cases: number; eventsPerCase: number; now: Date };
export type BulkPerson = { userId: string; name: string };
export type BulkSeat = { id: string; userId: string | null };
export type BulkRow = {
  id: string; companyId: string; ts: Date; day: number; type: CaseEventType; actor: string; actorUserId: string | null;
  targetId: string; payload: EventPayload; source: string;
};

const YEAR_WORKDAYS = 260;
const DAY_MS = 86_400_000;
const BATCH = 5_000;

/** mulberry32: a small seeded generator, so a run is repeatable. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

/** The rows of the bulk, pure: no database. `today` is the company's current workday. */
export function buildBulk(companyId: string, people: readonly BulkPerson[], seats: readonly BulkSeat[], today: number, o: BulkOptions): BulkRow[] {
  if (people.length === 0 || seats.length === 0) throw new Error("bulk needs at least one user and one seat");
  const r = rng(20261102);
  const visibilities: (Visibility | null)[] = [null, null, "everyone", "private", "custom"];
  const rows: BulkRow[] = [];
  for (let i = 0; i < o.cases; i++) {
    const id = `bulk-${companyId}-c${i}`;
    const raiser = pick(r, people);
    const desk = pick(r, seats);
    const visibility = pick(r, visibilities);
    const raisedDay = today - Math.floor((i * YEAR_WORKDAYS) / o.cases);
    const audience = visibility === "custom" ? [pick(r, people).userId, pick(r, people).userId] : undefined;
    const types: CaseEventType[] = ["case.raised"];
    for (let j = 1; j < o.eventsPerCase; j++) types.push(j % 2 === 1 ? "case.asked" : "case.answered");
    // Two of three cases end decided (closed); the third stays open.
    if (o.eventsPerCase > 2 && i % 3 !== 0) types[types.length - 1] = "case.decided";
    types.forEach((type, j) => {
      const day = Math.min(today, raisedDay + j);
      const payload: EventPayload =
        type === "case.raised"
          ? { title: `Bulk case ${i} ${raiser.name}`, body: `Bulk body ${i}`, assigneeRoleHolderId: desk.id, assignee: "Desk", fromDept: "Bulk", kind: "problem", ...(visibility ? { visibility } : {}), ...(audience ? { seenByUserIds: audience } : {}) }
          : type === "case.decided" ? { answer: "no", reason: "bulk" } : { text: `Bulk ${type} ${i}.${j}` };
      const byDesk = type === "case.asked" || type === "case.decided";
      const who = byDesk && desk.userId ? (people.find((p) => p.userId === desk.userId) ?? raiser) : raiser;
      rows.push({
        id: `bulk-${companyId}-e${i}-${j}`, companyId, ts: new Date(o.now.getTime() - (today - day) * DAY_MS * (7 / 5)), day, type,
        actor: who.name, actorUserId: who.userId, targetId: id, payload, source: "app",
      });
    });
  }
  return rows;
}

/** Write the bulk into a company and rebuild its projections; returns the number of events written. */
export async function seedBulk(companyId: string, o: BulkOptions): Promise<number> {
  const db = getDb();
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { stage: true, demoDay: true } });
  const today = company.stage === "demo" ? company.demoDay : workdayOf(o.now, await loadCalendar(companyId));
  const [users, seats] = await Promise.all([
    db.user.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { id: "asc" } }),
    db.orgRoleHolder.findMany({ where: { companyId }, select: { id: true, userId: true }, orderBy: { id: "asc" } }),
  ]);
  const rows = buildBulk(companyId, users.map((u) => ({ userId: u.id, name: u.name })), seats, today, o);
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.caseEvent.createMany({ data: rows.slice(i, i + BATCH).map((x) => ({ ...x, payload: x.payload as object })), skipDuplicates: true });
  }
  await rebuildProjections(companyId, o.now);
  return rows.length;
}
