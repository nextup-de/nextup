import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR, DEMO_CLOCK, type ClockSpec } from "@/features/clock";
import { workdayOf } from "@/features/clock/calendar";
import type { CaseEvent } from "@/features/cases/events";
import type { ReducedCase } from "@/features/cases/reducer";
import { answerPromise } from "@/features/cases/promise";

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
    building: null, shipped: null, override: null, discussion: null, versions: [], decisions: [], passes: 0, notNowInRow: 0, appeal: null, reopens: [], cycleStartDay: FRIDAY, dueFloor: null, reopenSeq: null, decidedSeq: null, follows: null, followedBy: [], sameAs: null, related: [], merged: null, mergedIn: [], links: [], pausedDays: 0, pausedSince: null,
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
