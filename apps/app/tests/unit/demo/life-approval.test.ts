// Musterwerk's working day on the way from idea to project of 16 Nov 2026 (features/demo/life/approval.ts, draft.ts): the desk's yes asks one to three
// named approvers, they answer on later days, one no returns the idea to its raiser who sends it again or takes it back, only the last yes opens the
// draft, and the draft is set up by its lead before it starts. Sixty working days played through the reducer, every event checked against the rights
// the app checks when a person writes it.
import { describe, expect, it } from "vitest";
import { mayAnswerStep } from "@/features/approvals/rights";
import { ideaApprovalStatus } from "@/features/approvals/status";
import { APPROVER_REMIND_DAYS, type ApprovalStepInput } from "@/features/approvals/types";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { Role } from "@/config/roles";
import type { CaseEvent, EventLog } from "@/features/cases/events";
import { mayAppend } from "@/features/cases/permissions";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR, type ClockSpec } from "@/features/clock";
import { approvalDues } from "@/features/clock/kinds/approval";
import { LOCAL_SEED } from "@/features/demo";
import { lifeDay, type LifeEvent, type LifePerson, type LifeRoute } from "@/features/demo/life/plan";

const PROMISE = 5;
const KEYS = ["maintenance", "quality", "safety", "process"];
const owners: LifePerson[] = KEYS.map((k, i) => ({ id: `u_o${i}`, name: `Owner ${k}`, dept: k, role: "leader" }));
const members: LifePerson[] = Array.from({ length: 12 }, (_, i) => ({ id: `u_m${i}`, name: `Member ${i}`, dept: KEYS[i % KEYS.length], role: "member" }));
// The plant manager every desk reports to, like Kevin Schmid on Musterwerk's Werkleiter desk.
const plant: LifePerson = { id: "u_plant", name: "Werkleiter", dept: "plant", role: "leader" };
const people = [...owners, plant, ...members];
const routes: LifeRoute[] = KEYS.map((key, i) => ({ key, holderId: `seat_${i}`, owner: owners[i] }));
const SEATS: SeatRow[] = [
  ...KEYS.map((_, i) => ({ id: `seat_${i}`, roleId: `role_${i}`, label: owners[i].name, userId: owners[i].id, sort: i })),
  { id: "seat_plant", roleId: "role_plant", label: plant.name, userId: plant.id, sort: 9 },
];
const template = LOCAL_SEED.routes[0];
const SEED: ReduceSeed = {
  cases: [], ideas: [], problems: [], promiseDays: PROMISE,
  routes: KEYS.map((key, i) => ({ ...template, id: key, owner: { name: owners[i].name, role: "Leiter", dept: key }, ownerSeatId: `seat_${i}`, ownerRoleId: `role_${i}`, deputySeatId: null, deputyRoleId: null })),
  seats: SEATS,
  roles: [
    { id: "role_plant", orgUnitId: "plant", reportsToId: null, title: "Werkleiter" },
    ...KEYS.map((key, i) => ({ id: `role_${i}`, orgUnitId: key, reportsToId: "role_plant", title: `Leiter ${key}` })),
  ],
  clock: { mode: "workdays", calendar: DEFAULT_CALENDAR } as ClockSpec,
};
const isoOf = (day: number) => new Date(Date.UTC(2026, 0, 1) + day * 86_400_000).toISOString().slice(0, 10);
const toEvent = (e: LifeEvent, day: number): CaseEvent => ({ id: e.id, ts: 0, day, type: e.type, actor: e.actor, actorUserId: e.actorUserId, target: e.targetId, payload: e.payload }) as CaseEvent;

// Julia Rossi (a member) and the plant manager are the demo accounts; the safety desk is a real person's. All three acted in the app.
const FOCUS = new Set([plant.id, members[1].id]);
const REAL = owners[2].id;
const HUMANS = new Set([...FOCUS, REAL]);

type Day = { day: number; before: State; events: LifeEvent[] };
/** Play `days` working days; returns each day's state before its events, the events, and the final log. */
function play(days: number): { days: Day[]; log: CaseEvent[]; state: State } {
  const log: CaseEvent[] = [];
  const out: Day[] = [];
  for (let day = 1; day <= days; day++) {
    const before = reduce(SEED, { events: log, day } as EventLog);
    const events = lifeDay({ slug: "mw", iso: isoOf(day), today: day, state: before, promiseDays: PROMISE, routes, people, humans: HUMANS, focus: FOCUS });
    out.push({ day, before, events });
    log.push(...events.map((e) => toEvent(e, day)));
  }
  return { days: out, log, state: reduce(SEED, { events: log, day: days } as EventLog) };
}
const DAYS = 60;
const run = play(DAYS);
const written = run.days.flatMap((d) => d.events.map((e) => ({ ...e, day: d.day })));
const ofType = (type: string) => written.filter((e) => e.type === type);
const actor = (userId: string) => {
  const p = people.find((x) => x.id === userId)!;
  return { role: p.role as Role, userId, me: meFor(userId, SEATS), name: p.name, handle: null };
};

describe("Musterwerk's ideas on the way to a project", () => {
  it("asks one to three named approvers with the desk's yes, never the desk, the raiser or a real person", () => {
    const asks = ofType("case.provisional").filter((e) => e.payload.resend !== true);
    expect(asks.length).toBeGreaterThan(10);
    for (const e of asks) {
      const steps = e.payload.approvals as ApprovalStepInput[];
      const kase = run.state.cases.find((c) => c.id === e.targetId)!;
      expect(steps.length).toBeGreaterThanOrEqual(1);
      expect(steps.length).toBeLessThanOrEqual(3);
      expect(e.payload).toMatchObject({ parallel: true, draft: true, stepDueDay: e.day + APPROVER_REMIND_DAYS, leadUserId: expect.any(String) });
      for (const s of steps) {
        expect(s.userId).toBeDefined();
        expect([e.actorUserId, kase.fromUserId, REAL]).not.toContain(s.userId);
      }
    }
    // Heads of other units and the plant manager are asked, in runs of different sizes.
    expect(new Set(asks.map((e) => (e.payload.approvals as ApprovalStepInput[]).length))).toEqual(new Set([1, 2, 3]));
    expect(asks.some((e) => (e.payload.approvals as ApprovalStepInput[]).some((s) => s.userId === plant.id))).toBe(true);
    // A desk's yes never decides an idea of the catalogue directly any more: only the settle operation does, after the last yes.
    expect(ofType("case.decided").filter((e) => e.payload.answer === "yes" && e.payload.projectId !== undefined).every((e) => e.actor === "system:approvals" && e.actorUserId === null)).toBe(true);
  });

  it("writes only what the person it is written as may write, and never writes as a real person or a demo account", () => {
    expect(written.filter((e) => e.actorUserId !== null && HUMANS.has(e.actorUserId))).toEqual([]);
    const log: CaseEvent[] = [];
    for (const d of run.days) {
      for (const e of d.events) {
        const state = reduce(SEED, { events: log, day: d.day } as EventLog);
        const check = `${e.type} ${e.idemKey}`;
        if (e.type === "case.approval") {
          const kase = state.cases.find((c) => c.id === e.targetId)!;
          expect(mayAnswerStep(actor(e.actorUserId!), kase, state, { runId: e.payload.runId!, stepId: e.payload.stepId!, dueRev: e.payload.dueRev! }), check).toBe(true);
        } else if (e.actorUserId === null) {
          // The settle operation: only once every approver of the run said yes.
          const kase = state.cases.find((c) => c.id === e.targetId)!;
          expect(kase.approvals?.steps.every((s) => s.state === "yes" || s.state === "conditions"), check).toBe(true);
        } else if (e.type !== "case.raised") {
          expect(mayAppend(actor(e.actorUserId), { type: e.type, target: e.targetId, payload: e.payload }, state), check).toEqual({ ok: true });
        }
        log.push(toEvent(e, d.day));
      }
    }
  });

  it("opens the draft only with the last yes, and its lead sets it up before it starts", () => {
    const settles = ofType("case.decided").filter((e) => e.actor === "system:approvals");
    expect(settles.length).toBeGreaterThan(5);
    for (const e of settles) {
      const p = run.state.projects.find((x) => x.id === e.payload.projectId)!;
      expect(p.draft).toBe(true);
      expect(p.openedDay).toBe(e.day);
    }
    const started = run.state.projects.filter((p) => p.draft && p.startedDay !== null);
    expect(started.length).toBeGreaterThan(5);
    for (const p of started) {
      expect(p.leadState).toBe("taken");
      expect(p.goal).not.toBeNull();
      expect(p.baseline).not.toBeNull();
      expect(p.invites.length + p.memberUserIds.length).toBeGreaterThan(0);
      expect(p.startedDay! - p.openedDay).toBeGreaterThanOrEqual(3); // set up over several working days, not at once
    }
    // A lead other than the desk takes it first; a sponsor confirms the number baseline (a reward is possible by default).
    expect(ofType("project.lead.answered").length).toBeGreaterThan(3);
    expect(ofType("project.baseline.confirmed").length).toBeGreaterThan(3);
    expect(started.some((p) => p.sponsorUserId !== null)).toBe(true);
  });

  it("sends some ideas back with a reason; their raisers send them again to the same approvers or take them back", () => {
    const noes = ofType("case.approval").filter((e) => e.payload.approvalAnswer === "no");
    expect(noes.length).toBeGreaterThan(2);
    for (const e of noes) expect((e.payload.reason as string).length).toBeGreaterThanOrEqual(8);
    const resends = ofType("case.provisional").filter((e) => e.payload.resend === true);
    expect(resends.length).toBeGreaterThan(0);
    for (const e of resends) {
      const kase = run.state.cases.find((c) => c.id === e.targetId)!;
      expect(e.actorUserId).toBe(kase.fromUserId);
      const returned = kase.approvalRuns.filter((r) => r.parallel && r.since < e.day && r.returned).at(-1)!;
      expect((e.payload.approvals as ApprovalStepInput[]).map((s) => s.userId)).toEqual(returned.steps.map((s) => s.userId));
      expect(e.payload.stepDueDay).toBe(e.day + APPROVER_REMIND_DAYS);
      // The raiser added to the idea first, the same day.
      expect(written.some((x) => x.type === "case.revised" && x.targetId === e.targetId && x.day === e.day)).toBe(true);
    }
    expect(ofType("case.withdrawn").length).toBeGreaterThan(0);
  });

  it("has slow approvers the clock reminds once, and asks a demo account one idea at a time", () => {
    // A step the simulation answers only after the clock's reminder fell due on it.
    const reminded = run.days.flatMap((d) => approvalDues(d.before, d.day, () => null).map((due) => (due.stepId ?? "").split("@")[0]));
    const answeredLate = ofType("case.approval").filter((e) => reminded.includes(e.payload.stepId as string));
    expect(answeredLate.length).toBeGreaterThan(0);
    for (const d of run.days) {
      const waiting = d.before.cases.flatMap((c) => c.approvals?.steps.filter((s) => s.state === "pending" && s.userId === plant.id) ?? []);
      expect(waiting.length, `day ${d.day}`).toBeLessThanOrEqual(1);
    }
  });

  it("keeps every stage in view: on a desk, waiting on approvers, sent back, a draft in setup, running", () => {
    for (const d of run.days.filter((x) => x.day >= 20)) {
      const s = d.before;
      const status = (c: State["cases"][number]) => ideaApprovalStatus(c, s);
      const stages = {
        desk: s.cases.some((c) => c.open && c.decided === null && c.assigneeSeatId !== "seat_2"),
        waiting: s.cases.some((c) => status(c).state === "pending" && status(c).approved > 0 && status(c).waitingOn.length > 0),
        back: s.cases.some((c) => status(c).state === "returned"),
        setup: s.projects.some((p) => p.draft && p.status === "planning"),
        running: s.projects.some((p) => p.status === "running"),
      };
      expect(stages, `day ${d.day}`).toEqual({ desk: true, waiting: true, back: true, setup: true, running: true });
    }
  });
});
