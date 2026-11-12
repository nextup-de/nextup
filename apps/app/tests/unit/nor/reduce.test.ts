// NOR-A1 (B1, B2): the case reducer keeps every decision, reopens a case, records the second look, counts passes and moves
// the route (plan NOR, D12, D13, D14, D18, D24). Literal seats, routes and events; the reducer is the only code under test.
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import type { NoCategory } from "@/features/cases/no";
import type { SeedRole } from "@/features/demo/types";
import { ROUTES, SEATS, seedOf } from "./replay-log";

const ROLES: SeedRole[] = [
  { id: "role_head", orgUnitId: "unit", reportsToId: null },
  { id: "role_owner", orgUnitId: "unit", reportsToId: "role_head" },
  { id: "role_deputy", orgUnitId: "unit", reportsToId: "role_owner" },
  { id: "role_o2", orgUnitId: "unit", reportsToId: "role_head" },
];
const NAME: Record<string, string> = { u_own: "T. Vogel", u_dep: "H. Sander", u_head: "K. Head", u_o2: "E. Wagner", u_ra: "J. Schmidt", u_inv: "I. Invitee", u_mgr: "M. Chef" };
const seed = (over: Partial<ReduceSeed> = {}, workdays = false): ReduceSeed => ({ ...seedOf(workdays), roles: ROLES, ...over });

let n = 0;
/** One event by `by` (a user id) or by the clock (null). */
const ev = (type: CaseEventType, by: string | null, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "n" + n++, ts: 0, type, actor: by === null ? "system:clock" : NAME[by], actorUserId: by, target, payload, day });
const raise = (day = 0, route = "r1") => ev("case.raised", "u_ra", "c1", { kind: "problem", title: "Case", routeId: route, assignee: "T. Vogel", assigneeRoleHolderId: route === "r1" ? "s_own" : "s_o2" }, day);
const no = (payload: EventPayload, day = 1, by = "u_own") => ev("case.decided", by, "c1", { answer: "no", reason: "A reason that is long enough to count", ...payload }, day);
const yes = (payload: EventPayload = {}, day = 1) => ev("case.decided", "u_own", "c1", { answer: "yes", projectId: "p_1", lead: "T. Vogel", leadUserId: "u_own", ...payload }, day);
const run = (events: CaseEvent[], day: number, s: ReduceSeed = seed()) => reduce(s, { events: [raise(), ...events], day });
const kase = (events: CaseEvent[], day: number, s?: ReduceSeed) => run(events, day, s).cases[0];
const revisit = (day: number, payload: EventPayload = {}) => ev("case.reopened", null, "c1", { why: "revisit", dueDay: day + 5, ...payload }, day);

describe("NOR reduce decisions", () => {
  it("NOR handover: case.decided no payload lands on the Decision and in Case.decisions", () => {
    const c = kase([no({ category: "not-now", changeIf: "  A budget line  ", revisitDay: 30, duplicateOf: "c_other" })], 2);
    expect(c.decided).toMatchObject({ answer: "no", category: "not-now", reason: "A reason that is long enough to count", changeIf: "A budget line", revisitDay: 30, duplicateOf: "c_other", by: "T. Vogel", byUserId: "u_own", day: 1 });
    expect(c.decisions).toHaveLength(1);
    expect(c.decisions[0]).toBe(c.decided);
    expect(c.status).toBe("decided");
    expect(c.decidedSeq).toBe(c.history.length - 1);
    // an old no (no category in the payload) is mapped; a yes has none; the optional fields default empty
    expect(kase([ev("case.decided", "u_own", "c1", { answer: "no", reason: "no time", note: "Full plan" }, 1)], 2).decided).toMatchObject({ category: "no-time", changeIf: "", revisitDay: null, duplicateOf: null });
    expect(kase([yes()], 2).decided).toMatchObject({ answer: "yes", category: null });
    expect(kase([no({ category: "risk", revisitDay: 1.5 })], 2).decided?.revisitDay).toBeNull();
  });

  it("NOR handover: notNowInRow counts not-now decisions in a row and any other decision starts it again", () => {
    const row = (...cats: NoCategory[]) => kase(cats.map((category, i) => no({ category }, i + 1)), 9).notNowInRow;
    expect(row("not-now")).toBe(1);
    expect(row("not-now", "not-now")).toBe(2);
    expect(row("not-now", "no-fit")).toBe(0);
    expect(row("not-now", "no-fit", "not-now")).toBe(1);
    expect(row("no-budget")).toBe(0);
  });

  it("NOR handover: case.reopened by the clock (revisit) opens the case on the desk with a new answer date and a new cycle", () => {
    const events = [ev("case.asked", "u_own", "c1", { text: "Which line?" }, 1), ev("case.answered", "u_ra", "c1", { text: "Line 3" }, 2), no({ category: "not-now", revisitDay: 20 }, 3), revisit(20, { toRoleHolderId: "s_dep" })];
    const c = kase(events, 21);
    expect(c).toMatchObject({ status: "open", decided: null, question: null, discussion: null, cycleStartDay: 20, pausedDays: 0, pausedSince: null, dueFloor: null, open: true, archived: false });
    expect(c.reopens).toEqual([{ why: "revisit", day: 20, by: "system:clock" }]);
    expect(c.assigneeSeatId).toBe("s_dep"); // the seat the clock named
    expect(c.assigneeRoleId).toBe("role_deputy");
    expect(c.assignee).toBe("H. Sander");
    expect(c.dueDay).toBe(25); // the payload's answer date
    expect(c.clock).toBe(1); // counted from the reopen
    expect(c.overdue).toBe(false);
    expect(c.decisions).toHaveLength(1); // the no is kept
    expect(c.reopenSeq).toBe(c.history.length - 1);
    // late again in the new cycle, as any case is
    expect(kase(events, 27).overdue).toBe(true);
  });

  it("NOR handover: case.reopened without a seat or a due day goes to the route owner's desk, due promise days later", () => {
    const c = kase([no({ category: "not-now", revisitDay: 20 }, 3), ev("case.reopened", null, "c1", { why: "revisit" }, 20)], 20);
    expect(c.assigneeSeatId).toBe("s_own");
    expect(c.dueDay).toBe(25); // 20 + promise 5
    // a due day before the reopen day is not taken
    expect(kase([no({ category: "not-now" }, 3), ev("case.reopened", null, "c1", { why: "revisit", dueDay: 4 }, 20)], 20).dueDay).toBe(25);
  });

  it("NOR handover: case.reopened takes the fallback desk when the route is gone or its owner seat is empty, never an empty seat", () => {
    const gone = seed({ routes: [] });
    const c1 = kase([no({ category: "not-now" }, 3), revisit(20)], 20, gone);
    expect(c1).toMatchObject({ status: "open", assigneeSeatId: "s_head", assigneeRoleId: "role_head", routeId: "r1" }); // the occupied seat at the top of the org chart
    const emptyOwner = seed({ seats: SEATS.map((x) => (x.id === "s_own" ? { ...x, userId: null } : x)) });
    expect(kase([no({ category: "not-now" }, 3), revisit(20)], 20, emptyOwner).assigneeSeatId).toBe("s_head");
    // a seat the event names that nobody holds is not taken either
    expect(kase([no({ category: "not-now" }, 3), revisit(20, { toRoleHolderId: "s_unknown" })], 20).assigneeSeatId).toBe("s_own");
    // an appeal that is not upheld and a stopped project's idea follow the same rule
    const appealed = [no({ category: "no-fit" }, 1), ev("case.appealed", "u_ra", "c1", { text: "Please look again, the numbers changed", toRoleHolderId: "s_dep" }, 2), ev("case.appeal.decided", "u_dep", "c1", { uphold: false, reason: "New numbers change it" }, 3)];
    expect(kase(appealed, 3, gone).assigneeSeatId).toBe("s_head");
    expect(kase([yes(), ev("case.reopened", "u_own", "c1", { why: "stopped" }, 4)], 4, gone).assigneeSeatId).toBe("s_head");
  });

  it("NOR handover: case.reopened is only the clock's for revisit, a person's for stopped, and only on a decided case", () => {
    const decided = no({ category: "not-now", revisitDay: 20 }, 3);
    // a person cannot write revisit; the clock cannot write stopped
    expect(kase([decided, ev("case.reopened", "u_own", "c1", { why: "revisit" }, 20)], 20).status).toBe("decided");
    expect(kase([yes(), ev("case.reopened", null, "c1", { why: "stopped" }, 20)], 20).status).toBe("decided");
    // a person's stopped reopens
    const c = kase([yes(), ev("project.stopped", "u_own", "p_1", { why: "No budget" }, 4), ev("case.reopened", "u_own", "c1", { why: "stopped" }, 4)], 4);
    expect(c).toMatchObject({ status: "open", decided: null });
    expect(c.reopens[0]).toMatchObject({ why: "stopped", day: 4, by: "T. Vogel" });
    // a revisit of a yes, an unknown reason, an open case and a second reopen are ignored
    expect(kase([yes(), revisit(20)], 20).status).toBe("decided");
    expect(kase([decided, ev("case.reopened", null, "c1", { why: "other" }, 20)], 20).status).toBe("decided");
    expect(kase([revisit(2)], 2).reopens).toEqual([]);
    expect(kase([decided, revisit(20), revisit(21)], 21).reopens).toHaveLength(1);
  });

  it("NOR handover: Case.decisions keeps a second decision beside the first, and `decided` is the latest live one", () => {
    const c = kase([no({ category: "not-now", revisitDay: 20 }, 3), revisit(20), no({ category: "no-fit" }, 22)], 23);
    expect(c.decisions.map((x) => [x.category, x.day])).toEqual([["not-now", 3], ["no-fit", 22]]);
    expect(c.decided).toBe(c.decisions[1]);
    expect(c.status).toBe("decided");
    expect(c.notNowInRow).toBe(0); // the second decision was not a not-now
    expect(c.clock).toBe(2); // 22 - 20, the new cycle
    // one decision per cycle: the old decision is no longer the live one in between
    expect(kase([no({ category: "not-now" }, 3), revisit(20)], 21).decided).toBeNull();
  });

  it("NOR handover: Case.decisions - a yes after a stopped project opens a new project; one while the project is open does not; nothing is inherited from an earlier cycle", () => {
    const stopped = [yes(), ev("project.stopped", "u_own", "p_1", { why: "No budget" }, 4), ev("case.reopened", "u_own", "c1", { why: "stopped" }, 4)];
    const s = run([...stopped, ev("case.decided", "u_own", "c1", { answer: "yes", projectId: "p_2", lead: "H. Sander", leadUserId: "u_dep" }, 5)], 5);
    expect(s.cases[0].decisions.map((x) => x.projectId)).toEqual(["p_1", "p_2"]);
    expect(s.projects.map((p) => [p.id, p.status === "stopped"])).toEqual([["p_1", true], ["p_2", false]]);
    // a no in the new cycle does not inherit the old project
    expect(kase([...stopped, no({ category: "risk" }, 5)], 5).decided).toMatchObject({ answer: "no", projectId: null, lead: null });
    // while the first project is open a second yes (a replayed event) opens nothing
    const twice = run([yes(), ev("case.decided", "u_own", "c1", { answer: "yes", projectId: "p_9", lead: "T. Vogel" }, 2)], 3);
    expect(twice.projects.map((p) => p.id)).toEqual(["p_1"]);
  });

  it("NOR handover: case.appealed records the second look at a no, once, and only at a no", () => {
    const appealed = ev("case.appealed", "u_ra", "c1", { text: "  Please look again, the numbers changed  ", toRoleHolderId: "s_dep" }, 2);
    const c = kase([no({ category: "no-fit" }), appealed], 2);
    expect(c.appeal).toEqual({ text: "Please look again, the numbers changed", day: 2, by: "J. Schmidt", byUserId: "u_ra", seatId: "s_dep", decided: null });
    expect(c.status).toBe("decided");
    expect(kase([no({ category: "no-fit" }), ev("case.appealed", "u_ra", "c1", { text: "x" }, 2)], 2).appeal?.seatId).toBeNull(); // no desk set: unroutable until a manager assigns it
    expect(kase([no({ category: "no-fit" }), appealed, ev("case.appealed", "u_ra", "c1", { text: "A second try at it", toRoleHolderId: "s_head" }, 3)], 3).appeal?.text).toBe("Please look again, the numbers changed");
    expect(kase([appealed], 2).appeal).toBeNull(); // no decision
    expect(kase([yes(), appealed], 2).appeal).toBeNull(); // a yes
  });

  it("NOR handover: case.appeal.decided records the answer; uphold true keeps the no, uphold false reopens the case on the owner's desk", () => {
    const appealed = ev("case.appealed", "u_ra", "c1", { text: "Please look again, the numbers changed", toRoleHolderId: "s_dep" }, 2);
    const upheld = kase([no({ category: "no-fit" }), appealed, ev("case.appeal.decided", "u_dep", "c1", { uphold: true, reason: "The no stands" }, 3)], 4);
    expect(upheld.appeal?.decided).toEqual({ uphold: true, reason: "The no stands", by: "H. Sander", byUserId: "u_dep", day: 3 });
    expect(upheld).toMatchObject({ status: "decided", reopens: [] });
    expect(upheld.decided?.answer).toBe("no");
    // final: a second answer is ignored
    expect(kase([no({ category: "no-fit" }), appealed, ev("case.appeal.decided", "u_dep", "c1", { uphold: true, reason: "The no stands" }, 3), ev("case.appeal.decided", "u_dep", "c1", { uphold: false, reason: "Changed my mind" }, 4)], 5).status).toBe("decided");

    const reopened = kase([no({ category: "no-fit" }), appealed, ev("case.appeal.decided", "u_dep", "c1", { uphold: false, reason: "New numbers change it" }, 3)], 4);
    expect(reopened).toMatchObject({ status: "open", decided: null, cycleStartDay: 3, assigneeSeatId: "s_own", dueDay: 8 });
    expect(reopened.reopens).toEqual([{ why: "appeal", day: 3, by: "H. Sander" }]);
    expect(reopened.appeal?.decided?.uphold).toBe(false);
    expect(reopened.appeal?.text).toBe("Please look again, the numbers changed"); // kept: one second look per case
    expect(reopened.decisions).toHaveLength(1);
    // a missing or non-boolean uphold is no answer; there must be an appeal
    expect(kase([no({ category: "no-fit" }), appealed, ev("case.appeal.decided", "u_dep", "c1", { reason: "?" }, 3)], 3).appeal?.decided).toBeNull();
    expect(kase([no({ category: "no-fit" }), ev("case.appeal.decided", "u_dep", "c1", { uphold: false, reason: "No appeal" }, 3)], 3).status).toBe("decided");
  });

  it("NOR handover: the same-day no, appeal that reopens, new decision keeps both decisions in order and carries no old escalation", () => {
    const fact = ev("clock.due", null, "c1", { kind: "deadline", dueDay: 5, toRoleHolderId: "s_dep" }, 7);
    const sameDay = [
      ev("case.read", "u_own", "c1", {}, 7), fact, no({ category: "no-fit" }, 7),
      ev("case.appealed", "u_ra", "c1", { text: "Please look again, the numbers changed", toRoleHolderId: "s_dep" }, 7),
      ev("case.appeal.decided", "u_dep", "c1", { uphold: false, reason: "New numbers change it" }, 7),
    ];
    const reopened = kase(sameDay, 7, seed({}, true));
    expect(reopened.status).toBe("open");
    // the deadline fact came before the reopen on the same day: it belongs to the old cycle and does not escalate the new one
    expect(reopened.escalated).toBeNull();
    const again = kase([...sameDay, no({ category: "risk" }, 7)], 7, seed({}, true));
    expect(again.decisions.map((x) => x.category)).toEqual(["no-fit", "risk"]);
    expect(again.decided).toBe(again.decisions[1]);
    expect(again.decidedSeq! > again.reopenSeq!).toBe(true);
    expect(again.reopenSeq).toBe(again.history.findIndex((e) => e.type === "case.appeal.decided"));
    // a fact written after the reopen escalates the new cycle
    const factAfter = ev("clock.due", null, "c1", { kind: "deadline", dueDay: 12, toRoleHolderId: "s_head" }, 7);
    expect(kase([...sameDay, factAfter], 14, seed({}, true)).escalated).toMatchObject({ toSeatId: "s_head" });
    // the old fact alone still escalates the old cycle (no reopen)
    expect(kase([fact], 14, seed({}, true)).escalated).toMatchObject({ toSeatId: "s_dep" });
  });

  it("NOR handover: the workdays escalation reads only the facts after the last reopen, and a deadline hand-over of the old cycle ends nothing in the new one", () => {
    const wd = seed({}, true);
    const events = [
      ev("clock.due", null, "c1", { kind: "deadline", dueDay: 5, toRoleHolderId: "s_dep" }, 6),
      ev("case.handed", null, "c1", { to: "H. Sander", toRoleHolderId: "s_dep", why: "deadline" }, 6),
      no({ category: "not-now", revisitDay: 20 }, 8), revisit(20, { toRoleHolderId: "s_own" }),
      ev("clock.due", null, "c1", { kind: "deadline", dueDay: 25, toRoleHolderId: "s_dep" }, 26),
    ];
    // the new cycle's fact escalates although an old hand-over came later in the old cycle than its own fact
    expect(kase(events, 27, wd).escalated).toMatchObject({ toSeatId: "s_dep" });
    expect(kase(events.slice(0, 4), 27, wd).escalated).toBeNull(); // before the new fact: the old cycle's facts are not read
  });
});

describe("NOR reduce passes", () => {
  const pass = (by: string | null, payload: EventPayload = {}, day = 2, actor?: string) => {
    const e = ev("case.handed", by, "c1", { to: "H. Sander", toRoleHolderId: "s_dep", why: "It belongs to Quality", ...payload }, day);
    return actor ? { ...e, actor } : e;
  };

  it("NOR handover: Case.passes counts the passes by people, managers included, and not the clock's or a system actor's", () => {
    expect(kase([pass("u_own")], 3).passes).toBe(1);
    expect(kase([pass("u_own"), pass("u_dep", { to: "E. Wagner", toRoleHolderId: "s_o2" })], 3).passes).toBe(2);
    expect(kase([pass("u_mgr")], 3).passes).toBe(1);
    expect(kase([pass(null, { why: "deadline" })], 3).passes).toBe(0); // the clock
    expect(kase([pass("u_own", {}, 2, "system:mail")], 3).passes).toBe(0); // a system actor with an id
    expect(kase([ev("case.handed", "u_own", "c1", { why: "no seat named" }, 2)], 3).passes).toBe(0); // not applied: no `to`
    // each applied pass is in `handed` too
    expect(kase([pass("u_own"), pass("u_dep")], 3).handed).toHaveLength(2);
  });

  it("NOR handover: a pass records the seat it came from, and back and up", () => {
    const c = kase([
      pass("u_own", { to: "H. Sander", toRoleHolderId: "s_dep" }, 2),
      pass("u_dep", { to: "T. Vogel", toRoleHolderId: "s_own", back: true, why: "Not mine, wrong desk" }, 3),
      pass("u_own", { to: "K. Head", toRoleHolderId: "s_head", up: true, why: "Send it up please" }, 4),
    ], 5);
    expect(c.handed.map((h) => [h.fromSeatId, h.toSeatId, h.back, h.up])).toEqual([["s_own", "s_dep", false, false], ["s_dep", "s_own", true, false], ["s_own", "s_head", false, true]]);
    expect(c.passes).toBe(3);
    expect(c.assigneeSeatId).toBe("s_head");
  });

  it("NOR handover: a pass with routeId moves the case's route, an unknown route changes nothing", () => {
    const moved = kase([pass("u_own", { to: "E. Wagner", toRoleHolderId: "s_o2", routeId: "r2" })], 3);
    expect(moved.routeId).toBe("r2");
    expect(moved.route?.id).toBe("r2");
    // later deadlines go to the new route's deputy: the case on the owner's desk escalates to r2's deputy seat
    const wd = kase([pass("u_own", { to: "E. Wagner", toRoleHolderId: "s_o2", routeId: "r2" }), ev("clock.due", null, "c1", { kind: "deadline", dueDay: 5, toRoleHolderId: "s_own" }, 6)], 8, seed({}, true));
    expect(wd.escalated).toMatchObject({ toSeatId: "s_own" });
    expect(kase([pass("u_own", { routeId: "r_gone" })], 3).routeId).toBe("r1");
    expect(kase([pass("u_own")], 3).routeId).toBe("r1");
  });

  it("NOR handover: a pass with dueDay keeps a floor of the answer date; the highest floor wins; without it nothing changes", () => {
    const plain = kase([], 4);
    expect(plain.dueDay).toBe(5);
    const floored = kase([pass("u_own", { dueDay: 8 }, 4)], 4);
    expect(floored.dueFloor).toBe(8);
    expect(floored.dueDay).toBe(8);
    expect(floored.overdue).toBe(false);
    expect(kase([pass("u_own", { dueDay: 8 }, 3), pass("u_dep", { dueDay: 6, to: "E. Wagner", toRoleHolderId: "s_o2" }, 4)], 4).dueFloor).toBe(8);
    expect(kase([pass("u_own", { dueDay: 3 }, 2)], 4).dueDay).toBe(5); // a floor below the date changes nothing
    expect(kase([pass("u_own", { dueDay: 8 }, 4)], 9).overdue).toBe(true); // late on the floor
    expect(kase([pass("u_own")], 4).dueFloor).toBeNull();
    // a reopen starts the floor again
    expect(kase([pass("u_own", { dueDay: 80 }, 4), no({ category: "not-now" }, 5), revisit(20)], 20).dueFloor).toBeNull();
  });

  it("NOR handover: a pass with keepsQuestion moves an asked case and leaves the question open and the clock paused; without it the pass is ignored as before", () => {
    const asked = ev("case.asked", "u_own", "c1", { text: "Which line?" }, 1);
    const c = kase([asked, pass("u_own", { keepsQuestion: true }, 2)], 4);
    expect(c).toMatchObject({ status: "asked", assigneeSeatId: "s_dep", pausedSince: 1 });
    expect(c.question).toMatchObject({ text: "Which line?", answer: null });
    expect(c.passes).toBe(1);
    expect(c.clock).toBe(1); // paused since day 1: 4 - 0 - 3
    const answered = kase([asked, pass("u_own", { keepsQuestion: true }, 2), ev("case.answered", "u_ra", "c1", { text: "Line 3" }, 3)], 4);
    expect(answered).toMatchObject({ status: "open", assigneeSeatId: "s_dep" });
    expect(answered.question?.answer?.text).toBe("Line 3");
    const ignored = kase([asked, pass("u_own", {}, 2)], 4);
    expect(ignored).toMatchObject({ status: "asked", assigneeSeatId: "s_own", passes: 0, handed: [] });
  });

  it("NOR handover: case.invite.declined takes an invitee off the list, only an invitee, only in discussion", () => {
    const talk = ev("case.discussion", "u_own", "c1", { invited: ["I. Invitee"], invitedUserIds: ["u_inv"], missing: "A number" }, 1);
    const declined = ev("case.invite.declined", "u_inv", "c1", { why: "Not for me" }, 2);
    const c = kase([talk, declined], 3);
    expect(c.discussion?.declinedUserIds).toEqual(["u_inv"]);
    expect(c.discussion?.invitedUserIds).toEqual(["u_inv"]); // still invited; the view list leaves them out
    expect(kase([talk, declined, declined], 3).discussion?.declinedUserIds).toEqual(["u_inv"]); // once
    expect(kase([talk, ev("case.invite.declined", "u_dep", "c1", {}, 2)], 3).discussion?.declinedUserIds).toEqual([]); // not an invitee
    expect(kase([declined], 3).discussion).toBeNull(); // no discussion
    expect(kase([talk, ev("case.invited", "u_own", "c1", { invited: ["H. Sander"], invitedUserIds: ["u_dep"] }, 2), ev("case.invite.declined", "u_dep", "c1", {}, 3)], 3).discussion?.declinedUserIds).toEqual(["u_dep"]); // invited later
    expect(ROUTES).toHaveLength(2);
  });
});
