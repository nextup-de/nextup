// Reducer tests, ported from the legacy demo's store.test.cjs. These protect the one piece of
// code every button depends on. Add a case here whenever an event type or a derived field changes.
import { describe, expect, it } from "vitest";
import { appendEvent, emptyLog, type CaseEvent, type CaseEventType, type EventLog, type EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { actedBy, clearedBy, cosignedBy, deskFor, deskHolders, exportSnippet, inboxFor, mineFor } from "@/features/cases/selectors";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };

let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "t" + n++, ts: 0, type, actor, target, payload, day });
const logOf = (...events: CaseEvent[]): EventLog => ({ events, day: Math.max(0, ...events.map((e) => e.day)) });
const find = <T extends { id: string }>(xs: T[], id: string) => xs.find((x) => x.id === id)!;

describe("reduce", () => {
  it("seed reduces: 8 cases, 6 open for T. Vogel, employee has 2 cases + 1 co-sign", () => {
    const S = reduce(SEED, logOf());
    expect(S.cases.length).toBe(8);
    expect(inboxFor(S, "T. Vogel").length).toBe(6);
    expect(mineFor(S, "Anonymous #4471").length).toBe(3); // c3 open + c7 shipped + c8 building
    expect(cosignedBy(S, "Anonymous #4471").map((i) => i.id).join()).toBe("i1");
  });

  it("seed history: c7 shipped, c8 building, ages derived from raisedDay", () => {
    const S = reduce(SEED, logOf());
    const c7 = find(S.cases, "c7"), c8 = find(S.cases, "c8"), c1 = find(S.cases, "c1");
    expect(c7.status).toBe("shipped");
    expect(c7.shipped?.outcome).toBe("5 weeks → 11 days");
    expect(c7.clock, "decided 3 days after raise → clock stops at 3").toBe(3);
    expect(c8.status).toBe("building");
    expect(c1.age).toBe(7);
    expect(c1.overdue, "c1 is 7 d old, promise is " + PROMISE_DAYS).toBe(true);
    expect(c1.escalated?.to, "overdue case names an escalation target").toBeTruthy();
  });

  it("case.raised: new case lands in the assignee inbox, employee sees it", () => {
    const S = reduce(SEED, logOf(ev("case.raised", "Anonymous #4471", "c_new", { title: "Night shift order", routeId: "r1", assignee: "R. Nowak", fromDept: "Production, Line 3" })));
    const c = find(S.cases, "c_new");
    expect(c.seed).toBe(false);
    expect(c.assignee).toBe("R. Nowak");
    expect(inboxFor(S, "R. Nowak").length).toBe(1);
    expect(mineFor(S, "Anonymous #4471").length).toBe(4);
    expect(c.age).toBe(0);
    expect(c.overdue).toBe(false);
    expect(c.kind, "kind missing on the event = problem").toBe("problem");
  });

  it("case.raised keeps the kind: an idea stays an idea, a seed row without one is a problem", () => {
    const S = reduce(SEED, logOf(ev("case.raised", "Anonymous #4471", "c_idea", { kind: "idea", title: "Shared fixture library", routeId: null, assignee: "T. Vogel", fromDept: "Production, Line 3" })));
    expect(find(S.cases, "c_idea").kind).toBe("idea");
    expect(S.cases.filter((c) => c.seed).map((c) => c.kind).join()).toBe("problem,problem,problem,problem,problem,idea,idea,idea");
  });

  it("case.decided closes the case; clock stops; cleared list credits the actor", () => {
    const S = reduce(SEED, logOf(ev("case.decided", "T. Vogel", "c2", { answer: "no", reason: "not responsible", note: "Night shift gets a €500 card." })));
    const c = find(S.cases, "c2");
    expect(c.status).toBe("decided");
    expect(c.decided?.answer).toBe("no");
    expect(c.decided?.reason).toBe("not responsible");
    expect(inboxFor(S, "T. Vogel").length).toBe(5);
    expect(actedBy(c, "T. Vogel")).toBe("decided");
    expect(clearedBy(S, "T. Vogel").length).toBe(1);
  });

  it("case.handed moves the case to the other inbox; ledger counts it", () => {
    const S = reduce(SEED, logOf(ev("case.handed", "T. Vogel", "c2", { to: "R. Nowak" })));
    const c = find(S.cases, "c2");
    expect(c.assignee).toBe("R. Nowak");
    expect(c.open).toBe(true);
    expect(inboxFor(S, "T. Vogel").length).toBe(5);
    expect(inboxFor(S, "R. Nowak").length).toBe(1);
    expect(actedBy(c, "T. Vogel")).toBe("handed");
    expect(S.ledger.handedOver).toBe(1);
  });

  it("case.asked pauses the clock; case.answered resumes it", () => {
    // raised at -4 (c2). Ask on day 0, answer on day 3, look on day 5 → clock = 9 - 3 paused = 6
    const asked = ev("case.asked", "T. Vogel", "c2", { text: "Which belt?" }, 0);
    const log: EventLog = { events: [asked, ev("case.answered", "S. Dahl", "c2", { text: "The 40 mm one." }, 3)], day: 5 };
    const S = reduce(SEED, log);
    const c = find(S.cases, "c2");
    expect(c.status).toBe("open");
    expect(c.question?.answer?.text).toBe("The 40 mm one.");
    expect(c.age).toBe(9);
    expect(c.clock).toBe(6);
    const paused = find(reduce(SEED, { events: [asked], day: 5 }).cases, "c2");
    expect(paused.status).toBe("asked");
    expect(paused.clock, "while paused the clock stays where it was when the question went out").toBe(4);
    expect(inboxFor(S, "T. Vogel").some((x) => x.id === "c2"), "answered case is back in the inbox").toBe(true);
  });

  it('a question is "off the desk" only while unanswered; deskFor keeps paused cases', () => {
    const asked = reduce(SEED, logOf(ev("case.asked", "T. Vogel", "c2", { text: "Which belt?" })));
    expect(actedBy(find(asked.cases, "c2"), "T. Vogel")).toBe("asked");
    expect(inboxFor(asked, "T. Vogel").length, "paused case is not in the live inbox").toBe(5);
    expect(deskFor(asked, "T. Vogel").length, "but it is still on the desk").toBe(6);
    const back = reduce(SEED, logOf(ev("case.asked", "T. Vogel", "c2", { text: "Which belt?" }), ev("case.answered", "S. Dahl", "c2", { text: "40 mm" }, 1)));
    expect(actedBy(find(back.cases, "c2"), "T. Vogel"), "answered → back on the desk, not cleared").toBeNull();
    expect(clearedBy(back, "T. Vogel").length).toBe(0);
  });

  it("day.advanced ages every open case; a fresh case crosses the promise", () => {
    const log: EventLog = { events: [ev("case.raised", "Anonymous #4471", "c_x", { title: "x", routeId: "r6", assignee: "T. Vogel" }, 0)], day: PROMISE_DAYS + 1 };
    const c = find(reduce(SEED, log).cases, "c_x");
    expect(c.age).toBe(PROMISE_DAYS + 1);
    expect(c.overdue).toBe(true);
    expect(c.escalated?.to, "r6 owner is T. Vogel, so escalation goes to the deputy").toBe("H. Sander");
  });

  it("escalation: an overdue case lands on the deputy's desk too; seed overdue is not live", () => {
    const S0 = reduce(SEED, logOf());
    const c1 = find(S0.cases, "c1"); // raised -7, r7 owner T. Vogel → deputy M. Roth
    expect(c1.escalated?.to).toBe("M. Roth");
    expect(c1.escalated?.live, "already overdue at day 0 — not counted as a demo escalation").toBe(false);
    expect(S0.ledger.escalated).toBe(0);
    expect(inboxFor(S0, "M. Roth").some((c) => c.id === "c1"), "deputy sees it").toBe(true);
    expect(inboxFor(S0, "T. Vogel").some((c) => c.id === "c1"), "original owner keeps it").toBe(true);
    // a case raised today, six days later
    const S6 = reduce(SEED, { events: [ev("case.raised", "Anonymous #4471", "c_x", { title: "x", routeId: "r3", assignee: "T. Vogel" }, 0)], day: PROMISE_DAYS + 1 });
    const cx = find(S6.cases, "c_x");
    expect(cx.escalated?.to, "sat with T. Vogel but r3 is owned by H. Sander → goes to the owner").toBe("H. Sander");
    expect(cx.escalated?.live).toBe(true);
    expect(cx.escalated?.day).toBe(PROMISE_DAYS + 1);
    expect(S6.ledger.escalated, "the new case + five seed cases (raised 1-4 d ago) all crossed the line during the session; c1 was already over").toBe(6);
    expect(deskHolders(S6, ROUTES)).toContain("H. Sander");
    // the owner can close it
    const S7 = reduce(SEED, { events: cx.history.concat([ev("case.decided", "H. Sander", "c_x", { answer: "yes" }, PROMISE_DAYS + 1)]), day: PROMISE_DAYS + 1 });
    expect(find(S7.cases, "c_x").decided?.by).toBe("H. Sander");
    expect(inboxFor(S7, "T. Vogel").some((c) => c.id === "c_x")).toBe(false);
  });

  it("advancing the day ages waiting ideas but not decided ones", () => {
    const S = reduce(SEED, { events: [], day: 3 });
    expect(find(S.ideas, "i1").wait, "was 19").toBe(22);
    expect(find(S.ideas, "i3").wait, "In trial stays 0").toBe(0);
    const A = reduce(SEED, { events: [ev("idea.approved", "B. Hartmann", "i1", {}, 1)], day: 3 });
    expect(find(A.ideas, "i1").wait, "approved → clock stopped").toBe(0);
  });

  it("idea.cosigned is idempotent per actor; idea.uncosigned removes it", () => {
    const S1 = reduce(SEED, logOf(ev("idea.cosigned", "Anonymous #4471", "i2"), ev("idea.cosigned", "Anonymous #4471", "i2")));
    expect(find(S1.ideas, "i2").cosigners.length).toBe(1);
    const S2 = reduce(SEED, logOf(ev("idea.cosigned", "Anonymous #4471", "i2"), ev("idea.uncosigned", "Anonymous #4471", "i2")));
    expect(find(S2.ideas, "i2").cosigners.length).toBe(0);
    expect(find(S2.ideas, "i1").cosigners.length, "seed co-sign on i1 untouched").toBe(1);
  });

  it("idea.approved: status → In trial, wait 0, team set, problem owner → trial", () => {
    const S = reduce(SEED, logOf(ev("idea.approved", "B. Hartmann", "i1", { team: ["C. Ilg", "R. Nowak"] })));
    const i = find(S.ideas, "i1");
    expect(i.status).toBe("In trial");
    expect(i.wait).toBe(0);
    expect(i.team).toEqual(["C. Ilg", "R. Nowak"]);
    expect(find(S.problems, "p1").owner).toBe("trial");
    expect(S.ideas.filter((x) => x.status === "Awaiting decision").length, "was 3").toBe(2);
  });

  it("seed is never mutated by reduce", () => {
    const before = JSON.stringify([CASES, IDEAS, PROBLEMS]);
    reduce(SEED, logOf(ev("idea.approved", "B. Hartmann", "i1", { team: ["X"] }), ev("case.handed", "T. Vogel", "c2", { to: "R. Nowak" })));
    expect(JSON.stringify([CASES, IDEAS, PROBLEMS])).toBe(before);
  });

  it("appendEvent advances the day only on day.advanced", () => {
    let log = emptyLog();
    log = appendEvent(log, { type: "case.read", actor: "T. Vogel", target: "c1" });
    expect(log.day).toBe(0);
    expect(log.events[0].day).toBe(0);
    log = appendEvent(log, { type: "day.advanced", actor: "dev", target: null, payload: { by: 2 } });
    expect(log.day).toBe(2);
    expect(log.events.length).toBe(2);
    expect(appendEvent(log, { type: "case.read", actor: "T. Vogel", target: "c2" }).events[2].day, "stamped with the current day").toBe(2);
  });

  it("exportSnippet emits only session cases, with history as seedEvents", () => {
    const S = reduce(SEED, { events: [ev("case.raised", "Anonymous #4471", "c_e", { title: "Export me", routeId: "r2", assignee: "M. Roth" }, 1), ev("case.read", "M. Roth", "c_e", {}, 2)], day: 3 });
    const txt = exportSnippet(S);
    expect(txt).toMatch(/id: "c_e"/);
    expect(txt, "raised on day 1 of 3 → -2 relative to a new today").toMatch(/raisedDay: -2/);
    expect(txt).toMatch(/case\.read/);
    expect(txt).not.toMatch(/"c1"/);
  });
});
