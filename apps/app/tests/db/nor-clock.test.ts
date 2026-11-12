// NOR-D1 (B2): the clock writes what a not-now, a second look and a discussion bring, once each, against a real Postgres
// (plan NOR, D12, D14, D18), through the real reducer (NOR-A1).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { dateOfWorkday, workdayOf } from "@/features/clock/calendar";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { appendEventRow } from "@/lib/db/events";
import { runClockOnce } from "@/server/scheduler/clock";
import { company, now } from "./clk-company";

const db = getDb();
const TODAY = workdayOf(now, DEFAULT_CALENDAR);
/** 09:00 Berlin on working day `day`. */
const at = (day: number): Date => new Date(`${dateOfWorkday(day, DEFAULT_CALENDAR)}T09:00:00+02:00`);
let box: { id: string; seedJson: unknown };
let routeId: string;
let seedPromise: number;

const write = (id: string, type: string, target: string, payload: object, day: number, actor = "T. Vogel") =>
  appendEventRow(box.id, { id, day: 0, type, actor, targetId: target, payload } as never, { now: at(day) });
const rows = (target: string, type: string) => db.caseEvent.findMany({ where: { companyId: box.id, type, targetId: target }, orderBy: { seq: "asc" } });
/** Two runs of the clock at `when`: the first writes, the second never writes the same again. */
async function runTwice(when: Date) {
  await runClockOnce(when);
  await runClockOnce(when);
}

beforeAll(async () => {
  await db.company.deleteMany({});
  box = await company("nor-box", "sandbox");
  const seed = await companySeed({ id: box.id, seedJson: box.seedJson, stage: "sandbox" });
  routeId = seed.routes.find((r) => r.ownerSeatId)!.id;
  seedPromise = seed.promiseDays;
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("NOR clock writes", () => {
  it("a not-now comes back on its day: one case.reopened with why revisit and a new date, as the clock, when run twice", async () => {
    await write("nor-rev-raised", "case.raised", "nor-rev", { title: "Later", routeId }, TODAY - 6, "J. Schmidt");
    await write("nor-rev-no", "case.decided", "nor-rev", { answer: "no", category: "not-now", reason: "Not this quarter", revisitDay: TODAY }, TODAY - 5);
    await runClockOnce(at(TODAY - 1));
    expect(await rows("nor-rev", "case.reopened")).toHaveLength(0);
    await runTwice(now);
    const reopened = await rows("nor-rev", "case.reopened");
    expect(reopened).toHaveLength(1);
    expect(reopened[0]).toMatchObject({ actor: "system:clock", actorUserId: null, source: "clock" });
    expect(reopened[0].payload).toMatchObject({ why: "revisit", dueDay: TODAY + seedPromise });
    expect((reopened[0].payload as { toRoleHolderId?: string | null }).toRoleHolderId).toBeTruthy();
    expect(reopened[0].idemKey).toMatch(/^clk:revisit:nor-rev:\d+:0$/);
    // The reopened case is open on the desk again: no second reopen however often the clock runs later.
    await runTwice(at(TODAY + 2));
    expect(await rows("nor-rev", "case.reopened")).toHaveLength(1);
  });

  it("a second look nobody answered is chased: one appeal fact on the answer date, one with check 2 escalation_days later", async () => {
    await write("nor-app-raised", "case.raised", "nor-app", { title: "Again", routeId }, TODAY - 9, "J. Schmidt");
    await write("nor-app-no", "case.decided", "nor-app", { answer: "no", category: "no-fit", reason: "Not our scope" }, TODAY - 6);
    await write("nor-app-appeal", "case.appealed", "nor-app", { text: "Please look again, the facts changed.", toRoleHolderId: null }, TODAY - 5, "J. Schmidt");
    await runTwice(now); // the appeal was asked 5 working days ago: due today
    const first = await rows("nor-app", "clock.due");
    expect(first.filter((r) => (r.payload as { kind?: string }).kind === "appeal")).toHaveLength(1);
    expect(first[0].payload).toMatchObject({ kind: "appeal", dueDay: TODAY });
    await runTwice(at(TODAY + 3)); // escalation_days (3) later
    const all = (await rows("nor-app", "clock.due")).filter((r) => (r.payload as { kind?: string }).kind === "appeal");
    expect(all.map((r) => (r.payload as { check?: number }).check ?? 1)).toEqual([1, 2]);
  });

  it("an invitee's view is due by the next check-in: one view fact the working day before it, once", async () => {
    // A discussion started two working days ago has its check-in tomorrow (discuss_every_days is 3).
    await write("nor-view-raised", "case.raised", "nor-view", { title: "Talk", routeId }, TODAY - 3, "J. Schmidt");
    await write("nor-view-disc", "case.discussion", "nor-view", { invited: ["N. Invitee"], invitedUserIds: ["u_nor_invitee"], missing: "A view" }, TODAY - 2);
    await runClockOnce(at(TODAY - 2));
    expect(await rows("nor-view", "clock.due")).toHaveLength(0);
    await runTwice(now);
    const view = (await rows("nor-view", "clock.due")).filter((r) => (r.payload as { kind?: string }).kind === "view");
    expect(view).toHaveLength(1);
    expect(view[0]).toMatchObject({ actor: "system:clock", actorUserId: null, source: "clock", idemKey: `clk:view:nor-view:${TODAY + 1}` });
    expect(view[0].payload).toMatchObject({ kind: "view", dueDay: TODAY + 1 });
  });
});
