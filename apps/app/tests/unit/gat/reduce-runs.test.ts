// GAT-A2 (B2): joins, refused approvals, second runs and supplement runs in the reducers (plan GAT, D20, D21, D32, D33). A join opens no draft and
// leaves its project as it was until the final yes; a refused run can be asked again after a second look; a supplement run waits the draft again
// without touching the decision. Each test is a fixed log with the server's stamps written out. Flat top-level tests (D36).
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
  { id: "s_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 3 },
];
const ROLES: SeedRole[] = [
  { id: "role_head", orgUnitId: "u", reportsToId: null, title: "Director" },
  { id: "role_plant", orgUnitId: "u", reportsToId: "role_head", title: "Plant manager", spendLimitEur: 25_000 },
  { id: "role_owner", orgUnitId: "u", reportsToId: "role_plant", title: "Quality lead", spendLimitEur: 5_000 },
  { id: "role_lead", orgUnitId: "u", reportsToId: "role_plant", title: "Line lead" },
];
const ROUTES: Route[] = [{
  id: "r1", type: "Type", keys: ["k"], owner: { name: "T. Vogel", role: "Owner", dept: "PRD" }, deputy: "L. Brandt", buddy: "B", wait: "2 days",
  ownerSeatId: "s_own", ownerRoleId: "role_owner", deputySeatId: "s_lead", deputyRoleId: "role_lead",
}];
const SEED: ReduceSeed = { cases: [], ideas: [], problems: [], routes: ROUTES, promiseDays: 5, seats: SEATS, roles: ROLES, approvals: { ...EMPTY_APPROVAL_CONFIG } };

const NAME: Record<string, string> = { u_own: "T. Vogel", u_lb: "L. Brandt", u_plant: "P. Plant", u_head: "K. Head", u_ra: "J. Schmidt", u_rx: "M. Roth" };
const ev = (id: string, type: CaseEventType, by: string | null, target: string, payload: EventPayload, day: number, actor?: string): CaseEvent =>
  ({ id, ts: 0, type, actor: actor ?? (by === null ? "system:clock" : NAME[by]), actorUserId: by, target, payload, day });
const raise = (id: string, by: string, day = 0) =>
  ev("raise_" + id, "case.raised", by, id, { kind: "idea", title: "Case " + id, body: "b", routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "s_own", fromDept: "PRD" }, day);

const ONE = [{ kind: "budget" as const, roleId: "role_plant", coversUpToEur: 25_000 }];
const provisional = (id: string, day: number, extra: EventPayload = {}) =>
  ev(id, "case.provisional", "u_own", "ca", { approvals: ONE, stepDueDay: 9, costEur: 12_000, decidingRoleId: "role_owner", projectId: "p1", lead: "T. Vogel", leadUserId: "u_own", title: "Case ca", draft: true, ...extra }, day);
const answer = (id: string, runId: string, index: number, approvalAnswer: "yes" | "conditions" | "back" | "no", by: string, day: number, extra: EventPayload = {}) =>
  ev(id, "case.approval", by, "ca", { runId, stepId: `${runId}:${index}`, dueRev: 0, step: index, approvalAnswer, reason: "", ...extra }, day);
const settle = (id: string, day: number, payload: EventPayload) => ev(id, "case.decided", null, "ca", payload, day, "system:approvals");
const NO = { answer: "no" as const, category: "no-fit" as const, reason: "It does not serve a goal of this year and it would break the gauge standard" };

// A project somebody else's idea opened with an ordinary yes (a join target); it runs once its baseline and its start are in.
const OTHER_YES = [
  raise("cx", "u_rx"),
  ev("yes_cx", "case.decided", "u_lb", "cx", { answer: "yes", projectId: "p9", lead: "L. Brandt", leadUserId: "u_lb", title: "Rig on line 3" }, 0),
];
const STARTED = [
  ev("base", "project.baseline", "u_lb", "p9", { metric: "Minutes", unit: "min", value: 45, better: "down", source: "stopwatch" }, 1),
  ev("start", "project.started", "u_lb", "p9", {}, 1),
];
const JOIN = { projectId: "p9", draft: true, lead: "L. Brandt", leadUserId: "u_lb", title: "Case ca" };

const run = (day: number, ...events: CaseEvent[]): State => reduce(SEED, { events, day });
const caseOf = (s: State): ReducedCase => s.cases.find((c) => c.id === "ca") as ReducedCase;
const project = (s: State, id = "p1"): ReducedProject => s.projects.find((p) => p.id === id) as ReducedProject;
/** What a join must leave alone before its final yes. */
const shape = (p: ReducedProject) => ({ sources: p.sources, authors: p.authors, status: p.status, waits: p.waitsForApproval ?? false, stopped: p.stopped, startedDay: p.startedDay, members: p.memberUserIds, draft: p.draft, leadUserId: p.leadUserId, history: p.history.length });

for (const [name, started] of [["planning", false], ["running", true]] as const) {
  it(`GAT reduce runs joins a ${name} project only on the final yes`, () => {
    const target = [...OTHER_YES, ...(started ? STARTED : [])];
    const untouched = shape(project(run(10, ...target, raise("ca", "u_ra")), "p9"));
    const waiting = run(10, ...target, raise("ca", "u_ra"), provisional("prov", 2, JOIN));
    expect(project(waiting, "p9").status).toBe(started ? "running" : "planning");
    expect(waiting.projects).toHaveLength(1); // no draft opened
    expect(shape(project(waiting, "p9")), "the target project is not changed at all").toEqual(untouched);
    expect(caseOf(waiting)).toMatchObject({ status: "approval", approvals: { opened: false, projectId: "p9", supplement: false } });
    // The final yes links the case to the project, as SET's join does, and changes nothing else of it.
    const joined = run(10, ...target, raise("ca", "u_ra"), provisional("prov", 2, JOIN), answer("a1", "prov", 0, "yes", "u_plant", 3), settle("d", 3, { answer: "yes", projectId: "p9" }));
    expect(joined.projects).toHaveLength(1);
    expect(project(joined, "p9").sources).toEqual(["cx", "ca"]);
    expect(project(joined, "p9").authors).toContain("J. Schmidt");
    expect(project(joined, "p9")).toMatchObject({ status: started ? "running" : "planning", stopped: null, draft: false });
    expect(project(joined, "p9").waitsForApproval ?? false).toBe(false);
    expect(project(joined, "p9").startedDay).toBe(started ? 1 : null);
    expect(caseOf(joined)).toMatchObject({ status: "decided", openingRunId: "prov", approvals: null });
    expect(caseOf(joined).decided).toMatchObject({ answer: "yes", projectId: "p9" });
  });
}

it("GAT reduce runs stops nothing when a join is refused", () => {
  const log = [...OTHER_YES, ...STARTED, raise("ca", "u_ra"), provisional("prov", 2, JOIN), answer("a1", "prov", 0, "no", "u_plant", 3, { reason: NO.reason })];
  const untouched = shape(project(run(10, ...OTHER_YES, ...STARTED, raise("ca", "u_ra")), "p9"));
  const refused = run(10, ...log, settle("d", 3, NO));
  expect(caseOf(refused)).toMatchObject({ status: "decided", approvals: null, openingRunId: null });
  expect(caseOf(refused).decided).toMatchObject({ answer: "no", category: "no-fit" });
  expect(caseOf(refused).approvalRuns[0]).toMatchObject({ done: true, outcome: "no", opened: false });
  expect(shape(project(refused, "p9"))).toEqual(untouched); // still running, not stopped, not joined
  expect(project(refused, "p9").sources).toEqual(["cx"]);
  expect(refused.projects.map((p) => p.id)).toEqual(["p9"]);
});

it("GAT reduce runs starts a second run after a second look on the same day", () => {
  const day = 5;
  const first = [raise("ca", "u_ra"), provisional("prov1", day), answer("a1", "prov1", 0, "no", "u_plant", day, { reason: NO.reason }), settle("d1", day, NO),
    ev("stop", "project.stopped", null, "p1", { why: NO.reason }, day, "system:approvals")];
  const second = [ev("ask", "case.appealed", "u_ra", "ca", { text: "The quote came in lower, please look again", toRoleHolderId: "s_lead" }, day),
    ev("look", "case.appeal.decided", "u_lb", "ca", { uphold: false, reason: "The new quote changes it" }, day)];
  const reopened = run(day, ...first, ...second);
  expect(caseOf(reopened)).toMatchObject({ status: "open", approvals: null });
  expect(caseOf(reopened).approvalRuns.map((r) => r.runId)).toEqual(["prov1"]);
  // The desk's new yes, on the same day, starts a run of its own for a new draft; the first draft stays stopped.
  const again = run(day, ...first, ...second, provisional("prov2", day, { projectId: "p2" }), answer("b1", "prov2", 0, "yes", "u_plant", day), settle("d2", day, { answer: "yes", projectId: "p2" }));
  const c = caseOf(again);
  expect(c.approvalRuns.map((r) => [r.runId, r.outcome, r.done])).toEqual([["prov1", "no", true], ["prov2", "yes", true]]);
  expect([c.approvals, c.openingRunId, c.status, c.decided?.projectId]).toEqual([null, "prov2", "decided", "p2"]);
  expect(c.approvalRuns[1].steps[0].id).toBe("prov2:0");
  expect(project(again, "p1").stopped).not.toBeNull();
  expect(project(again, "p2")).toMatchObject({ stopped: null, waitsForApproval: false, approvalsPendingSince: day });
  // While the second run is going, the first stays in the history and the second is the active one.
  const live = caseOf(run(day, ...first, ...second, provisional("prov2", day, { projectId: "p2" })));
  expect([live.approvals?.runId, live.approvalRuns.map((r) => r.runId), live.status]).toEqual(["prov2", ["prov1"], "approval"]);
});

// A case decided yes on its own draft after one run; the draft is planning and has not started.
const DECIDED = [raise("ca", "u_ra"), provisional("prov1", 2), answer("a1", "prov1", 0, "yes", "u_plant", 3), settle("d1", 3, { answer: "yes", projectId: "p1" })];
const SUPPLEMENT = { supplement: true, approvals: [{ kind: "budget" as const, roleId: "role_head", coversUpToEur: null }], stepDueDay: 14, costEur: 40_000 };
const supplement = (id: string, day: number, extra: EventPayload = {}) =>
  ev(id, "case.provisional", "u_own", "ca", { ...SUPPLEMENT, decidingRoleId: "role_owner", ...extra }, day);

it("GAT reduce runs keeps the decision during a supplement run", () => {
  const before = run(12, ...DECIDED);
  expect(project(before)).toMatchObject({ waitsForApproval: false, startDay: expect.any(Number) });
  const s = run(12, ...DECIDED, supplement("sup1", 10));
  const c = caseOf(s);
  expect([c.status, c.decided?.answer, c.decided?.projectId, c.openingRunId]).toEqual(["decided", "yes", "p1", "prov1"]); // the decision and the opening run stand
  expect(c.archived).toBe(true);
  expect(c.approvals).toMatchObject({ runId: "sup1", supplement: true, opened: true, projectId: "p1", costEur: 40_000, done: false });
  expect(c.approvals?.steps[0]).toMatchObject({ id: "sup1:0", roleId: "role_head", coversUpToEur: null, dueDay: 14, state: "pending" });
  expect(c.approvalRuns.map((r) => r.runId)).toEqual(["prov1"]);
  expect(s.projects).toHaveLength(1);
  expect(project(s)).toMatchObject({ waitsForApproval: true, startDay: null, stopped: null }); // the draft waits again
  // A supplement is not a second decision: nobody's case.decided counts while it runs, and the settle operation writes none for it.
  const settled = caseOf(run(12, ...DECIDED, supplement("sup1", 10), answer("c1", "sup1", 0, "yes", "u_head", 11), settle("d2", 11, { answer: "yes", projectId: "p1" })));
  expect(settled.decisions).toHaveLength(1);
  // It asks nothing of a case that is not decided yes, and a started project takes none.
  expect(caseOf(run(12, raise("ca", "u_ra"), supplement("sup0", 2))).approvals).toBeNull();
  const started = [...DECIDED, ev("base", "project.baseline", "u_own", "p1", { metric: "Minutes", unit: "min", value: 45, better: "down", source: "stopwatch" }, 5), ev("start", "project.started", "u_own", "p1", {}, 6)];
  expect(project(run(12, ...started), "p1").startedDay).toBe(6);
  expect(caseOf(run(12, ...started, supplement("sup1", 10))).approvals).toBeNull();
});

it("GAT reduce runs ends a supplement run on its last yes", () => {
  const s = run(20, ...DECIDED, supplement("sup1", 10), answer("c1", "sup1", 0, "conditions", "u_head", 12, { conditions: "Report the saving after a month" }));
  const c = caseOf(s);
  expect(c.approvals).toBeNull();
  expect(c.approvalRuns.map((r) => [r.runId, r.outcome, r.done, r.supplement])).toEqual([["prov1", "yes", true, false], ["sup1", "yes", true, true]]);
  expect(c.approvalRuns[1].steps[0].state).toBe("conditions");
  expect([c.status, c.decided?.answer, c.openingRunId, c.decisions.length]).toEqual(["decided", "yes", "prov1", 1]); // no second decision, the opening run stays
  expect(project(s)).toMatchObject({ waitsForApproval: false, approvalsPendingSince: 12 });
  // The start day counts from the later approval.
  expect(project(s).startDay).toBe(12 + s.rules.projectStartDays);
});

it("GAT reduce runs ends a refused supplement and keeps the decision and the draft", () => {
  const refused = run(20, ...DECIDED, supplement("sup1", 10), answer("c1", "sup1", 0, "no", "u_head", 12, { reason: "No money for it this year" }));
  const c = caseOf(refused);
  expect(c.approvals).toBeNull();
  expect(c.approvalRuns.map((r) => [r.runId, r.outcome, r.supplement])).toEqual([["prov1", "yes", false], ["sup1", "no", true]]);
  expect(c.approvalRuns[1].steps[0]).toMatchObject({ state: "no" });
  expect(c.decided).toMatchObject({ answer: "yes", projectId: "p1" }); // the decision stays
  expect([c.status, c.openingRunId]).toEqual(["decided", "prov1"]);
  expect(project(refused)).toMatchObject({ stopped: null, waitsForApproval: false, draft: true }); // the draft stays
  expect(refused.projects).toHaveLength(1);
  // The lead may ask again: the refused run does not hold the place.
  const again = caseOf(run(20, ...DECIDED, supplement("sup1", 10), answer("c1", "sup1", 0, "no", "u_head", 12), supplement("sup2", 13)));
  expect([again.approvals?.runId, again.approvalRuns.map((r) => r.runId)]).toEqual(["sup2", ["prov1", "sup1"]]);
  expect(project(run(20, ...DECIDED, supplement("sup1", 10), answer("c1", "sup1", 0, "no", "u_head", 12), supplement("sup2", 13))).waitsForApproval).toBe(true);
});
