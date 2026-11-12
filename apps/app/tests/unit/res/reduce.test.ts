// RES-A1: the project reducer after RES (D13, D14, D16, D17, D19) and the review's revision rules (12 Nov): a confirmation or a questioning
// names the revision of the number it is about, in the order of the log, so a stale one never closes or rewards its replacement.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { closingEvent } from "@/features/projects/close";
import type { LoopRules } from "@/features/loop/rules";
import type { ReducedProject } from "@/features/projects/types";

const UID: Record<string, string> = { "T. Vogel": "u_tv", "H. Sander": "u_hs", "L. Brandt": "u_lb", "B. Hartmann": "u_bh", "C. Ilg": "u_ci", "Anonymous #4471": "u_js" };
const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_hs", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 1 },
  { id: "seat_ci", roleId: "role_owner", label: "C. Ilg", userId: "u_ci", sort: 2 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner", deputySeatId: "seat_hs", deputyRoleId: "role_deputy" } : x));
let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "q" + n++, ts: 0, type, actor, actorUserId: UID[actor] ?? null, target, payload, day });
const P = (type: CaseEventType, payload: EventPayload = {}, day = 0, actor = "L. Brandt") => ev(type, actor, "p_m", payload, day);

const RAISED = ev("case.raised", "Anonymous #4471", "c_m", { kind: "idea", title: "Shorter changeover", body: "x", routeId: "r1", assignee: "T. Vogel" });
const yes = (lead = "L. Brandt", draft = false) =>
  ev("case.decided", "T. Vogel", "c_m", { answer: "yes", projectId: "p_m", lead, leadUserId: UID[lead], title: "Changeover cart", ...(draft ? { draft: true } : {}) });
const baseline = (day = 0, value = 42) => P("project.baseline", { metric: "Changeover", unit: "min", value, better: "down", source: "MES" }, day);

function world(events: CaseEvent[], loop: Partial<LoopRules> = {}, day?: number) {
  const seed: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, loop: { measureDays: [30], ...loop } };
  const log: EventLog = { events, day: day ?? events[events.length - 1]?.day ?? 0 };
  const state = reduce(seed, log);
  const project = state.projects.find((p) => p.id === "p_m")!;
  return { state, project, closing: closingEvent(project, state.rules) };
}
const stepsLog = (...more: CaseEvent[]) => [
  RAISED, yes(), baseline(), P("project.started", {}, 1),
  P("project.step.added", { stepId: "s1", text: "Order the cart" }, 1), P("project.step.added", { stepId: "s2", text: "Train the shift" }, 1),
  P("project.step.added", { stepId: "s3", text: "Already done", to: "done" }, 1), ...more,
];
/** Baselined at 42 (lower is better), started, done on day 2: the 30-day check is open. */
const doneLog = (...more: CaseEvent[]) => [RAISED, yes(), baseline(), P("project.started", {}, 1), P("project.done", {}, 2), ...more];

describe("RES reduce", () => {
  it("a done with openSteps finishes the ones listed as done and drops the others with their reason, and ignores the rest", () => {
    const done = P("project.done", { note: "Live", openSteps: [{ stepId: "s1", end: "done" }, { stepId: "s2", end: "dropped", why: " no longer needed " }, { stepId: "s3", end: "dropped", why: "x" }, { stepId: "nope", end: "done" }] }, 5, "L. Brandt");
    const { project: p } = world(stepsLog(done));
    expect(p.doneDay).toBe(5);
    const [s1, s2, s3] = p.steps;
    expect(s1).toMatchObject({ column: "done", doneDay: 5, movedDay: 5, dropped: null });
    expect(s2).toMatchObject({ column: "todo", doneDay: null, dropped: { why: "no longer needed", day: 5, byUserId: "u_lb" } });
    expect(s3).toMatchObject({ column: "done", dropped: null }); // done already: left alone
    expect(p.steps).toHaveLength(3);
  });

  it("a done without openSteps leaves the steps as they were (every old log)", () => {
    const { project: p } = world(stepsLog(P("project.done", { note: "Live" }, 5)));
    expect(p.doneDay).toBe(5);
    expect(p.steps.map((s) => [s.column, s.dropped])).toEqual([["todo", null], ["todo", null], ["done", null]]);
  });

  it("a first questioning sends the check back: not measured, due again promise days later, the project stays open and no reward is due", () => {
    const measured = P("project.measured", { check: 30, value: 30 }, 33);
    const { project: p } = world(doneLog(measured, P("project.measure.questioned", { check: 30, why: "Looks too good" }, 34, "H. Sander")));
    expect(p.measures[0]).toMatchObject({ value: 30, sentBack: true, reentered: false, managerOnly: false, confirmed: false, questions: [{ day: 34, why: "Looks too good", byUserId: "u_hs" }] });
    expect(p.checks[0]).toMatchObject({ check: 30, measured: false, dueDay: 34 + PROMISE_DAYS });
    expect(p).toMatchObject({ status: "measuring", closed: false, rewardDue: false, rewardDueDay: null, verdict: null });
  });

  it("the lead's re-entry replaces the number once, keeps the old one and starts the confirm clock again; a third result is ignored", () => {
    const first = P("project.measured", { check: 30, value: 30 }, 33);
    const again = P("project.measured", { check: 30, value: 28, measureEventId: first.id }, 36);
    const { project: p } = world(doneLog(first, P("project.measure.questioned", { check: 30, why: "Check the unit" }, 34, "H. Sander"), again, P("project.measured", { check: 30, value: 10 }, 37)));
    expect(p.measures).toHaveLength(1);
    expect(p.measures[0]).toMatchObject({ value: 28, day: 36, sentBack: false, reentered: true, confirmed: false, eventId: again.id, previous: [{ value: 30, day: 33, byUserId: "u_lb" }] });
    expect(p.measures[0].verdict).toBe("better");
    expect(p).toMatchObject({ status: "measured", rewardDue: false }); // not confirmed yet
    expect(p.history.map((e) => e.id)).toEqual(expect.arrayContaining([first.id, again.id])); // both events stay in the history
  });

  it("a re-entry that names a replaced revision, or comes when nothing was sent back, is ignored", () => {
    const first = P("project.measured", { check: 30, value: 30 }, 33);
    expect(world(doneLog(first, P("project.measured", { check: 30, value: 25 }, 34))).project.measures[0]).toMatchObject({ value: 30, reentered: false });
    const sent = [first, P("project.measure.questioned", { check: 30, why: "x" }, 34, "H. Sander")];
    expect(world(doneLog(...sent, P("project.measured", { check: 30, value: 25, measureEventId: "someone-else" }, 35))).project.measures[0]).toMatchObject({ value: 30, sentBack: true });
  });

  it("a second questioning, after the re-entry, makes the result managers-only; a third and any after that are ignored", () => {
    const first = P("project.measured", { check: 30, value: 30 }, 33);
    const log = [
      first, P("project.measure.questioned", { check: 30, why: "one" }, 34, "H. Sander"),
      P("project.measured", { check: 30, value: 28 }, 36),
      P("project.measure.questioned", { check: 30, why: "two" }, 37, "H. Sander"),
      P("project.measure.questioned", { check: 30, why: "three" }, 38, "H. Sander"),
    ];
    const { project: p } = world(doneLog(...log));
    expect(p.measures[0]).toMatchObject({ managerOnly: true, sentBack: false, reentered: true });
    expect(p.measures[0].questions.map((q) => q.why)).toEqual(["one", "two"]);
    expect(p.checks[0].measured).toBe(true); // the re-entered number stands until a manager confirms it
  });

  it("a questioning of a confirmed result, or of a revision that was replaced, is ignored", () => {
    const first = P("project.measured", { check: 30, value: 30 }, 33);
    const confirmed = world(doneLog(first, P("project.measure.confirmed", { check: 30 }, 34, "B. Hartmann"), P("project.measure.questioned", { check: 30, why: "late" }, 35, "H. Sander"))).project;
    expect(confirmed.measures[0]).toMatchObject({ confirmed: true, sentBack: false, questions: [] });
    const replaced = world(doneLog(first, P("project.measure.questioned", { check: 30, why: "one" }, 34, "H. Sander"), P("project.measured", { check: 30, value: 28 }, 35),
      P("project.measure.questioned", { check: 30, why: "about the old number", measureEventId: first.id }, 36, "H. Sander"))).project;
    expect(replaced.measures[0]).toMatchObject({ managerOnly: false, questions: [{ why: "one" }] });
  });

  it("a confirmation for a replaced number never confirms its replacement, whatever the day; one for the new number does", () => {
    const first = P("project.measured", { check: 30, value: 30 }, 33);
    const again = P("project.measured", { check: 30, value: 28 }, 36);
    const base = [first, P("project.measure.questioned", { check: 30, why: "x" }, 34, "H. Sander"), again];
    // the confirmation of the old number comes after the re-entry, on the same day
    const stale = world(doneLog(...base, P("project.measure.confirmed", { check: 30, measureEventId: first.id }, 36, "B. Hartmann"))).project;
    expect(stale.measures[0]).toMatchObject({ confirmed: false, confirmedDay: null });
    expect(stale).toMatchObject({ rewardDue: false, rewardDueDay: null, closed: false });
    // the one for the new number, the same day, is taken
    const fresh = world(doneLog(...base, P("project.measure.confirmed", { check: 30, measureEventId: again.id }, 36, "B. Hartmann"))).project;
    expect(fresh.measures[0]).toMatchObject({ confirmed: true, confirmedDay: 36, confirmedByUserId: "u_bh" });
    // one that was written while the number was sent back confirms nothing
    const early = world(doneLog(first, P("project.measure.questioned", { check: 30, why: "x" }, 34, "H. Sander"), P("project.measure.confirmed", { check: 30 }, 34, "B. Hartmann"))).project;
    expect(early.measures[0]).toMatchObject({ confirmed: false, sentBack: true });
  });

  it("rewardDueDay is the day the confirmation made the reward due, the later of the result's day and the confirmation's", () => {
    const measured = P("project.measured", { check: 30, value: 30 }, 33);
    expect(world(doneLog(measured)).project).toMatchObject({ rewardDue: false, rewardDueDay: null });
    const p = world(doneLog(measured, P("project.measure.confirmed", { check: 30 }, 35, "B. Hartmann"))).project;
    expect(p).toMatchObject({ status: "measured", rewardDue: true, rewardDueDay: 35 });
    // a confirmation on the day of the result
    expect(world(doneLog(measured, P("project.measure.confirmed", { check: 30 }, 33, "B. Hartmann"))).project.rewardDueDay).toBe(33);
    // the reward is given: not due any more
    expect(world(doneLog(measured, P("project.measure.confirmed", { check: 30 }, 35, "B. Hartmann"), P("project.rewarded", {}, 36))).project.rewardDueDay).toBeNull();
  });

  it("closingEvent names the re-entry for a number entered again, even when it has the same value on the same day, and ignores a stale confirmation", () => {
    const none = { reward: { kind: "none" as const, amount: null, sharePct: null, capEur: null } };
    const first = P("project.measured", { check: 30, value: 30 }, 33);
    const again = P("project.measured", { check: 30, value: 30 }, 33);
    const w = world(doneLog(first, P("project.measure.questioned", { check: 30, why: "x" }, 33, "H. Sander"), again), none);
    expect(w.project.closed).toBe(true);
    expect(w.closing?.id).toBe(again.id);
    // with a reward possible and the result worse, the confirmation of the number that stands closes it; one for the old number does not
    const worse = P("project.measured", { check: 30, value: 45 }, 33);
    const worseAgain = P("project.measured", { check: 30, value: 46 }, 34);
    const stale = P("project.measure.confirmed", { check: 30, measureEventId: worse.id }, 34, "B. Hartmann");
    const open = world(doneLog(worse, P("project.measure.questioned", { check: 30, why: "x" }, 34, "H. Sander"), worseAgain, stale));
    expect(open.project).toMatchObject({ closed: false, status: "measured" });
    const good = P("project.measure.confirmed", { check: 30, measureEventId: worseAgain.id }, 35, "B. Hartmann");
    const closed = world(doneLog(worse, P("project.measure.questioned", { check: 30, why: "x" }, 34, "H. Sander"), worseAgain, stale, good));
    expect(closed.project.closed).toBe(true);
    expect(closed.closing?.id).toBe(good.id);
  });

  // The sponsor of the draft: the decider asks someone else to lead, invites a sponsor, who accepts.
  const withSponsor = (...more: CaseEvent[]) => [
    RAISED, yes("L. Brandt", true), P("project.lead.answered", { take: true }, 0, "L. Brandt"),
    P("project.invited", { userId: "u_hs", role: "sponsor" }, 0, "L. Brandt"),
    ev("project.invite.answered", "H. Sander", "p_m", { userId: "u_hs", take: true }, 0), baseline(), P("project.started", {}, 1),
    P("project.step.added", { stepId: "s1", text: "Order the cart" }, 1), ...more,
  ];

  it("a help ask goes to the accepted sponsor, and is answered by the sponsor's next comment, not by someone else's", () => {
    const ask = P("project.help.asked", { stepId: "s1", text: "I need a budget decision" }, 3);
    const open = world(withSponsor(ask, P("project.commented", { text: "me" }, 4, "L. Brandt"))).project;
    expect(open.sponsorUserId).toBe("u_hs");
    expect(open.helpAsks).toEqual([{ id: ask.id, stepId: "s1", text: "I need a budget decision", day: 3, byUserId: "u_lb", toUserId: "u_hs", toRoleId: null, answeredDay: null }]);
    const answered = world(withSponsor(ask, P("project.commented", { text: "Approved" }, 5, "H. Sander"))).project;
    expect(answered.helpAsks[0].answeredDay).toBe(5);
    // a comment before the ask does not answer it
    expect(world(withSponsor(P("project.commented", { text: "early" }, 2, "H. Sander"), ask)).project.helpAsks[0].answeredDay).toBeNull();
  });

  it("without a sponsor the ask goes to the route owner's role, and to the deputy's when the lead holds the owner seat; a holder of that role answers", () => {
    const ask = P("project.help.asked", { stepId: "s1", text: "Stuck" }, 3);
    const legacy = [RAISED, yes(), baseline(), P("project.started", {}, 1), P("project.step.added", { stepId: "s1", text: "Order the cart" }, 1), ask];
    const open = world(legacy).project;
    expect(open.helpAsks[0]).toMatchObject({ toUserId: null, toRoleId: "role_owner", answeredDay: null });
    // C. Ilg holds the same role on another seat
    expect(world([...legacy, P("project.commented", { text: "On it" }, 4, "C. Ilg")]).project.helpAsks[0].answeredDay).toBe(4);
    expect(world([...legacy, P("project.commented", { text: "On it" }, 4, "H. Sander")]).project.helpAsks[0].answeredDay).toBeNull();
    // the lead is the owner of the route: the deputy's role is asked
    const ownerLeads = [RAISED, yes("T. Vogel"), baseline(), P("project.started", {}, 1, "T. Vogel"), P("project.step.added", { stepId: "s1", text: "Order" }, 1, "T. Vogel"), P("project.help.asked", { stepId: "s1", text: "Stuck" }, 3, "T. Vogel")];
    expect(world(ownerLeads).project.helpAsks[0]).toMatchObject({ toUserId: null, toRoleId: "role_deputy" });
  });

  it("an ask ends with its step: done, dropped or removed, or when the project is no longer running", () => {
    const ask = P("project.help.asked", { stepId: "s1", text: "Stuck" }, 3);
    const base = [RAISED, yes(), baseline(), P("project.started", {}, 1), P("project.step.added", { stepId: "s1", text: "Order the cart" }, 1), P("project.step.added", { stepId: "s2", text: "Other" }, 1), ask];
    expect(world([...base, P("project.step.moved", { stepId: "s1", to: "done" }, 6)]).project.helpAsks[0].answeredDay).toBe(6);
    expect(world([...base, P("project.step.edited", { stepId: "s1", removed: true }, 7)]).project.helpAsks[0].answeredDay).toBe(7);
    expect(world([...base, P("project.done", { openSteps: [{ stepId: "s1", end: "dropped", why: "x" }, { stepId: "s2", end: "done" }] }, 8)]).project.helpAsks[0].answeredDay).toBe(8);
    expect(world([...base, P("project.stopped", { why: "x" }, 9)]).project.helpAsks[0].answeredDay).toBe(9);
    // other steps do not end it
    expect(world([...base, P("project.step.moved", { stepId: "s2", to: "done" }, 6)]).project.helpAsks[0].answeredDay).toBeNull();
  });

  it("an ask on a step that is done, dropped or unknown, or before the start, is not taken", () => {
    const log = [RAISED, yes(), baseline(), P("project.step.added", { stepId: "s1", text: "A" }, 1), P("project.step.added", { stepId: "s2", text: "B", to: "done" }, 1),
      P("project.help.asked", { stepId: "s1", text: "too early" }, 1), P("project.started", {}, 1),
      P("project.help.asked", { stepId: "s2", text: "done step" }, 2), P("project.help.asked", { stepId: "nope", text: "unknown" }, 2), P("project.help.asked", { stepId: "s1", text: "  " }, 2)];
    expect(world(log).project.helpAsks).toEqual([]);
  });
});

describe("RES handover", () => {
  const started = (...more: CaseEvent[]): CaseEvent[] => [RAISED, yes(), ...more];

  it("RES handover: project.baseline.confirmed sets the baseline's confirmation, a new baseline clears it, and the reducer never refuses an old start", () => {
    const b1 = baseline(0);
    const confirmed = P("project.baseline.confirmed", {}, 1, "H. Sander");
    const p = world(started(b1, confirmed)).project;
    expect(p.baseline).toMatchObject({ none: false, byUserId: "u_lb", eventId: b1.id, confirmed: { byUserId: "u_hs", day: 1 } });
    // a new baseline clears it, and carries its own identity
    const b2 = baseline(2, 40);
    const edited = world(started(b1, confirmed, b2)).project.baseline;
    expect(edited).toMatchObject({ value: 40, eventId: b2.id, confirmed: null });
    // the old start: no confirmation anywhere, a reward possible: the reducer still starts it
    const old = world(started(b1, P("project.started", {}, 3)), { reward: { kind: "gift", amount: 50, sharePct: null, capEur: null }, recognition: true, measure: true }).project;
    expect(old).toMatchObject({ status: "running", startedDay: 3 });
    expect(old.baseline).toMatchObject({ confirmed: null });
  });

  it("a confirmation that names a baseline since replaced is ignored (the form was open while it was edited), a repeat keeps the first", () => {
    const b1 = baseline(0);
    const b2 = baseline(1, 40);
    const stale = P("project.baseline.confirmed", { baselineEventId: b1.id }, 2, "H. Sander");
    expect(world(started(b1, b2, stale)).project.baseline).toMatchObject({ eventId: b2.id, confirmed: null });
    const good = P("project.baseline.confirmed", { baselineEventId: b2.id }, 2, "H. Sander");
    const again = P("project.baseline.confirmed", { baselineEventId: b2.id }, 3, "B. Hartmann");
    expect(world(started(b1, b2, stale, good, again)).project.baseline).toMatchObject({ confirmed: { byUserId: "u_hs", day: 2 } });
    // an edit after the confirmation, on the same day, clears it again: the order of the log decides
    const b3 = baseline(2, 38);
    expect(world(started(b1, b2, good, b3)).project.baseline).toMatchObject({ eventId: b3.id, confirmed: null });
  });

  it("a baseline without a number cannot be confirmed, nor can one after the start", () => {
    const none = P("project.baseline", { none: true, why: "nothing to measure" }, 0);
    expect(world(started(none, P("project.baseline.confirmed", {}, 1, "H. Sander"))).project.baseline).toMatchObject({ none: true, confirmed: null });
    const b1 = baseline(0);
    expect(world(started(b1, P("project.started", {}, 1), P("project.baseline.confirmed", {}, 2, "H. Sander"))).project.baseline).toMatchObject({ confirmed: null });
  });
});
