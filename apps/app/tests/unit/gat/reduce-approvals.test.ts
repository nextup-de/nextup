// GAT-A2 (B1): the reducers keep an approval run and its steps; a new draft waits for the last approval and starts counting from it (plan GAT,
// D20 to D23, D32). Each test is a fixed log with the server's stamps (run and step ids, due days, limits, seats) written out. Flat top-level tests (D36).
import { expect, it } from "vitest";
import { EMPTY_APPROVAL_CONFIG } from "@/features/approvals/types";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type ReducedCase, type State } from "@/features/cases/reducer";
import type { Route, SeedRole } from "@/features/demo/types";
import type { ReducedProject } from "@/features/projects/types";

const SEATS: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "T. Vogel", userId: "u_own", sort: 0 },
  { id: "s_lead", roleId: "role_lead", label: "L. Brandt", userId: "u_lb", sort: 1 },
  { id: "s_plant", roleId: "role_plant", label: "P. Plant", userId: "u_plant", sort: 2 },
  { id: "s_sec", roleId: "role_sec", label: "S. Secretary", userId: "u_sec", sort: 3 },
  { id: "s_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 4 },
];
const ROLES: SeedRole[] = [
  { id: "role_head", orgUnitId: "u", reportsToId: null, title: "Director" },
  { id: "role_plant", orgUnitId: "u", reportsToId: "role_head", title: "Plant manager", spendLimitEur: 25_000 },
  { id: "role_owner", orgUnitId: "u", reportsToId: "role_plant", title: "Quality lead", spendLimitEur: 5_000 },
  { id: "role_lead", orgUnitId: "u", reportsToId: "role_plant", title: "Line lead" },
  { id: "role_sec", orgUnitId: "u", reportsToId: "role_plant", title: "Secretary" },
];
const ROUTES: Route[] = [{
  id: "r1", type: "Type", keys: ["k"], owner: { name: "T. Vogel", role: "Owner", dept: "PRD" }, deputy: "L. Brandt", buddy: "B", wait: "2 days",
  ownerSeatId: "s_own", ownerRoleId: "role_owner", deputySeatId: "s_lead", deputyRoleId: "role_lead",
}];
const COUNCIL = { id: "k1", name: "Investment council", memberRoleIds: ["role_plant"], secretaryRoleId: "role_sec", everyDays: 10, firstDay: 20 };
const SEED: ReduceSeed = {
  cases: [], ideas: [], problems: [], routes: ROUTES, promiseDays: 5, seats: SEATS, roles: ROLES,
  approvals: { ...EMPTY_APPROVAL_CONFIG, councils: [COUNCIL] },
};

const NAME: Record<string, string> = { u_own: "T. Vogel", u_lb: "L. Brandt", u_plant: "P. Plant", u_sec: "S. Secretary", u_head: "K. Head", u_ra: "J. Schmidt" };
const ev = (id: string, type: CaseEventType, by: string | null, target: string, payload: EventPayload, day: number, actor?: string): CaseEvent =>
  ({ id, ts: 0, type, actor: actor ?? (by === null ? "system:clock" : NAME[by]), actorUserId: by, target, payload, day });
const raise = (day = 0) =>
  ev("raise_ca", "case.raised", "u_ra", "ca", { kind: "idea", title: "Shorter changeover", body: "b", routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "s_own", fromDept: "PRD" }, day);

const STEPS = [{ kind: "budget" as const, roleId: "role_plant", coversUpToEur: 25_000 }, { kind: "council" as const, councilId: "k1" }];
/** case.provisional: the desk's yes that waits for approval, as the server stamped it; its event id is the run id. */
const provisional = (id: string, day: number, extra: EventPayload = {}) =>
  ev(id, "case.provisional", "u_own", "ca", {
    approvals: STEPS, stepDueDay: 9, costEur: 12_000, decidingRoleId: "role_owner", projectId: "p1", lead: "T. Vogel", leadUserId: "u_own", title: "Shorter changeover", draft: true, ...extra,
  }, day);
const answer = (id: string, runId: string, index: number, dueRev: number, approvalAnswer: "yes" | "conditions" | "back" | "no", by: string, day: number, extra: EventPayload = {}) =>
  ev(id, "case.approval", by, "ca", { runId, stepId: `${runId}:${index}`, dueRev, step: index, approvalAnswer, reason: "", ...extra }, day);
/** The settle operation's decision: an ordinary case.decided by system:approvals. */
const settle = (id: string, day: number, payload: EventPayload) => ev(id, "case.decided", null, "ca", payload, day, "system:approvals");
const NO = { answer: "no" as const, category: "no-fit" as const, reason: "It does not serve a goal of this year and it would break the gauge standard" };

const run = (day: number, ...events: CaseEvent[]): State => reduce(SEED, { events, day });
const caseOf = (s: State): ReducedCase => s.cases.find((c) => c.id === "ca") as ReducedCase;
const project = (s: State, id = "p1"): ReducedProject => s.projects.find((p) => p.id === id) as ReducedProject;

it("GAT reduce approvals opens a waiting draft and takes the case off the desk", () => {
  const s = run(10, raise(), provisional("prov", 1));
  const c = caseOf(s);
  expect(c.status).toBe("approval");
  expect([c.open, c.archived, c.overdue, c.escalated, c.decided]).toEqual([false, false, false, null, null]);
  expect(c.approvals).toMatchObject({ runId: "prov", deciderUserId: "u_own", decidingRoleId: "role_owner", since: 1, projectId: "p1", opened: true, supplement: false, costEur: 12_000, done: false, outcome: null });
  expect(c.approvals?.steps).toEqual([
    { kind: "budget", roleId: "role_plant", coversUpToEur: 25_000, id: "prov:0", state: "pending", dueDay: 9, dueRev: 0, seatId: null, answers: [] },
    { kind: "council", councilId: "k1", id: "prov:1", state: "pending", dueDay: null, dueRev: 0, seatId: null, answers: [] },
  ]);
  // One draft, waiting: no start day and no escalation.
  expect(s.projects).toHaveLength(1);
  expect(project(s)).toMatchObject({ draft: true, waitsForApproval: true, startDay: null, status: "planning", escalated: null, deciderUserId: "u_own" });
  // The promise clock stands still while the run goes on.
  expect(caseOf(run(3, raise(), provisional("prov", 1))).clock).toBe(c.clock);
  // Nobody else decides it, and the settle operation cannot decide a case that waits for nothing; a yes needs every step answered.
  const byPerson = run(10, raise(), provisional("prov", 1), ev("d1", "case.decided", "u_own", "ca", { answer: "yes", projectId: "p1" }, 2));
  expect([caseOf(byPerson).status, caseOf(byPerson).decided]).toEqual(["approval", null]);
  const early = run(10, raise(), provisional("prov", 1), settle("d2", 2, { answer: "yes", projectId: "p1" }));
  expect([caseOf(early).status, caseOf(early).decided]).toEqual(["approval", null]);
  const open = run(10, raise(), settle("d3", 2, NO));
  expect([caseOf(open).status, caseOf(open).decided]).toEqual(["open", null]); // system:approvals decides only a run
  // A second provisional while a run is active, and one on a withdrawn case, start nothing.
  expect(caseOf(run(10, raise(), provisional("prov", 1), provisional("prov2", 2))).approvals?.runId).toBe("prov");
  expect(caseOf(run(10, raise(), ev("w", "case.withdrawn", "u_ra", "ca", {}, 1), provisional("prov", 2))).approvals).toBeNull();
});

it("GAT reduce approvals moves through a budget and a council step in order", () => {
  const base = [raise(), provisional("prov", 1)];
  const first = caseOf(run(10, ...base, answer("a1", "prov", 0, 0, "yes", "u_plant", 2, { nextStepDueDay: 20 })));
  expect(first.approvals?.steps.map((x) => [x.state, x.dueDay])).toEqual([["yes", 9], ["pending", 20]]);
  expect(first.approvals?.steps[0].answers).toEqual([{ answer: "yes", reason: "", conditions: null, present: null, day: 2, by: "P. Plant", byUserId: "u_plant" }]);
  // The council's answer carries how many were present, nothing about who voted how.
  const second = caseOf(run(21, ...base, answer("a1", "prov", 0, 0, "yes", "u_plant", 2, { nextStepDueDay: 20 }), answer("a2", "prov", 1, 0, "yes", "u_sec", 20, { present: 7 })));
  expect(second.approvals?.steps.map((x) => x.state)).toEqual(["yes", "yes"]);
  expect(second.approvals?.steps[1].answers[0]).toMatchObject({ present: 7, by: "S. Secretary", byUserId: "u_sec" });
  expect(second.status).toBe("approval"); // answered; the settle operation decides it
  expect(second.approvals?.done).toBe(false);
  // In order: the second step cannot be answered before the first.
  const early = caseOf(run(10, ...base, answer("a2", "prov", 1, 0, "yes", "u_sec", 2)));
  expect(early.approvals?.steps.map((x) => x.state)).toEqual(["pending", "pending"]);
});

it("GAT reduce approvals appends conditions to the brief", () => {
  const goal = ev("g", "project.goal", "u_own", "p1", { goal: "Changeover under 30 minutes", doneWhen: "Three changeovers in a row", brief: "Use the rig on line 3" }, 1);
  const s = run(10, raise(), provisional("prov", 1), goal,
    answer("a1", "prov", 0, 0, "conditions", "u_plant", 2, { conditions: "The quote stays under 12k", nextStepDueDay: 20 }),
    answer("a2", "prov", 1, 0, "conditions", "u_sec", 3, { conditions: "Report back at the next meeting" }));
  expect(project(s).goal?.brief).toBe("Use the rig on line 3\n\nConditions (Plant manager): The quote stays under 12k\n\nConditions (Investment council): Report back at the next meeting");
  expect(project(s).goal?.goal).toBe("Changeover under 30 minutes"); // the goal's own text stays as written
  expect(caseOf(s).approvals?.steps.map((x) => x.state)).toEqual(["conditions", "conditions"]);
  expect(caseOf(s).approvals?.steps[0].answers[0].conditions).toBe("The quote stays under 12k");
  // The goal written after the answer gets the conditions too; a yes adds none.
  const later = run(10, raise(), provisional("prov", 1), answer("a1", "prov", 0, 0, "conditions", "u_plant", 2, { conditions: "Keep it under 12k" }), goal);
  expect(project(later).goal?.brief).toBe("Use the rig on line 3\n\nConditions (Plant manager): Keep it under 12k");
  expect(project(run(10, raise(), provisional("prov", 1), goal, answer("a1", "prov", 0, 0, "yes", "u_plant", 2))).goal?.brief).toBe("Use the rig on line 3");
});

it("GAT reduce approvals moves the due day and dueRev on back", () => {
  const base = [raise(), provisional("prov", 1)];
  const back = caseOf(run(10, ...base, answer("b", "prov", 0, 0, "back", "u_plant", 3, { reason: "Please attach the quote", nextStepDueDay: 8 })));
  const step = back.approvals?.steps[0];
  expect([step?.state, step?.dueDay, step?.dueRev]).toEqual(["pending", 8, 1]);
  expect(step?.answers).toHaveLength(1);
  expect(step?.answers[0]).toMatchObject({ answer: "back", reason: "Please attach the quote", day: 3 });
  // The form opened before the send-back (revision 0) is stale; the new one (revision 1) answers.
  const stale = caseOf(run(10, ...base, answer("b", "prov", 0, 0, "back", "u_plant", 3, { nextStepDueDay: 8 }), answer("y", "prov", 0, 0, "yes", "u_plant", 4)));
  expect(stale.approvals?.steps[0].state).toBe("pending");
  const fresh = caseOf(run(10, ...base, answer("b", "prov", 0, 0, "back", "u_plant", 3, { nextStepDueDay: 8 }), answer("y", "prov", 0, 1, "yes", "u_plant", 4, { nextStepDueDay: 20 })));
  expect(fresh.approvals?.steps.map((x) => [x.state, x.dueRev, x.dueDay])).toEqual([["yes", 1, 8], ["pending", 0, 20]]);
  // A second send-back on the same day goes up again.
  const twice = caseOf(run(10, ...base, answer("b", "prov", 0, 0, "back", "u_plant", 3, { nextStepDueDay: 8 }), answer("b2", "prov", 0, 1, "back", "u_plant", 3, { nextStepDueDay: 8 })));
  expect(twice.approvals?.steps[0].dueRev).toBe(2);
});

it("GAT reduce approvals ignores an answer for another run step or dueRev", () => {
  const base = [raise(), provisional("prov", 1)];
  const states = (...extra: CaseEvent[]) => caseOf(run(10, ...base, ...extra)).approvals?.steps.map((x) => x.state);
  expect(states(answer("a", "other", 0, 0, "yes", "u_plant", 2))).toEqual(["pending", "pending"]); // another run
  expect(states(answer("a", "prov", 1, 0, "yes", "u_sec", 2))).toEqual(["pending", "pending"]); // a step that is not current
  expect(states(ev("a", "case.approval", "u_plant", "ca", { runId: "prov", stepId: "prov:9", dueRev: 0, approvalAnswer: "yes" }, 2))).toEqual(["pending", "pending"]); // an unknown step
  expect(states(answer("a", "prov", 0, 3, "yes", "u_plant", 2))).toEqual(["pending", "pending"]); // another revision
  expect(states(ev("a", "case.approval", "u_plant", "ca", { runId: "prov", stepId: "prov:0", dueRev: 0, approvalAnswer: "maybe" as "yes" }, 2))).toEqual(["pending", "pending"]); // not an answer
  // An answer on a case with no run, and on a finished run, changes nothing.
  expect(caseOf(run(10, raise(), answer("a", "prov", 0, 0, "yes", "u_plant", 2))).approvals).toBeNull();
  const done = caseOf(run(10, ...base, answer("a1", "prov", 0, 0, "yes", "u_plant", 2), answer("a2", "prov", 1, 0, "yes", "u_sec", 3), settle("d", 4, { answer: "yes", projectId: "p1" }), answer("a3", "prov", 1, 0, "no", "u_sec", 5)));
  expect(done.approvalRuns[0].steps.map((x) => x.state)).toEqual(["yes", "yes"]);
  // Nothing was written to the history by an answer that did not count.
  expect(caseOf(run(10, ...base, answer("a", "other", 0, 0, "yes", "u_plant", 2))).history.map((e) => e.type)).toEqual(["case.raised", "case.provisional"]);
});

it("GAT reduce approvals applies a late hand-over and a council fact of the current step revision only", () => {
  const fact = (id: string, payload: EventPayload, day: number) => ev(id, "clock.due", null, "ca", payload, day);
  const late = (stepId: string, origin = "prov") => fact("f" + stepId + origin, { kind: "approval", check: 2, dueDay: 9, toRoleHolderId: "s_head", originEventId: origin, stepId }, 12);
  const base = [raise(), provisional("prov", 1)];
  const step = (...extra: CaseEvent[]) => caseOf(run(14, ...base, ...extra)).approvals?.steps[0];
  expect(step(late("prov:0@0"))?.seatId).toBe("s_head"); // the current step at its current revision
  expect(step(late("prov:0@1"))?.seatId).toBeNull(); // a revision it is not at
  expect(step(late("prov:0@0", "other"))?.seatId).toBeNull(); // another run
  expect(step(late("prov:1@0"))?.seatId).toBeNull(); // a step that is not current
  expect(step(fact("f9", { kind: "approval", check: 1, dueDay: 9, toRoleHolderId: "s_head", originEventId: "prov", stepId: "prov:0@0" }, 12))?.seatId).toBeNull(); // not the hand-over check
  // A send-back moves the step to revision 1: the old fact no longer applies, the new one does. The fact stays in the case's history either way.
  const back = answer("b", "prov", 0, 0, "back", "u_plant", 3, { nextStepDueDay: 10 });
  expect(step(back, late("prov:0@0"))?.seatId).toBeNull();
  expect(step(back, late("prov:0@1"))?.seatId).toBe("s_head");
  expect(caseOf(run(14, ...base, late("prov:0@1"))).history.map((e) => e.type)).toContain("clock.due");
  // The council that did not meet: the step's day moves to the next meeting, for the current revision only.
  const first = answer("a1", "prov", 0, 0, "yes", "u_plant", 2, { nextStepDueDay: 20 });
  const council = (stepId: string) => fact("c" + stepId, { kind: "council", dueDay: 30, originEventId: "prov", stepId }, 21);
  const second = (...extra: CaseEvent[]) => caseOf(run(22, ...base, first, ...extra)).approvals?.steps[1];
  expect(second(council("prov:1@0"))?.dueDay).toBe(30);
  expect(second(council("prov:1@1"))?.dueDay).toBe(20);
  expect(second()?.dueDay).toBe(20);
});

it("GAT reduce approvals decides yes on the existing draft and counts the start day from the last approval", () => {
  const lead = { lead: "L. Brandt", leadUserId: "u_lb" };
  const answers = [answer("a1", "prov", 0, 0, "yes", "u_plant", 5, { nextStepDueDay: 20 }), answer("a2", "prov", 1, 0, "yes", "u_sec", 9)];
  const log = (takenDay: number) => [raise(), provisional("prov", 1, lead), ev("take", "project.lead.answered", "u_lb", "p1", { take: true }, takenDay), ...answers];
  const before = run(9, ...log(4));
  expect(project(before)).toMatchObject({ leadState: "taken", waitsForApproval: true, startDay: null }); // taken, but the draft waits
  const s = run(9, ...log(4), settle("d", 9, { answer: "yes", projectId: "p1" }));
  expect(s.projects).toHaveLength(1); // the draft the run opened, no second project
  expect(caseOf(s).decided).toMatchObject({ answer: "yes", projectId: "p1", lead: "L. Brandt", by: "system:approvals" });
  expect(caseOf(s).status).toBe("decided");
  expect(project(s)).toMatchObject({ waitsForApproval: false, approvalsPendingSince: 9, leadState: "taken", startDay: 9 + s.rules.projectStartDays });
  // The lead taking it after the last approval counts from the later day.
  const late = run(13, ...log(12), settle("d", 9, { answer: "yes", projectId: "p1" }));
  expect(project(late).startDay).toBe(12 + late.rules.projectStartDays);
});

it("GAT reduce approvals sets the opening run on the final yes", () => {
  const s = run(10, raise(), provisional("prov", 1), answer("a1", "prov", 0, 0, "yes", "u_plant", 2, { nextStepDueDay: 20 }), answer("a2", "prov", 1, 0, "conditions", "u_sec", 3, { conditions: "Report back" }), settle("d", 4, { answer: "yes", projectId: "p1" }));
  const c = caseOf(s);
  expect(c.openingRunId).toBe("prov");
  expect(c.approvals).toBeNull(); // the active run's place is free
  expect(c.approvalRuns).toHaveLength(1);
  expect(c.approvalRuns[0]).toMatchObject({ runId: "prov", done: true, outcome: "yes", opened: true, projectId: "p1" });
  expect(c.approvalRuns[0].steps.map((x) => x.state)).toEqual(["yes", "conditions"]);
  expect([c.status, c.archived, c.decided?.answer, c.decided?.projectId]).toEqual(["decided", true, "yes", "p1"]);
  // A second settle for the same run is ignored: the case is not waiting any more.
  const again = caseOf(run(10, raise(), provisional("prov", 1), answer("a1", "prov", 0, 0, "yes", "u_plant", 2, { nextStepDueDay: 20 }), answer("a2", "prov", 1, 0, "yes", "u_sec", 3), settle("d", 4, { answer: "yes", projectId: "p1" }), settle("d2", 5, NO)));
  expect(again.decided?.answer).toBe("yes");
  expect(again.decisions).toHaveLength(1);
});

it("GAT reduce approvals decides no and leaves no pending step", () => {
  const stop = ev("stop", "project.stopped", null, "p1", { why: NO.reason }, 4, "system:approvals");
  const s = run(10, raise(), provisional("prov", 1), answer("a1", "prov", 0, 0, "no", "u_plant", 3, { reason: NO.reason, category: "no-fit" }), settle("d", 3, NO), stop);
  const c = caseOf(s);
  expect(c.decided).toMatchObject({ answer: "no", category: "no-fit", reason: NO.reason, by: "system:approvals" });
  expect([c.status, c.archived, c.approvals, c.openingRunId]).toEqual(["decided", true, null, null]);
  expect(c.approvalRuns).toHaveLength(1);
  expect(c.approvalRuns[0]).toMatchObject({ done: true, outcome: "no" });
  expect(c.approvalRuns[0].steps[0]).toMatchObject({ state: "no" });
  expect(c.approvalRuns[0].steps[0].answers[0]).toMatchObject({ answer: "no", reason: NO.reason });
  // The draft does not wait any more, and is stopped by the settle operation's own event.
  expect(project(s)).toMatchObject({ waitsForApproval: false });
  expect(project(s).stopped).not.toBeNull();
  // No step is current any more: a late answer for the second step changes nothing.
  const after = caseOf(run(10, raise(), provisional("prov", 1), answer("a1", "prov", 0, 0, "no", "u_plant", 3), settle("d", 3, NO), answer("a2", "prov", 1, 0, "yes", "u_sec", 4)));
  expect(after.approvalRuns[0].steps[1]).toMatchObject({ state: "pending", answers: [] });
});
