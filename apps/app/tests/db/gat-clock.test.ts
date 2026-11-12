// The clock scheduler against a real Postgres for review and approvals (plan GAT, D14, D23; GAT-C1): the forward of an unreviewed raise and the hand-over of
// a late approval step are written once, as the clock, and a review waits while the raiser is asked. Models tests/db/clk-scheduler-case.test.ts.
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { workdayOf } from "@/features/clock/calendar";
import { getDb } from "@/lib/db/client";
import { loadCalendar } from "@/lib/db/calendar";
import { companySeed } from "@/lib/db/companies";
import { appendEventRow } from "@/lib/db/events";
import { runClockOnce } from "@/server/scheduler/clock";
import { company, earlier, now } from "./clk-company";

const SLUG = "gat-clock";
const db = getDb();
const tomorrow = new Date(now.getTime() + 86_400_000);
const yesterday = new Date(now.getTime() - 86_400_000);
let box: { id: string };
let day: (d: Date) => number;
let ctx: { routeId: string; ownerSeat: string; ownerRole: string; reviewSeat: string; raiser: string; raiserName: string; finRole: string; bossSeat: string; bossRole: string; deciderId: string };

const send = (id: string, type: string, target: string, payload: Record<string, unknown>, by: { userId: string; name: string }, at: Date) =>
  appendEventRow(box.id, { id, day: 0, type, actor: by.name, targetId: target, payload } as never, { actorUserId: by.userId, now: at });
const rows = (target: string, type: string) => db.caseEvent.findMany({ where: { companyId: box.id, type, targetId: target }, orderBy: { seq: "asc" } });
const approvalFacts = async (target: string) => (await rows(target, "clock.due")).filter((r) => (r.payload as { kind?: string }).kind === "approval");

beforeAll(async () => {
  await db.company.deleteMany({});
  box = await company(SLUG, "sandbox");
  day = (d) => workdayOf(d, cal);
  const cal = await loadCalendar(box.id);
  const row = await db.company.findUniqueOrThrow({ where: { id: box.id } });
  const seed = await companySeed({ id: row.id, seedJson: row.seedJson, stage: row.stage });
  const route = seed.routes.find((r) => r.ownerSeatId && seed.seats.some((s) => s.id === r.ownerSeatId && s.userId))!;
  const seatOf = (roleId: string | null | undefined) => seed.seats.find((s) => s.roleId === roleId && s.userId !== null);
  // A role that reports to a role with someone on it: its steps go there when late (D23).
  const fin = seed.roles!.find((r) => r.id !== route.ownerRoleId && r.reportsToId && seatOf(r.id) && seatOf(r.reportsToId))!;
  const review = seed.seats.find((s) => s.userId !== null && s.roleId !== route.ownerRoleId)!;
  const raiser = await db.user.findFirstOrThrow({ where: { companyId: box.id, name: "J. Schmidt" }, select: { id: true, name: true } });
  const deciderSeat = seatOf(route.ownerRoleId)!;
  ctx = {
    routeId: route.id, ownerSeat: route.ownerSeatId!, ownerRole: route.ownerRoleId!, reviewSeat: review.id, raiser: raiser.id, raiserName: raiser.name, finRole: fin.id,
    bossSeat: seatOf(fin.reportsToId)!.id, bossRole: fin.reportsToId!, deciderId: deciderSeat.userId!,
  };
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

/** A raise the review seat holds: the server's stamp is review true and the review's due day two working days after the raise (D14). */
const raiseForReview = (id: string, at: Date) =>
  send(`${id}-raised`, "case.raised", id, { title: `Review ${id}`, routeId: ctx.routeId, assigneeRoleHolderId: ctx.reviewSeat, review: true, reviewDueDay: day(at) + 2 }, { userId: ctx.raiser, name: ctx.raiserName }, at);

it("GAT scheduler forwards an unreviewed case once", async () => {
  await raiseForReview("gat-forward", earlier);
  const first = await runClockOnce(now);
  expect(first.find((r) => r.slug === SLUG)!.written).toBeGreaterThan(0);
  const forwarded = await rows("gat-forward", "case.reviewed");
  expect(forwarded).toHaveLength(1);
  expect(forwarded[0]).toMatchObject({ actor: "system:clock", actorUserId: null, source: "clock" });
  expect(forwarded[0].payload).toMatchObject({ outcome: "forward", routeId: ctx.routeId, auto: true });
  // The route owner's seat: the first occupied seat of the owner's role.
  const seat = (forwarded[0].payload as { toRoleHolderId: string }).toRoleHolderId;
  const seed = await companySeed({ id: box.id, seedJson: (await db.company.findUniqueOrThrow({ where: { id: box.id } })).seedJson, stage: "sandbox" });
  expect(seed.seats.find((s) => s.id === seat)?.roleId).toBe(ctx.ownerRole);
  // The review seat was reminded once too (a fact), and a second run writes no second forward and no second reminder.
  const reminders = (await rows("gat-forward", "clock.due")).filter((r) => (r.payload as { kind?: string }).kind === "review");
  expect(reminders).toHaveLength(1);
  expect(reminders[0].payload).toMatchObject({ kind: "review", check: 1, originEventId: "review:gat-forward" });
  await runClockOnce(now);
  expect(await rows("gat-forward", "case.reviewed")).toHaveLength(1);
  expect((await rows("gat-forward", "clock.due")).filter((r) => (r.payload as { kind?: string }).kind === "review")).toHaveLength(1);
});

it("GAT scheduler waits for the raisers answer before forwarding", async () => {
  // Raised ten working days ago, so the review's due day is long past; the review seat asks the raiser yesterday and nobody answers yet.
  await raiseForReview("gat-asked", earlier);
  await send("gat-asked-q", "case.asked", "gat-asked", { text: "Which line?" }, { userId: ctx.deciderId, name: "Review seat" }, yesterday);
  await runClockOnce(now);
  expect(await rows("gat-asked", "case.reviewed")).toEqual([]);
  // The raiser answers today: the forward is due the working day after the answer, not before.
  await send("gat-asked-a", "case.answered", "gat-asked", { text: "Line 3" }, { userId: ctx.raiser, name: ctx.raiserName }, now);
  await runClockOnce(now);
  expect(await rows("gat-asked", "case.reviewed")).toEqual([]);
  await runClockOnce(tomorrow);
  const forwarded = await rows("gat-asked", "case.reviewed");
  expect(forwarded).toHaveLength(1);
  expect(forwarded[0]).toMatchObject({ actor: "system:clock", source: "clock" });
  await runClockOnce(tomorrow);
  expect(await rows("gat-asked", "case.reviewed")).toHaveLength(1);
});

it("GAT scheduler hands a late approval step over once", async () => {
  // A case on its desk said a provisional yes ten working days ago: one role step, due three working days after.
  const target = "gat-approval";
  await send(`${target}-raised`, "case.raised", target, { title: "Needs approval", routeId: ctx.routeId, assigneeRoleHolderId: ctx.ownerSeat }, { userId: ctx.raiser, name: ctx.raiserName }, earlier);
  const dueDay = day(earlier) + 3;
  await send("gat-approval-prov", "case.provisional", target, {
    approvals: [{ kind: "role", roleId: ctx.finRole }], stepDueDay: dueDay, decidingRoleId: ctx.ownerRole, costEur: 9000, projectId: "gat-p-approval", title: "Needs approval", draft: true,
  } as Prisma.JsonObject, { userId: ctx.deciderId, name: "Decider" }, earlier);
  await runClockOnce(now);
  const facts = await approvalFacts(target);
  // The step's holders are reminded (check 1) and, escalation_days later, the step goes to the seat above its role (check 2): one fact each.
  expect(facts.map((f) => (f.payload as { check: number }).check).sort()).toEqual([1, 2]);
  const handed = facts.find((f) => (f.payload as { check: number }).check === 2)!;
  expect(handed).toMatchObject({ actor: "system:clock", source: "clock" });
  expect(handed.payload).toMatchObject({ kind: "approval", originEventId: "gat-approval-prov", stepId: "gat-approval-prov:0@0", toRoleHolderId: ctx.bossSeat });
  expect(handed.idemKey).toBe(`clk:approval:${target}:${(handed.payload as { dueDay: number }).dueDay}:2:gat-approval-prov:0@0`);
  // A second run writes nothing more: the reminder is stored, and the step is handed to the seat the fact names.
  await runClockOnce(now);
  await runClockOnce(tomorrow);
  expect(await approvalFacts(target)).toHaveLength(2);
});
