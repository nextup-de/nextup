// NOR-B1: who may append the events of "The reasoned no" (plan NOR, D12, D13, D16, D17, D18, D19, D21). Rights are checked at append
// time, against the reduced state; the states are a case from a raise, reduced, then given the NOR-G1 fields by hand.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import { reduce, type ReduceSeed, type ReducedCase, type State } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { parseInbound } from "@/features/integrations";

const seats: SeatRow[] = [
  { id: "s_own1", roleId: "role_owner", label: "Owner One", userId: "u_o1", sort: 0 },
  { id: "s_own2", roleId: "role_owner", label: "Owner Two", userId: "u_o2", sort: 1 },
  { id: "s_dep", roleId: "role_deputy", label: "Deputy", userId: "u_dep", sort: 2 },
  { id: "s_up", roleId: "role_up", label: "Above", userId: "u_up", sort: 3 },
  { id: "s_other", roleId: "role_other", label: "Other", userId: "u_other", sort: 4 },
  { id: "s_raiser", roleId: "role_member", label: "Raiser", userId: "u_raiser", sort: 5 },
];
const routes = LOCAL_SEED.routes.map((r) => {
  if (r.id === "r2") return { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_own1", deputyRoleId: "role_deputy", deputySeatId: "s_dep" };
  if (r.id === "r3") return { ...r, ownerRoleId: "role_other", ownerSeatId: "s_other", deputyRoleId: null, deputySeatId: null };
  return r;
});
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, clock: { mode: "workdays", calendar: DEFAULT_CALENDAR } };
const TODAY = 400;

let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string, payload: EventPayload = {}, day = TODAY): CaseEvent =>
  ({ id: "p" + n++, ts: 0, day, type, actor, actorUserId, target, payload });
const raise = () => ev("case.raised", "Raiser", "u_raiser", "c_a", { kind: "idea", title: "Shorter changeover", routeId: "r2", assignee: "Owner One", assigneeRoleHolderId: "s_own1" }, TODAY - 5);

const person = (userId: string, role: Actor["role"] = "leader"): Actor => ({ role, name: userId, handle: null, userId, me: meFor(userId, seats) });
const owner = person("u_o1");
const deputy = person("u_dep");
const above = person("u_up");
const raiser = person("u_raiser", "member");
const manager = person("u_mgr", "manager");

/** The case after `events`, with `patch` on top. */
function world(events: CaseEvent[] = [], patch: Partial<ReducedCase> = {}): { state: State; kase: ReducedCase } {
  const state = reduce(SEED, { events: [raise(), ...events], day: TODAY });
  const kase = state.cases.find((c) => c.id === "c_a");
  if (!kase) throw new Error("no case");
  Object.assign(kase, patch);
  return { state, kase };
}
const ask = (who: Actor, type: string, payload: EventPayload, state: State, target = "c_a") => mayAppend(who, { type, target, payload }, state);
const yes = (who: Actor, type: string, payload: EventPayload, state: State) => ask(who, type, payload, state).ok;
const errorOf = (who: Actor, type: string, payload: EventPayload, state: State): string => {
  const v = ask(who, type, payload, state);
  return v.ok ? "" : v.error;
};

const REASON = "The budget for this year is already spent on the new line.";
const decision = (over: Partial<NonNullable<ReducedCase["decided"]>> = {}): NonNullable<ReducedCase["decided"]> => ({
  answer: "no", reason: REASON, note: "", by: "Owner One", byUserId: "u_o1", day: TODAY - 2, category: "no-fit", changeIf: "", revisitDay: null, duplicateOf: null, ...over,
});

describe("NOR rights no", () => {
  const { state } = world();
  const no = (over: EventPayload = {}): EventPayload => ({ answer: "no", category: "no-fit", reason: REASON, ...over });

  it("accepts the case.decided no payload of D17, for every category the desk may pick", () => {
    expect(yes(owner, "case.decided", no(), state)).toBe(true);
    expect(yes(owner, "case.decided", no({ category: "risk" }), state)).toBe(true);
    expect(yes(owner, "case.decided", no({ category: "not-feasible", changeIf: "A design that does not need the crane" }), state)).toBe(true);
    expect(yes(owner, "case.decided", no({ category: "not-now", revisitDay: TODAY + 20 }), state)).toBe(true);
    expect(yes(owner, "case.decided", no({ category: "no-budget" }), state)).toBe(true);
    expect(yes(owner, "case.decided", no({ category: "no-budget", revisitDay: TODAY + 250, changeIf: "Budget next year" }), state)).toBe(true);
    expect(yes(owner, "case.decided", no({ category: "duplicate", duplicateOf: "c_other" }), state)).toBe(true);
    expect(yes(manager, "case.decided", no(), state)).toBe(true);
    // A yes is as it was, and so is a yes that opens a draft.
    expect(yes(owner, "case.decided", { answer: "yes" }, state)).toBe(true);
    expect(yes(owner, "case.decided", { answer: "yes", projectId: "p_one", lead: "Lead", leadUserId: "u_lead", draft: true, title: "P" }, state)).toBe(true);
  });

  it("refuses a no without a category, an old-shape no and an unknown category", () => {
    expect(errorOf(owner, "case.decided", { answer: "no", reason: REASON }, state)).toBe("Pick why you say no.");
    expect(yes(owner, "case.decided", { answer: "no", reason: "wrong department", note: "Ask again in spring" }, state)).toBe(false);
    expect(yes(owner, "case.decided", { answer: "no" }, state)).toBe(false);
    for (const category of ["maybe", "wrong-department", "no-time", "", 7, null]) expect(yes(owner, "case.decided", no({ category: category as never }), state), String(category)).toBe(false);
  });

  it("refuses a reason under the company's fewest characters, and one that is too long", () => {
    expect(errorOf(owner, "case.decided", no({ reason: "x".repeat(39) }), state)).toBe("A no needs a reason of at least 40 characters.");
    expect(yes(owner, "case.decided", no({ reason: "x".repeat(40) }), state)).toBe(true);
    expect(yes(owner, "case.decided", no({ reason: "  " + "x".repeat(38) + "  " }), state)).toBe(false); // spaces do not count
    expect(yes(owner, "case.decided", no({ reason: undefined }), state)).toBe(false);
    expect(yes(owner, "case.decided", no({ reason: "x".repeat(2000) }), state)).toBe(true);
    expect(yes(owner, "case.decided", no({ reason: "x".repeat(2001) }), state)).toBe(false);
    // The rule is the company's: no_reason_min decides.
    const lax = { ...state, rules: { ...state.rules, noReasonMin: 20 } };
    expect(yes(owner, "case.decided", no({ reason: "x".repeat(20) }), lax)).toBe(true);
    expect(yes(owner, "case.decided", no({ reason: "x".repeat(19) }), lax)).toBe(false);
    expect(errorOf(owner, "case.decided", no({ reason: "short" }), { ...state, rules: { ...state.rules, noReasonMin: 120 } })).toContain("at least 120 characters");
  });

  it("limits what would make it a yes to 400 characters", () => {
    expect(yes(owner, "case.decided", no({ changeIf: "y".repeat(400) }), state)).toBe(true);
    expect(yes(owner, "case.decided", no({ changeIf: "y".repeat(401) }), state)).toBe(false);
    expect(yes(owner, "case.decided", no({ changeIf: 5 as never }), state)).toBe(false);
  });

  it("refuses a not-now without a revisit day, a revisit day on a category that takes none, and a day outside the range", () => {
    expect(errorOf(owner, "case.decided", no({ category: "not-now" }), state)).toBe("Not now needs the day it comes back.");
    for (const category of ["no-fit", "risk", "not-feasible", "duplicate"]) {
      expect(yes(owner, "case.decided", no({ category: category as never, revisitDay: TODAY + 5, duplicateOf: "c_other" }), state), category).toBe(false);
    }
    expect(errorOf(owner, "case.decided", no({ category: "no-fit", revisitDay: TODAY + 5 }), state)).toBe("Only Not now and No budget this year can come back on a day.");
    for (const revisitDay of [TODAY, TODAY - 1, TODAY + 251, 1.5, "soon", null]) {
      expect(yes(owner, "case.decided", no({ category: "not-now", revisitDay: revisitDay as never }), state), String(revisitDay)).toBe(false);
    }
    expect(yes(owner, "case.decided", no({ category: "not-now", revisitDay: TODAY + 1 }), state)).toBe(true);
    expect(errorOf(owner, "case.decided", no({ category: "no-budget", revisitDay: TODAY }), state)).toContain("at most 250 working days ahead");
  });

  it("refuses a third not-now in a row", () => {
    const twice = world([], { notNowInRow: 2 }).state;
    expect(yes(owner, "case.decided", no({ category: "not-now", revisitDay: TODAY + 5 }), twice)).toBe(false);
    expect(errorOf(owner, "case.decided", no({ category: "not-now", revisitDay: TODAY + 5 }), twice)).toContain("2 times in a row");
    expect(yes(owner, "case.decided", no({ category: "no-fit" }), twice)).toBe(true);
    expect(yes(owner, "case.decided", no({ category: "not-now", revisitDay: TODAY + 5 }), world([], { notNowInRow: 1 }).state)).toBe(true);
  });

  it("refuses a duplicate without a link, with the case's own id, and a link on another category", () => {
    expect(errorOf(owner, "case.decided", no({ category: "duplicate" }), state)).toBe("Pick a case or project you can see that already covers it.");
    for (const duplicateOf of ["", "c_a", 5, null, "x".repeat(65)]) expect(yes(owner, "case.decided", no({ category: "duplicate", duplicateOf: duplicateOf as never }), state), String(duplicateOf)).toBe(false);
    expect(yes(owner, "case.decided", no({ category: "no-fit", duplicateOf: "c_other" }), state)).toBe(false);
  });

  it("refuses a decision on a decided case, and lets a case that was reopened since be decided again", () => {
    const decided = world([], { status: "decided", decided: decision() }).state;
    expect(errorOf(owner, "case.decided", no(), decided)).toBe("This case is already decided.");
    expect(yes(manager, "case.decided", { answer: "yes" }, decided)).toBe(false);
    // After a reopen (D12) the case has no decision of this cycle: the older ones are kept, never the live one.
    const reopened = world([], { status: "open", decided: null, decisions: [decision()], reopens: [{ why: "revisit", day: TODAY, by: "system:clock" }] }).state;
    expect(yes(owner, "case.decided", no({ category: "risk" }), reopened)).toBe(true);
    expect(yes(owner, "case.decided", { answer: "yes" }, reopened)).toBe(true);
  });

  it("keeps the desk as it was: a person who does not hold the case may not decide it", () => {
    expect(yes(raiser, "case.decided", no(), state)).toBe(false);
    expect(yes(deputy, "case.decided", no(), state)).toBe(false);
  });
});

// ── pass ──────────────────────────────────────────────────────────────────────────────────────────────────────

const pass = (toSeat: string, over: EventPayload = {}): EventPayload => ({ to: seats.find((x) => x.id === toSeat)?.label ?? "", toRoleHolderId: toSeat, why: "It is the other desk's area", ...over });
const passed = (from: string, fromSeatId: string | null, toSeatId: string, extra: { back?: boolean; up?: boolean } = {}) =>
  ({ from, fromUserId: null, to: "x", toSeatId, why: "A pass of the past", day: 1, fromSeatId, back: false, up: false, ...extra });

describe("NOR rights pass", () => {
  it("needs a why of 8 characters after trimming", () => {
    const { state } = world();
    expect(yes(owner, "case.handed", pass("s_other"), state)).toBe(true);
    expect(errorOf(owner, "case.handed", pass("s_other", { why: "Too few" }), state)).toContain("at least 8 characters");
    expect(yes(owner, "case.handed", pass("s_other", { why: "   Too few  " }), state)).toBe(false);
    expect(yes(owner, "case.handed", pass("s_other", { why: undefined }), state)).toBe(false);
    expect(yes(manager, "case.handed", pass("s_other", { why: "short" }), state)).toBe(false);
    expect(yes(owner, "case.handed", pass("s_other", { why: "12345678" }), state)).toBe(true);
  });

  it("needs keepsQuestion on an asked case, and a case in any other state does not move", () => {
    const asked = world([], { status: "asked" }).state;
    expect(errorOf(owner, "case.handed", pass("s_other"), asked)).toContain("question on this case is still open");
    expect(yes(owner, "case.handed", pass("s_other", { keepsQuestion: true }), asked)).toBe(true);
    expect(yes(manager, "case.handed", pass("s_other"), asked)).toBe(false);
    for (const status of ["decided", "withdrawn", "shipped", "building"] as const) expect(yes(manager, "case.handed", pass("s_other", { keepsQuestion: true }), world([], { status }).state), status).toBe(false);
    expect(yes(owner, "case.handed", pass("s_other"), world([], { status: "discussion" }).state)).toBe(true);
  });

  it("Not mine goes only back to the seat the case came from, once, and only for the desk the pass reached", () => {
    const reached = world([], { passes: 1, assigneeSeatId: "s_dep", assigneeRoleId: "role_deputy", handed: [passed("Owner One", "s_own1", "s_dep")] }).state;
    const back = pass("s_own1", { back: true });
    expect(yes(deputy, "case.handed", back, reached)).toBe(true);
    // Another seat than the one it came from, a forged destination, a person who does not hold the seat it reached.
    expect(yes(deputy, "case.handed", pass("s_other", { back: true }), reached)).toBe(false);
    expect(errorOf(deputy, "case.handed", pass("s_up", { back: true }), reached)).toContain("Not mine goes back, once");
    expect(yes(owner, "case.handed", back, reached)).toBe(false);
    expect(yes(manager, "case.handed", back, reached)).toBe(false);
    // Once: a pass that was itself sent back is not refused again.
    const bounced = world([], { passes: 2, assigneeSeatId: "s_own1", assigneeRoleId: "role_owner", handed: [passed("Owner One", "s_own1", "s_dep"), passed("Deputy", "s_dep", "s_own1", { back: true })] }).state;
    expect(yes(owner, "case.handed", pass("s_dep", { back: true }), bounced)).toBe(false);
    // Nothing was passed to the case: there is nobody to send it back to. A pass the clock made came from no seat.
    expect(yes(owner, "case.handed", back, world().state)).toBe(false);
    expect(yes(deputy, "case.handed", back, world([], { passes: 1, assigneeSeatId: "s_dep", handed: [passed("system:clock", null, "s_dep")] }).state)).toBe(false);
    // A pass cannot be Not mine and Send up at once.
    expect(yes(deputy, "case.handed", pass("s_own1", { back: true, up: true }), reached)).toBe(false);
  });

  it("after two passes a non-manager may only send up, and a manager passes freely", () => {
    const limit = world([], { passes: 2 }).state;
    expect(errorOf(owner, "case.handed", pass("s_other"), limit)).toContain("passed 2 times");
    expect(yes(owner, "case.handed", pass("s_up", { up: true }), limit)).toBe(true);
    expect(yes(manager, "case.handed", pass("s_other"), limit)).toBe(true);
    expect(yes(owner, "case.handed", pass("s_other"), world([], { passes: 1 }).state)).toBe(true);
    // The limit holds for Not mine too: it counts as a pass.
    const reached = world([], { passes: 2, assigneeSeatId: "s_dep", assigneeRoleId: "role_deputy", handed: [passed("A", "s_other", "s_own1"), passed("Owner One", "s_own1", "s_dep")] }).state;
    expect(yes(deputy, "case.handed", pass("s_own1", { back: true }), reached)).toBe(false);
  });

  it("accepts a route only when it belongs to the seat the pass goes to, and the date floor only as the rule computes it", () => {
    const { state, kase } = world();
    // r3 is owned by s_other; r2's deputy is s_dep.
    expect(yes(owner, "case.handed", pass("s_other", { routeId: "r3" }), state)).toBe(true);
    expect(yes(owner, "case.handed", pass("s_dep", { routeId: "r2" }), state)).toBe(true);
    expect(errorOf(owner, "case.handed", pass("s_other", { routeId: "r2" }), state)).toContain("route does not belong");
    expect(yes(owner, "case.handed", pass("s_other", { routeId: "r_unknown" }), state)).toBe(false);
    expect(yes(owner, "case.handed", pass("s_other", { routeId: 5 as never }), state)).toBe(false);
    // dueDay: today + 2 when the answer date is nearer, and none when it is not: another number is forged.
    const near = world([], { dueDay: TODAY + 1 }).state;
    expect(yes(owner, "case.handed", pass("s_other", { dueDay: TODAY + 2 }), near)).toBe(true);
    expect(errorOf(owner, "case.handed", pass("s_other", { dueDay: TODAY + 9 }), near)).toContain("set by the rule");
    expect(yes(owner, "case.handed", pass("s_other"), near)).toBe(true); // omitted: the server stamps it
    kase.dueDay = TODAY + 5;
    expect(yes(owner, "case.handed", pass("s_other", { dueDay: TODAY + 2 }), state)).toBe(false);
  });

  it("keeps the clock's reasons out of a person's pass, and the seat that must exist", () => {
    const { state } = world();
    expect(yes(owner, "case.handed", pass("s_other", { why: "deadline" }), state)).toBe(false);
    expect(yes(owner, "case.handed", pass("s_unknown"), state)).toBe(false);
    expect(yes(raiser, "case.handed", pass("s_other"), state)).toBe(false);
  });

  it("the integration API refuses a pass under 8 characters and one with back or up", () => {
    const handed = { type: "case.handed", target: "c_a", payload: { to: "Other", why: "The owner is away" } };
    expect(parseInbound(handed).ok).toBe(true);
    expect(parseInbound({ ...handed, payload: { to: "Other", why: "Too few" } }).ok).toBe(false);
    expect(parseInbound({ ...handed, payload: { to: "Other" } }).ok).toBe(false);
    for (const flag of ["back", "up", "keepsQuestion"]) expect(parseInbound({ ...handed, payload: { ...handed.payload, [flag]: true } }).ok, flag).toBe(false);
  });
});

// ── appeal, reopen and the rest ───────────────────────────────────────────────────────────────────────────────

const TEXT = "The quote came in at 4000 euro, please look again at it.";
const appeal = (over: Partial<NonNullable<ReducedCase["appeal"]>> = {}): NonNullable<ReducedCase["appeal"]> =>
  ({ text: TEXT, day: TODAY - 1, by: "Raiser", byUserId: "u_raiser", seatId: "s_dep", decided: null, ...over });
const decidedNo = (over: Partial<ReducedCase> = {}) => ({ status: "decided", decided: decision(), ...over }) as Partial<ReducedCase>;

describe("NOR rights appeal reopen and stamps", () => {
  it("only the raiser asks for a second look, once, within appeal_days of a no, in 20 to 1000 characters", () => {
    const { state } = world([], decidedNo());
    expect(yes(raiser, "case.appealed", { text: TEXT }, state)).toBe(true);
    expect(yes(owner, "case.appealed", { text: TEXT }, state)).toBe(false);
    expect(yes(manager, "case.appealed", { text: TEXT }, state)).toBe(false);
    expect(errorOf(owner, "case.appealed", { text: TEXT }, state)).toContain("Only the person who raised");
    // Once.
    expect(errorOf(raiser, "case.appealed", { text: TEXT }, world([], decidedNo({ appeal: appeal() })).state)).toContain("already asked");
    // The window: appeal_days working days after the day of the no (default 10), the last day counting.
    const edge = world([], decidedNo({ decided: decision({ day: TODAY - 10 }) })).state;
    const late = world([], decidedNo({ decided: decision({ day: TODAY - 11 }) })).state;
    expect(yes(raiser, "case.appealed", { text: TEXT }, edge)).toBe(true);
    expect(errorOf(raiser, "case.appealed", { text: TEXT }, late)).toContain("within 10 working days");
    expect(yes(raiser, "case.appealed", { text: TEXT }, { ...late, rules: { ...late.rules, appealDays: 30 } })).toBe(true);
    // Text: 20 to 1000 characters.
    for (const text of ["x".repeat(19), "  " + "x".repeat(18) + "  ", "", undefined]) expect(yes(raiser, "case.appealed", { text: text as never }, state), String(text)).toBe(false);
    expect(yes(raiser, "case.appealed", { text: "x".repeat(20) }, state)).toBe(true);
    expect(yes(raiser, "case.appealed", { text: "x".repeat(1000) }, state)).toBe(true);
    expect(yes(raiser, "case.appealed", { text: "x".repeat(1001) }, state)).toBe(false);
    // No no, no second look: a yes, an open case, a case that has been reopened.
    expect(yes(raiser, "case.appealed", { text: TEXT }, world([], { status: "decided", decided: decision({ answer: "yes", category: null }) }).state)).toBe(false);
    expect(yes(raiser, "case.appealed", { text: TEXT }, world().state)).toBe(false);
  });

  it("only the second-look desk, its escalated seat or a manager answers, never the person who said no", () => {
    const pending = world([], decidedNo({ appeal: appeal() })).state;
    const answer = { uphold: true, reason: REASON };
    expect(yes(deputy, "case.appeal.decided", answer, pending)).toBe(true);
    expect(yes(manager, "case.appeal.decided", answer, pending)).toBe(true);
    expect(yes(owner, "case.appeal.decided", answer, pending)).toBe(false);
    expect(yes(raiser, "case.appeal.decided", answer, pending)).toBe(false);
    expect(yes(above, "case.appeal.decided", answer, pending)).toBe(false); // the seat above only once the clock brought it in
    expect(errorOf(owner, "case.appeal.decided", answer, pending)).toContain("never the person who said no");
    // The escalation (check 2) names the seat above.
    const up = world([ev("clock.due", "system:clock", null, "c_a", { kind: "appeal", check: 2, dueDay: TODAY, toRoleHolderId: "s_up" })], decidedNo({ appeal: appeal() })).state;
    expect(yes(above, "case.appeal.decided", answer, up)).toBe(true);
    // The no-sayer is refused by user id, also as a manager and also when they hold the desk's role or the escalated seat.
    const managerNo = world([], decidedNo({ decided: decision({ byUserId: "u_mgr" }), appeal: appeal() })).state;
    expect(yes(manager, "case.appeal.decided", answer, managerNo)).toBe(false);
    expect(yes(deputy, "case.appeal.decided", answer, managerNo)).toBe(true);
    const deputyNo = world([], decidedNo({ decided: decision({ byUserId: "u_dep" }), appeal: appeal() })).state;
    expect(yes(deputy, "case.appeal.decided", answer, deputyNo)).toBe(false);
    expect(yes(manager, "case.appeal.decided", answer, deputyNo)).toBe(true);
    // Nothing to answer, an answer that is no answer, a reason under the company's fewest characters.
    expect(yes(deputy, "case.appeal.decided", answer, world([], decidedNo()).state)).toBe(false);
    expect(yes(deputy, "case.appeal.decided", answer, world([], decidedNo({ appeal: appeal({ decided: { uphold: true, reason: "x", by: "x", byUserId: "u_dep", day: TODAY } }) })).state)).toBe(false);
    expect(yes(deputy, "case.appeal.decided", { uphold: "yes" as never, reason: REASON }, pending)).toBe(false);
    expect(yes(deputy, "case.appeal.decided", { uphold: false, reason: "x".repeat(39) }, pending)).toBe(false);
    expect(yes(deputy, "case.appeal.decided", { uphold: false, reason: "x".repeat(40) }, pending)).toBe(true);
  });

  it("case.reopened with why revisit is refused for people; why stopped goes to the stopper or a manager on a stopped project's yes", () => {
    const revisit = { why: "revisit", dueDay: TODAY + 10, toRoleHolderId: "s_own1" };
    const sheet = world([], decidedNo({ decided: decision({ revisitDay: TODAY - 1, category: "not-now" }) })).state;
    for (const who of [owner, manager, raiser, deputy]) expect(yes(who, "case.reopened", revisit, sheet)).toBe(false);
    expect(errorOf(manager, "case.reopened", revisit, sheet)).toContain("Only the clock");
    // A stopped project's idea: the case's yes opened the project, which was stopped by its lead.
    const opened = [
      ev("case.decided", "Owner One", "u_o1", "c_a", { answer: "yes", projectId: "p_x", lead: "Lead", leadUserId: "u_lead", title: "P" }),
      ev("project.stopped", "Lead", "u_lead", "p_x", { why: "The line closes in March" }),
    ];
    const stopped = world(opened).state;
    expect(stopped.projects.find((p) => p.id === "p_x")?.status).toBe("stopped");
    const back = { why: "stopped" };
    expect(yes(person("u_lead"), "case.reopened", back, stopped)).toBe(true);
    expect(yes(manager, "case.reopened", back, stopped)).toBe(true);
    for (const who of [owner, raiser, deputy]) expect(yes(who, "case.reopened", back, stopped), who.name).toBe(false);
    // Not on a running project, a no, or a case whose latest decision is no longer that yes.
    expect(yes(manager, "case.reopened", back, world([opened[0]]).state)).toBe(false);
    expect(yes(manager, "case.reopened", back, world([], decidedNo()).state)).toBe(false);
    expect(yes(manager, "case.reopened", back, world([...opened], { decided: decision({ answer: "yes", projectId: "p_other", category: null }) }).state)).toBe(false);
  });

  it("case.invite.declined only by an invitee who has not declined yet, in a discussion, with at most 300 characters why", () => {
    const talk = ev("case.discussion", "Owner One", "u_o1", "c_a", { invited: ["Invitee"], invitedUserIds: ["u_i1", "u_i2"], missing: "The saving" }, TODAY - 3);
    const { state, kase } = world([talk], { status: "discussion" });
    const invitee = person("u_i1", "member");
    expect(yes(invitee, "case.invite.declined", {}, state)).toBe(true);
    expect(yes(invitee, "case.invite.declined", { why: "Not my area" }, state)).toBe(true);
    expect(yes(invitee, "case.invite.declined", { why: "x".repeat(301) }, state)).toBe(false);
    expect(yes(invitee, "case.invite.declined", { why: 5 as never }, state)).toBe(false);
    for (const who of [owner, manager, raiser, person("u_stranger", "member")]) expect(yes(who, "case.invite.declined", {}, state), who.name).toBe(false);
    kase.discussion!.declinedUserIds = ["u_i1"];
    expect(errorOf(invitee, "case.invite.declined", {}, state)).toContain("already said");
    expect(yes(person("u_i2", "member"), "case.invite.declined", {}, state)).toBe(true);
    // Not on a case that is not in a discussion.
    expect(yes(invitee, "case.invite.declined", {}, world([talk], { status: "decided", decided: decision() }).state)).toBe(false);
  });

  it("case.override is a manager's, on an open or asked case, to a route the company has", () => {
    const { state } = world();
    expect(yes(manager, "case.override", { proposed: "r2", chosen: "r3" }, state)).toBe(true);
    expect(yes(owner, "case.override", { proposed: "r2", chosen: "r3" }, state)).toBe(false);
    expect(yes(manager, "case.override", { proposed: "r2", chosen: "r_unknown" }, state)).toBe(false);
    expect(yes(manager, "case.override", { proposed: "r2" }, state)).toBe(false);
    expect(yes(manager, "case.override", { proposed: "r2", chosen: "r3" }, world([], { status: "asked" }).state)).toBe(true);
    for (const status of ["discussion", "decided", "withdrawn"] as const) expect(yes(manager, "case.override", { chosen: "r3" }, world([], { status }).state), status).toBe(false);
  });

  it("after the discussion's last day, invited, checkin, revised and commented are refused; a decision, a pass and a question stay", () => {
    const talk = ev("case.discussion", "Owner One", "u_o1", "c_a", { invited: ["Invitee"], invitedUserIds: ["u_i1"], missing: "The saving" }, TODAY - 12);
    const during = world([talk], { status: "discussion" });
    during.kase.discussion!.lastDay = TODAY + 1;
    const after = world([talk], { status: "discussion" });
    after.kase.discussion!.lastDay = TODAY - 1;
    const events: [Actor, string, EventPayload][] = [
      [owner, "case.invited", { invited: ["Someone"], invitedUserIds: ["u_x"] }],
      [owner, "case.checkin", { next: "decide", open: [], note: "Ready" }],
      [raiser, "case.revised", { body: "A better version" }],
      [manager, "case.commented", { text: "One more thought" }],
    ];
    for (const [who, type, payload] of events) {
      expect(yes(who, type, payload, during.state), `${type} during`).toBe(true);
      expect(errorOf(who, type, payload, after.state), `${type} after`).toContain("The discussion has ended");
    }
    // A decision, a pass and a question are still allowed.
    expect(yes(owner, "case.decided", { answer: "no", category: "no-fit", reason: REASON }, after.state)).toBe(true);
    expect(yes(owner, "case.handed", pass("s_other"), after.state)).toBe(true);
    expect(yes(owner, "case.asked", { text: "Which line?" }, after.state)).toBe(true);
    // A case that is not in a discussion has no last day.
    const open = world();
    expect(yes(manager, "case.commented", { text: "A comment" }, open.state)).toBe(true);
  });
});
