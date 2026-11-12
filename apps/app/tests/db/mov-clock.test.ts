// MOV-D1 against a real Postgres: the clock writes MOV's day on its first run (D17), then the late, quiet and stalled facts of a
// started project as system:clock, each once however often it runs, and nothing for a step that fell due before that day.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { dateOfWorkday, workdayOf } from "@/features/clock/calendar";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { appendEventRow } from "@/lib/db/events";
import { ensureMovSinceDay, loadMovSinceDay } from "@/lib/db/rules";
import { writeStructure } from "@/lib/db/structure-writes";
import { runClockOnce } from "@/server/scheduler/clock";
import { peopleForSeats } from "./test-company";

const db = getDb();
const asked = new Date("2026-05-04T09:00:00Z"); // a Monday
const D0 = workdayOf(asked, DEFAULT_CALENDAR);
/** A moment on working day `day` of the default calendar. */
const on = (day: number) => new Date(`${dateOfWorkday(day, DEFAULT_CALENDAR)}T10:00:00Z`);
const STEP_DUE = D0 + 6;
const QUIET_DAY = D0 + 5; // the project started on D0 and nothing happened since
const A = "movc-a";
const B = "movc-b";
const ids: Record<string, { company: string; user: Record<string, string> }> = {};

async function company(slug: string, stepDue: number): Promise<void> {
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + `@${slug}.example`, role, dept: "", ini: "XX", handle: null });
  const c = await db.company.create({
    data: {
      slug, name: slug, stage: "sandbox", seedJson: toSeedJson(writes.seedJson) as object,
      users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member")] },
    },
  });
  await writeStructure(c.id, writes, "test");
  await peopleForSeats(c.id, slug);
  await bindDemoCompany(c.id);
  const user = Object.fromEntries((await db.user.findMany({ where: { companyId: c.id } })).map((u) => [u.name, u.id]));
  ids[slug] = { company: c.id, user };
  const route = (await companySeed({ id: c.id, seedJson: c.seedJson, stage: "sandbox" })).routes.find((r) => r.ownerSeatId)!;
  const append = async (e: Record<string, unknown>, actorUserId: string) => {
    const r = await appendEventRow(c.id, { day: 0, ...e } as never, { actorUserId, now: asked });
    if (!r.ok) throw new Error(r.error);
  };
  const hartmann = user["B. Hartmann"];
  const vogel = user["T. Vogel"];
  const schmidt = user["J. Schmidt"];
  // T. Vogel says yes and asks B. Hartmann to lead; B. Hartmann takes it, T. Vogel accepts the sponsor's seat, J. Schmidt owns a step.
  await append({ id: `${slug}-raised`, type: "case.raised", actor: "J. Schmidt", targetId: `${slug}-case`, payload: { kind: "idea", title: "Idea", routeId: route.id } }, schmidt);
  await append({ id: `${slug}-yes`, type: "case.decided", actor: "T. Vogel", targetId: `${slug}-case`, payload: { answer: "yes", projectId: "p_mov", lead: "B. Hartmann", leadUserId: hartmann, title: "Project", draft: true } }, vogel);
  await append({ id: `${slug}-take`, type: "project.lead.answered", actor: "B. Hartmann", targetId: "p_mov", payload: { take: true } }, hartmann);
  await append({ id: `${slug}-invite`, type: "project.invited", actor: "B. Hartmann", targetId: "p_mov", payload: { userId: vogel, role: "sponsor" } }, hartmann);
  await append({ id: `${slug}-accept`, type: "project.invite.answered", actor: "T. Vogel", targetId: "p_mov", payload: { userId: vogel, inviteId: `${slug}-invite`, take: true } }, vogel);
  await append({ id: `${slug}-base`, type: "project.baseline", actor: "B. Hartmann", targetId: "p_mov", payload: { metric: "Changeover", unit: "min", value: 42, better: "down", source: "MES" } }, hartmann);
  await append({ id: `${slug}-started`, type: "project.started", actor: "B. Hartmann", targetId: "p_mov", payload: {} }, hartmann);
  await append({ id: `${slug}-step`, type: "project.step.added", actor: "B. Hartmann", targetId: "p_mov", payload: { stepId: "s_one", text: "Measure the line", ownerUserId: schmidt, owner: "J. Schmidt", dueDay: stepDue } }, hartmann);
}

beforeAll(async () => {
  await db.company.deleteMany({});
  await company(A, STEP_DUE);
  await company(B, D0 + 1); // falls due before B's first run
  await ensureMovSinceDay(ids[A].company, 0); // A: MOV is live since before anything in the test; B has no row yet
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

const facts = (slug: string, kind: string) => db.caseEvent.findMany({ where: { companyId: ids[slug].company, type: "clock.due", targetId: "p_mov", payload: { path: ["kind"], equals: kind } }, orderBy: { seq: "asc" } });
const run = async (day: number) => { await runClockOnce(on(day)); await runClockOnce(on(day)); }; // each run twice: nothing is written twice

describe("MOV clock writes", () => {
  it("writes a late fact to the step's owner the day after it was due, with stepId and userId, as system:clock, once", async () => {
    await run(QUIET_DAY); // the first run: B's row is written here
    expect(await facts(A, "late")).toHaveLength(0);
    await run(STEP_DUE + 1);
    const late = await facts(A, "late");
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({ actor: "system:clock", source: "clock", payload: { kind: "late", dueDay: STEP_DUE, stepId: "s_one", userId: ids[A].user["J. Schmidt"] } });
    expect(late[0].idemKey).toBe(`clk:late:p_mov:${STEP_DUE}:s_one`);
  });

  it("writes one quiet fact to the lead on the quiet day and one stalled fact to the sponsor 3 working days later", async () => {
    const quiet = await facts(A, "quiet");
    expect(quiet).toHaveLength(1);
    expect(quiet[0]).toMatchObject({ actor: "system:clock", source: "clock", payload: { kind: "quiet", dueDay: QUIET_DAY, userId: ids[A].user["B. Hartmann"] } });
    expect(await facts(A, "stalled")).toHaveLength(0);
    await run(QUIET_DAY + 3);
    const stalled = await facts(A, "stalled");
    expect(stalled).toHaveLength(1);
    expect(stalled[0]).toMatchObject({ actor: "system:clock", source: "clock", payload: { kind: "stalled", dueDay: QUIET_DAY + 3, userId: ids[A].user["T. Vogel"] } });
    expect(await facts(A, "quiet")).toHaveLength(1);
    expect(await facts(A, "late")).toHaveLength(1);
  });

  it("the lead's second late fact comes 2 working days after the owner's, once", async () => {
    await run(STEP_DUE + 3);
    const late = await facts(A, "late");
    expect(late.map((r) => (r.payload as { check?: number; userId: string }).check)).toEqual([undefined, 2]);
    expect((late[1].payload as { userId: string }).userId).toBe(ids[A].user["B. Hartmann"]);
  });

  it("writes mov_since_day on a company's first run, never changes it, and a step that fell due before it gets no late fact", async () => {
    expect(await loadMovSinceDay(ids[A].company)).toBe(0);
    expect(await loadMovSinceDay(ids[B].company)).toBe(QUIET_DAY);
    await run(STEP_DUE + 3);
    expect(await loadMovSinceDay(ids[B].company)).toBe(QUIET_DAY);
    expect(await facts(B, "late")).toHaveLength(0);
    // nor a quiet fact for the days before that day: B's count starts from its own first run
    for (const q of await facts(B, "quiet")) expect((q.payload as { dueDay: number }).dueDay).toBeGreaterThanOrEqual(QUIET_DAY + 5);
  });
});
