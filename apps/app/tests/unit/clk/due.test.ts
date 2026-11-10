import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR, DEMO_CLOCK, type ClockSpec } from "@/features/clock";
import { dueNow, type SeatAbove } from "@/features/clock/due";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { meFor, type SeatRow } from "@/features/auth/identity";
import { deskOf } from "@/features/cases/selectors";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";

const WORKDAYS: ClockSpec = { mode: "workdays", calendar: DEFAULT_CALENDAR };
const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 1 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner", deputySeatId: "seat_dep", deputyRoleId: "role_deputy" } : x));
const BASE: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats };
const WD: ReduceSeed = { ...BASE, clock: WORKDAYS };

let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "k" + n++, ts: 0, type, actor, actorUserId: actor === "system:clock" ? null : "u_lb", target, payload, day });
const logAt = (day: number, ...events: CaseEvent[]): EventLog => ({ events, day });
const raise = (id: string, day = 0) => ev("case.raised", "L. Brandt", id, { kind: "problem", title: "Case " + id, routeId: "r1", assignee: "T. Vogel" }, day);
const fact = (target: string, payload: EventPayload, day = 0) => ev("clock.due", "system:clock", target, payload, day);
const yes = (caseId: string) => ev("case.decided", "T. Vogel", caseId, { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "P" });
const baseline = () => ev("project.baseline", "L. Brandt", "p_one", { metric: "m", unit: "min", value: 42, better: "down", source: "x" });
const find = <T extends { id: string }>(xs: T[], id: string) => xs.find((x) => x.id === id)!;

describe("CLK reducer on due facts", () => {
  const late = PROMISE_DAYS + 2;

  it("an overdue case is overdue but not escalated without a fact", () => {
    const c = find(reduce(WD, logAt(late, raise("c_a"))).cases, "c_a");
    expect(c.overdue).toBe(true);
    expect(c.escalated).toBeNull();
  });

  it("a deadline fact escalates to the seat's role; the deputy and the owner both have it", () => {
    const S = reduce(WD, logAt(late, raise("c_a"), fact("c_a", { kind: "deadline", dueDay: PROMISE_DAYS, toRoleHolderId: "seat_dep" })));
    const c = find(S.cases, "c_a");
    expect(c.escalated).toEqual({ to: "H. Sander", from: "T. Vogel", day: PROMISE_DAYS + 1, live: true, toSeatId: "seat_dep", toRoleId: "role_deputy" });
    expect(c.history.some((e) => e.type === "clock.due")).toBe(true);
    expect(S.ledger.escalated).toBe(1);
    expect(deskOf(S, meFor("u_hs", seats)).some((x) => x.id === "c_a")).toBe(true);
    expect(deskOf(S, meFor("u_tv", seats)).some((x) => x.id === "c_a")).toBe(true);
  });

  it("a decided case is not escalated", () => {
    const S = reduce(WD, logAt(late, raise("c_a"), fact("c_a", { kind: "deadline", dueDay: PROMISE_DAYS, toRoleHolderId: "seat_dep" }), ev("case.decided", "T. Vogel", "c_a", { answer: "no" }, late)));
    expect(find(S.cases, "c_a").escalated).toBeNull();
  });

  it("a project past its start date escalates only with a start fact", () => {
    const base = [raise("c_a"), yes("c_a")];
    const without = reduce(WD, logAt(late, ...base)).projects[0];
    expect(without.overdue).toBe(true);
    expect(without.escalated).toBeNull();
    const S = reduce(WD, logAt(late, ...base, fact("p_one", { kind: "start", dueDay: PROMISE_DAYS, toRoleHolderId: "seat_tv" })));
    expect(S.projects[0].escalated).toEqual({ to: "T. Vogel", toSeatId: "seat_tv", toRoleId: "role_owner", from: "L. Brandt", day: PROMISE_DAYS + 1, live: true, what: "start" });
    expect(S.ledger.projectsEscalated).toBe(1);
  });

  it("the same seed in demo mode escalates exactly as today", () => {
    const events = [raise("c_a"), raise("c_b"), yes("c_b")];
    const log = logAt(late, ...events, fact("c_a", { kind: "deadline", dueDay: 0, toRoleHolderId: "seat_tv" }));
    const asIs = reduce(BASE, logAt(late, ...events));
    const demo = reduce({ ...BASE, clock: DEMO_CLOCK }, log);
    expect(find(demo.cases, "c_a").escalated).toEqual(find(asIs.cases, "c_a").escalated);
    expect(find(demo.cases, "c_a").escalated?.to).toBeTruthy();
    expect(demo.projects[0].escalated).toEqual(asIs.projects[0].escalated);
    expect(demo.ledger).toEqual(asIs.ledger);
    const local = { cases: LOCAL_SEED.cases, ideas: LOCAL_SEED.ideas, problems: PROBLEMS, routes: LOCAL_SEED.routes, promiseDays: PROMISE_DAYS, seats: LOCAL_SEED.seats };
    expect(reduce({ ...local, clock: DEMO_CLOCK }, logAt(3)).ledger).toEqual(reduce(local, logAt(3)).ledger);
  });
});

describe("CLK dueNow", () => {
  const late = PROMISE_DAYS + 2;

  it("an overdue case yields one deadline Due to the deputy's seat; none once the fact is in", () => {
    const S = reduce(WD, logAt(late, raise("c_a")));
    expect(dueNow(S, late)).toEqual([{ kind: "deadline", target: "c_a", dueDay: PROMISE_DAYS, toRoleHolderId: "seat_dep", idemKey: `clk:deadline:c_a:${PROMISE_DAYS}` }]);
    const done = reduce(WD, logAt(late, raise("c_a"), fact("c_a", { kind: "deadline", dueDay: PROMISE_DAYS, toRoleHolderId: "seat_dep" })));
    // LOOP-H1: with the fact in and the rule on (default), the hand-over is what is left.
    expect(dueNow(done, late).map((d) => d.kind)).toEqual(["handover"]);
  });

  it("skips a vacant seat: the deadline goes to the first seat with someone on it, or to nobody", () => {
    const vacant: SeatRow = { id: "seat_vac", roleId: "role_deputy", label: "Vacant", userId: null, sort: 0 };
    const withVacant = reduce({ ...WD, seats: [vacant, ...seats] }, logAt(late, raise("c_a")));
    expect(dueNow(withVacant, late)[0]).toMatchObject({ kind: "deadline", toRoleHolderId: "seat_dep" });
    const onlyVacant = reduce({ ...WD, seats: [vacant, seats[0]] }, logAt(late, raise("c_a")));
    expect(dueNow(onlyVacant, late)[0]).toMatchObject({ kind: "deadline", toRoleHolderId: null });
  });

  it("nothing for a case not yet due, nothing in demo mode", () => {
    expect(dueNow(reduce(WD, logAt(1, raise("c_a"))), 1)).toEqual([]);
    expect(dueNow(reduce({ ...BASE, clock: DEMO_CLOCK }, logAt(late, raise("c_a"))), late)).toEqual([]);
  });

  it("a discussion past its check-in day yields a checkin Due, once", () => {
    const disc = ev("case.discussion", "T. Vogel", "c_a", { invited: [], missing: "x" }, 0);
    const S = reduce(WD, logAt(20, raise("c_a"), disc));
    const c = find(S.cases, "c_a");
    expect(dueNow(S, 20)).toEqual([{ kind: "checkin", target: "c_a", dueDay: c.dueDay, idemKey: `clk:checkin:c_a:${c.dueDay}` }]);
    const S2 = reduce(WD, logAt(20, raise("c_a"), disc, fact("c_a", { kind: "checkin", dueDay: c.dueDay })));
    expect(dueNow(S2, 20)).toEqual([]);
  });

  it("a project past its start day yields a start Due", () => {
    const S = reduce(WD, logAt(late, raise("c_a"), yes("c_a")));
    const due = dueNow(S, late).filter((d) => d.target === "p_one");
    expect(due).toEqual([{ kind: "start", target: "p_one", dueDay: PROMISE_DAYS, toRoleHolderId: "seat_tv", idemKey: `clk:start:p_one:${PROMISE_DAYS}` }]);
  });

  it("a late 30-day check yields a measure Due with check", () => {
    const evs = [raise("c_a"), yes("c_a"), baseline(), ev("project.started", "L. Brandt", "p_one", {}), ev("project.done", "L. Brandt", "p_one", {}, 1)];
    const day = 1 + 30 + PROMISE_DAYS + 1;
    const S = reduce(WD, logAt(day, ...evs));
    const m = dueNow(S, day).filter((d) => d.kind === "measure");
    expect(m).toEqual([{ kind: "measure", target: "p_one", dueDay: 1 + 30 + PROMISE_DAYS, check: 30, toRoleHolderId: "seat_tv", idemKey: `clk:measure:p_one:${1 + 30 + PROMISE_DAYS}:30` }]);
    const S2 = reduce(WD, logAt(day, ...evs, fact("p_one", { kind: "measure", dueDay: 1 + 30 + PROMISE_DAYS, check: 30, toRoleHolderId: "seat_tv" })));
    expect(dueNow(S2, day).filter((d) => d.kind === "measure")).toEqual([]);
    expect(S2.projects[0].escalated?.what).toBe("measure");
  });
});

describe("CLK second level (escalation_days)", () => {
  const head: SeatRow = { id: "seat_head", roleId: "role_head", label: "K. Head", userId: "u_kh", sort: 2 };
  const ORG: ReduceSeed = { ...WD, seats: [...seats, head] };
  const DUE = PROMISE_DAYS;
  const N = 3; // the default
  const above: SeatAbove = () => "seat_head";
  const deadline = (to: string | null) => fact("c_a", { kind: "deadline", dueDay: DUE, toRoleHolderId: to });
  const toDeputy = () => ev("case.handed", "system:clock", "c_a", { to: "H. Sander", toRoleHolderId: "seat_dep", why: "deadline" });
  const up = (to: string | null) => fact("c_a", { kind: "escalation", dueDay: DUE, toRoleHolderId: to });
  const toHead = () => ev("case.handed", "system:clock", "c_a", { to: "K. Head", toRoleHolderId: "seat_head", why: "escalation" });
  const dues = (seed: ReduceSeed, day: number, events: CaseEvent[], find: SeatAbove = above) => dueNow(reduce(seed, logAt(day, ...events)), day, find);

  it("fires once N working days after the answer date have passed, to the seat above the owner's desk", () => {
    const first = [raise("c_a"), deadline("seat_dep"), toDeputy()];
    expect(dues(ORG, DUE + N, first)).toEqual([]);
    const asked: [string, readonly string[]][] = [];
    const out = dues(ORG, DUE + N + 1, first, (roleId, skip) => { asked.push([roleId, skip]); return "seat_head"; });
    expect(out).toEqual([{ kind: "escalation", target: "c_a", dueDay: DUE, toRoleHolderId: "seat_head", idemKey: "clk:escalate:c_a" }]);
    // Above the desk that owes the answer, never the role that holds the case now.
    expect(asked).toEqual([["role_owner", ["role_deputy"]]]);
  });

  it("the fact first, the hand-over a run later, then nothing: once per case", () => {
    const fired = [raise("c_a"), deadline("seat_dep"), toDeputy(), up("seat_head")];
    expect(dues(ORG, DUE + N + 1, fired)).toEqual([
      { kind: "handover", why: "escalation", target: "c_a", dueDay: DUE, toRoleHolderId: "seat_head", idemKey: "clk:escalate:c_a:handover" },
    ]);
    const done = [...fired, toHead()];
    expect(dues(ORG, DUE + N + 1, done)).toEqual([]);
    expect(dues(ORG, DUE + N + 20, done)).toEqual([]);
    expect(find(reduce(ORG, logAt(DUE + N + 1, ...done)).cases, "c_a").assigneeSeatId).toBe("seat_head");
  });

  it("the first level comes first, and the deputy no longer takes a case the second level has", () => {
    expect(dues(ORG, DUE + 10, [raise("c_a")]).map((d) => d.kind)).toEqual(["deadline"]);
    expect(dues(ORG, DUE + 10, [raise("c_a"), deadline("seat_dep")])).toMatchObject([{ kind: "handover", idemKey: "clk:handover:c_a" }]);
    expect(dues(ORG, DUE + 10, [raise("c_a"), deadline("seat_dep"), toDeputy()]).map((d) => d.kind)).toEqual(["escalation"]);
    // Hand-over off: the deputy was only told, and the second level still fires.
    const OFF: ReduceSeed = { ...ORG, loop: { deadlineHandover: false } };
    expect(dues(OFF, DUE + 10, [raise("c_a"), deadline("seat_dep")]).map((d) => d.kind)).toEqual(["escalation"]);
    expect(dues(ORG, DUE + 10, [raise("c_a"), deadline("seat_dep"), up("seat_head")])).toMatchObject([{ kind: "handover", why: "escalation" }]);
  });

  it("fires with no occupied deputy, and records the fact when nobody is above", () => {
    const none = [raise("c_a"), deadline(null)];
    expect(dues(ORG, DUE + N + 1, none)).toMatchObject([{ kind: "escalation", toRoleHolderId: "seat_head" }]);
    expect(dues(ORG, DUE + N + 1, none, () => null)).toEqual([{ kind: "escalation", target: "c_a", dueDay: DUE, toRoleHolderId: null, idemKey: "clk:escalate:c_a" }]);
    // dueNow without a lookup finds nobody, as in the demo data.
    expect(dueNow(reduce(ORG, logAt(DUE + N + 1, ...none)), DUE + N + 1)).toMatchObject([{ kind: "escalation", toRoleHolderId: null }]);
    expect(dues(ORG, DUE + N + 1, [...none, up(null)])).toEqual([]);
  });

  it("follows the rule: another number of days, and 0 switches it off", () => {
    const first = [raise("c_a"), deadline("seat_dep"), toDeputy()];
    const rule = (escalationDays: number): ReduceSeed => ({ ...ORG, loop: { escalationDays } });
    expect(dues(rule(1), DUE + 1, first)).toEqual([]);
    expect(dues(rule(1), DUE + 2, first).map((d) => d.kind)).toEqual(["escalation"]);
    expect(dues(rule(0), DUE + 50, first)).toEqual([]);
  });

  it("not for a paused or a closed case, and not in demo mode", () => {
    const first = [raise("c_a"), deadline("seat_dep"), toDeputy()];
    const asked = ev("case.asked", "H. Sander", "c_a", { text: "Which line?" }, DUE + 1);
    // The second level does not fire for a paused case; what is due there is the question's own return.
    expect(dues(ORG, DUE + 10, [...first, asked]).map((d) => d.kind)).toEqual(["unanswered"]);
    const no = ev("case.decided", "H. Sander", "c_a", { answer: "no" }, DUE + 1);
    expect(dues(ORG, DUE + 10, [...first, no])).toEqual([]);
    expect(dues({ ...ORG, clock: DEMO_CLOCK }, DUE + 10, first)).toEqual([]);
    // A case already on the seat above is not handed to it again.
    const manual = ev("case.handed", "H. Sander", "c_a", { to: "K. Head", toRoleHolderId: "seat_head", why: "she knows the line" }, DUE + 2);
    expect(dues(ORG, DUE + 10, [...first, up("seat_head"), manual])).toEqual([]);
  });
});

describe("CLK an unanswered question (decision Q4.3)", () => {
  const ask = (day: number) => ev("case.asked", "T. Vogel", "c_a", { text: "Which line?" }, day);
  const at = (day: number, ...more: CaseEvent[]) => reduce(WD, logAt(day, raise("c_a"), ask(1), ...more));
  const back = (day: number, actor = "system:clock") => ev("case.unanswered", actor, "c_a", {}, day);

  it("nothing for two working days, then one reminder for the raiser", () => {
    expect(dueNow(at(3), 3)).toEqual([]);
    expect(dueNow(at(4), 4)).toEqual([{ kind: "question", target: "c_a", dueDay: 4, idemKey: "clk:question:c_a:1" }]);
    expect(dueNow(at(5, fact("c_a", { kind: "question", dueDay: 4 }, 4)), 5)).toEqual([]);
  });

  it("after five working days the case goes back to the desk, also when the reminder never ran", () => {
    expect(dueNow(at(6), 6)).toEqual([{ kind: "unanswered", target: "c_a", dueDay: 6, idemKey: "clk:unanswered:c_a:1" }]);
    expect(dueNow(at(9, fact("c_a", { kind: "question", dueDay: 4 }, 4)), 9).map((d) => d.kind)).toEqual(["unanswered"]);
  });

  it("the clock's return opens the case again, keeps the question and lets the answer date run", () => {
    const c = find(at(6, back(6)).cases, "c_a");
    expect(c.status).toBe("open");
    expect(c.question).toMatchObject({ text: "Which line?", answer: null, unanswered: 6 });
    expect([c.pausedDays, c.pausedSince]).toEqual([5, null]);
    expect(c.dueDay).toBe(PROMISE_DAYS + 5);
    expect(dueNow(at(6, back(6)), 6)).toEqual([]);
  });

  it("only the clock may end a question without an answer", () => {
    const c = find(at(6, back(6, "T. Vogel")).cases, "c_a");
    expect([c.status, c.question?.unanswered]).toEqual(["asked", null]);
  });

  it("an answer in time stops both, a second question starts its own count, and the demo clock does nothing", () => {
    const answered = ev("case.answered", "L. Brandt", "c_a", { text: "Line 3" }, 2);
    expect(dueNow(at(9, answered), 9).some((d) => d.kind === "question" || d.kind === "unanswered")).toBe(false);
    const again = ev("case.asked", "T. Vogel", "c_a", { text: "And which shift?" }, 7);
    expect(dueNow(at(10, back(6), again), 10)).toEqual([{ kind: "question", target: "c_a", dueDay: 10, idemKey: "clk:question:c_a:7" }]);
    expect(dueNow(reduce({ ...BASE, clock: DEMO_CLOCK }, logAt(9, raise("c_a"), ask(1))), 9)).toEqual([]);
  });
});

describe("CLK a raise without a route (decision Q2.1)", () => {
  const head: SeatRow = { id: "seat_head", roleId: "role_head", label: "K. Head", userId: "u_kh", sort: 2 };
  const SEED: ReduceSeed = { ...WD, seats: [...seats, head] };
  const noRoute = (seatId: string | null, day = 0) => ev("case.raised", "L. Brandt", "c_n", { kind: "idea", title: "No desk", routeId: null, assignee: "K. Head", assigneeRoleHolderId: seatId }, day);
  const at = (day: number, ...events: CaseEvent[]) => dueNow(reduce(SEED, logAt(day, ...events)), day, () => null);

  it("the fallback desk is reminded to pass it on after one working day, once", () => {
    expect(at(0, noRoute("seat_head"))).toEqual([]);
    expect(at(1, noRoute("seat_head"))).toEqual([{ kind: "triage", target: "c_n", dueDay: 1, idemKey: "clk:triage:c_n:1" }]);
    expect(at(2, noRoute("seat_head"), fact("c_n", { kind: "triage", dueDay: 1 }, 1))).toEqual([]);
  });

  it("no reminder once it is passed on, and none for a case on no desk", () => {
    const passed = ev("case.handed", "K. Head", "c_n", { to: "T. Vogel", toRoleHolderId: "seat_tv", why: "Their line" }, 0);
    expect(at(1, noRoute("seat_head"), passed)).toEqual([]);
    expect(at(PROMISE_DAYS + 3, noRoute(null))).toEqual([]);
  });

  it("it has the answer date of any case: a deadline fact for its desk, with nobody to hand it to", () => {
    const late = PROMISE_DAYS + 1;
    const dues = at(late, noRoute("seat_head"), fact("c_n", { kind: "triage", dueDay: 1 }, 1));
    expect(dues).toEqual([{ kind: "deadline", target: "c_n", dueDay: PROMISE_DAYS, toRoleHolderId: null, idemKey: `clk:deadline:c_n:${PROMISE_DAYS}` }]);
  });
});
