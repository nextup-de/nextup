import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR, DEMO_CLOCK, type ClockSpec } from "@/features/clock";
import { workdayOf } from "@/features/clock/calendar";
import type { CaseEvent } from "@/features/cases/events";
import type { ReducedCase } from "@/features/cases/reducer";
import { answerPromise } from "@/features/cases/promise";
import { promiseText } from "@/features/cases/promise-text";
import { createT } from "@/i18n";
import type { CaseReview } from "@/features/approvals/types";

const CAL = { ...DEFAULT_CALENDAR, extraHolidays: ["2026-03-09"] }; // the Monday after Friday 2026-03-06
const WORKDAYS: ClockSpec = { mode: "workdays", calendar: CAL };
const FRIDAY = workdayOf(new Date("2026-03-06T12:00:00Z"), CAL);

const ev = (type: CaseEvent["type"], day: number, payload: CaseEvent["payload"] = {}): CaseEvent =>
  ({ id: `${type}-${day}`, ts: 0, day, type, actor: "x", target: "c1", payload });

function mk(over: Partial<ReducedCase> = {}, history: CaseEvent[] = []): ReducedCase {
  return {
    id: "c1", seed: false, kind: "problem", title: "t", body: "", from: "A", fromDept: "", fromUserId: "u1",
    assigneeSeatId: "seat-owner", assigneeRoleId: "role-owner", routeId: "r1", assignee: "Owner", raisedDay: FRIDAY,
    reason: "", upside: "", linkedIdea: null, status: "open", read: null, decided: null, withdrawn: null, question: null, handed: [],
    building: null, shipped: null, override: null, discussion: null, versions: [], decisions: [], passes: 0, notNowInRow: 0, appeal: null, reopens: [], cycleStartDay: FRIDAY, dueFloor: null, reopenSeq: null, decidedSeq: null, follows: null, followedBy: [], sameAs: null, related: [], merged: null, mergedIn: [], links: [], review: null, cost: null, approvals: null, approvalRuns: [], openingRunId: null, pausedDays: 0, pausedSince: null,
    history, route: null, age: 0, clock: 0, open: true, archived: false, overdue: false, dueDay: FRIDAY + 2, escalated: null,
    ...over,
  };
}

describe("LOOP answer promise", () => {
  it("raised on a Friday before a holiday Monday gives the right date", () => {
    const p = answerPromise(mk(), { today: FRIDAY, clock: WORKDAYS });
    expect(p.dueDay).toBe(FRIDAY + 2);
    expect(p.dueDate).toBe("2026-03-11");
  });

  it("is waiting with days left", () => {
    const p = answerPromise(mk(), { today: FRIDAY + 1, clock: WORKDAYS });
    expect(p.state).toBe("waiting");
    expect(p.holder).toBe("owner");
    expect(p.answeredDay).toBeNull();
  });

  it("is due today on the due day", () => {
    expect(answerPromise(mk(), { today: FRIDAY + 2, clock: WORKDAYS }).state).toBe("due-today");
  });

  it("is late with the owner and an escalation role", () => {
    const escalated = { to: "Deputy", from: "Owner", day: FRIDAY + 3, live: true, toSeatId: "seat-dep", toRoleId: "role-dep" };
    const p = answerPromise(mk({ escalated }), { today: FRIDAY + 3, clock: WORKDAYS });
    expect(p.state).toBe("late");
    expect(p.holder).toBe("owner");
    expect(p.holderRoleId).toBe("role-owner");
    expect(p.holderSeatId).toBe("seat-owner");
    expect(p.escalatedRoleId).toBe("role-dep");
    expect(p.handedDay).toBeNull();
  });

  it("is late with the deputy after a deadline hand-over", () => {
    const history = [ev("case.handed", FRIDAY + 3, { to: "Deputy", toRoleHolderId: "seat-dep", why: "deadline" })];
    const c = mk({ assigneeSeatId: "seat-dep", assigneeRoleId: "role-dep", escalated: { to: "Deputy", from: "Owner", day: FRIDAY + 3, live: true, toSeatId: "seat-dep", toRoleId: "role-dep" } }, history);
    const p = answerPromise(c, { today: FRIDAY + 4, clock: WORKDAYS });
    expect(p.state).toBe("late");
    expect(p.holder).toBe("deputy");
    expect(p.handedDay).toBe(FRIDAY + 3);
    expect(p.holderRoleId).toBe("role-dep");
    expect(p.holderSeatId).toBe("seat-dep");
    expect(p.escalatedRoleId).toBeNull();
  });

  it("a hand-over for another reason is not a deadline hand-over", () => {
    const history = [ev("case.handed", FRIDAY + 1, { to: "Other", why: "away" })];
    const p = answerPromise(mk({}, history), { today: FRIDAY + 1, clock: WORKDAYS });
    expect(p.holder).toBe("owner");
    expect(p.handedDay).toBeNull();
    expect(p.answeredDay).toBeNull();
  });

  it("is answered on time by a question", () => {
    const history = [ev("case.asked", FRIDAY + 1, { text: "?" })];
    const p = answerPromise(mk({ status: "asked" }, history), { today: FRIDAY + 5, clock: WORKDAYS });
    expect(p.state).toBe("answered-on-time");
    expect(p.answeredDay).toBe(FRIDAY + 1);
  });

  it("is answered late by a decision", () => {
    const history = [ev("case.decided", FRIDAY + 4, { answer: "no" })];
    const p = answerPromise(mk({ status: "decided" }, history), { today: FRIDAY + 5, clock: WORKDAYS });
    expect(p.state).toBe("answered-late");
    expect(p.answeredDay).toBe(FRIDAY + 4);
  });

  it("demo mode has no date", () => {
    const p = answerPromise(mk({ raisedDay: 0, dueDay: 5 }), { today: 2, clock: DEMO_CLOCK });
    expect(p.dueDate).toBeNull();
    expect(p.dueDay).toBe(5);
    expect(p.state).toBe("waiting");
  });
});

// GAT-U1 (B2): the answer promise while a raise is reviewed and while a yes waits for its approval (plan GAT, D15, D21). Flat top-level tests (D36).
const names = { holderRole: "Quality lead", holderPeople: ["L. Brandt"], escalatedRole: null, date: (d: number) => `D${d}`, today: FRIDAY + 1 };
const review: CaseReview = { state: "pending", seatId: "seat-owner", since: FRIDAY, dueDay: FRIDAY + 1, forwardFrom: FRIDAY + 1, waitsOn: null, auto: false };

it("GAT promise reads With role while in review", () => {
  const p = answerPromise(mk({ review }), { today: FRIDAY + 1, clock: WORKDAYS });
  expect(p.stage).toBe("review");
  expect(promiseText(p, names, createT("en")).answerBy).toBe(`With Quality lead · answer by D${FRIDAY + 2}`);
  expect(promiseText(p, names, createT("de")).answerBy).toContain(`D${FRIDAY + 2}`);
  // The answer date is the promise, not the review's own day; a forwarded or ended review reads as an ordinary promise again.
  expect(promiseText(p, { ...names, holderRole: "" }, createT("en")).answerBy).toBe(`With no desk yet · answer by D${FRIDAY + 2}`);
  for (const state of ["forwarded", "ended"] as const) {
    const after = answerPromise(mk({ review: { ...review, state } }), { today: FRIDAY + 1, clock: WORKDAYS });
    expect(after.stage).toBeUndefined();
    expect(promiseText(after, names, createT("en")).answerBy).toBe("D" + (FRIDAY + 2) + " · 1 working day left");
  }
  expect(answerPromise(mk(), { today: FRIDAY + 1, clock: WORKDAYS }).stage).toBeUndefined();
});

it("GAT promise reads Waits for approval while in approval", () => {
  const c = mk({ status: "approval", open: false });
  const p = answerPromise(c, { today: FRIDAY + 4, clock: WORKDAYS });
  expect(p.stage).toBe("approval");
  expect(promiseText(p, names, createT("en")).answerBy).toBe("Waits for approval");
  expect(promiseText(p, names, createT("de")).answerBy).toBe("Wartet auf Freigabe");
  // It is no answer date and never late, even past the day the promise would have run out.
  expect(promiseText(answerPromise(c, { today: FRIDAY + 40, clock: WORKDAYS }), { ...names, today: FRIDAY + 40 }, createT("en")).answerBy).toBe("Waits for approval");
});
