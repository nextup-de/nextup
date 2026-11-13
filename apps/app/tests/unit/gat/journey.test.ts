// GAT-U2 (B2): the journey of a case with a review and approval runs on My cases (plan GAT, D12, D14, D21, D32, D33; N5). States come from the reducer;
// fixed days, no clock. Flat tests (D36).
import { expect, it } from "vitest";
import { EMPTY_APPROVAL_CONFIG } from "@/features/approvals/types";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type ReducedCase, type State } from "@/features/cases/reducer";
import { journeyOf, type JourneyOpts, type JourneyStage } from "@/features/cases/selectors";
import type { Route, SeedRole } from "@/features/demo/types";
import { projectOfCase } from "@/features/projects/selectors";

const SEATS: SeatRow[] = [
  { id: "s_rev", roleId: "role_review", label: "R. Review", userId: "u_rev", sort: 0 },
  { id: "s_own", roleId: "role_owner", label: "T. Vogel", userId: "u_own", sort: 1 },
  { id: "s_lead", roleId: "role_lead", label: "L. Brandt", userId: "u_lb", sort: 2 },
  { id: "s_plant", roleId: "role_plant", label: "P. Plant", userId: "u_plant", sort: 3 },
  { id: "s_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 4 },
];
const ROLES: SeedRole[] = [
  { id: "role_head", orgUnitId: "u", reportsToId: null, title: "Director" },
  { id: "role_plant", orgUnitId: "u", reportsToId: "role_head", title: "Plant manager", spendLimitEur: 25_000 },
  { id: "role_review", orgUnitId: "u", reportsToId: "role_plant", title: "Idea manager" },
  { id: "role_owner", orgUnitId: "u", reportsToId: "role_plant", title: "Quality lead", spendLimitEur: 5_000 },
  { id: "role_lead", orgUnitId: "u", reportsToId: "role_plant", title: "Line lead" },
];
const ROUTES: Route[] = [{
  id: "r1", type: "Type", keys: ["k"], owner: { name: "T. Vogel", role: "Owner", dept: "PRD" }, deputy: "L. Brandt", buddy: "B", wait: "2 days",
  ownerSeatId: "s_own", ownerRoleId: "role_owner", deputySeatId: "s_lead", deputyRoleId: "role_lead",
}];
const SEED: ReduceSeed = { cases: [], ideas: [], problems: [], routes: ROUTES, promiseDays: 5, seats: SEATS, roles: ROLES, approvals: { ...EMPTY_APPROVAL_CONFIG } };
const NAME: Record<string, string> = { u_rev: "R. Review", u_own: "T. Vogel", u_lb: "L. Brandt", u_plant: "P. Plant", u_head: "K. Head", u_ra: "J. Schmidt" };

const ev = (id: string, type: CaseEventType, by: string | null, target: string, payload: EventPayload, day: number, actor?: string): CaseEvent =>
  ({ id, ts: 0, type, actor: actor ?? (by === null ? "system:clock" : NAME[by]), actorUserId: by, target, payload, day });
const RAISE: EventPayload = { kind: "idea", title: "Case ca", body: "b", routeId: "r1", fromDept: "PRD" };
const plain = (day = 0) => ev("raise", "case.raised", "u_ra", "ca", { ...RAISE, assignee: "T. Vogel", assigneeRoleHolderId: "s_own" }, day);
const reviewed = (day = 0, dueDay = 2) => ev("raise", "case.raised", "u_ra", "ca", { ...RAISE, assignee: "R. Review", assigneeRoleHolderId: "s_rev", review: true, reviewDueDay: dueDay }, day);
const forward = (day: number, extra: EventPayload = {}, by: string | null = "u_rev") => ev("fwd", "case.reviewed", by, "ca", { outcome: "forward", toRoleHolderId: "s_own", ...extra }, day);

const ONE = [{ kind: "budget" as const, roleId: "role_plant", coversUpToEur: 25_000 }];
const provisional = (id: string, day: number, extra: EventPayload = {}) =>
  ev(id, "case.provisional", "u_own", "ca", { approvals: ONE, stepDueDay: 9, costEur: 12_000, decidingRoleId: "role_owner", projectId: "p1", lead: "T. Vogel", leadUserId: "u_own", title: "Case ca", draft: true, ...extra }, day);
const answer = (id: string, runId: string, index: number, approvalAnswer: "yes" | "conditions" | "back" | "no", by: string, day: number, extra: EventPayload = {}) =>
  ev(id, "case.approval", by, "ca", { runId, stepId: `${runId}:${index}`, dueRev: 0, step: index, approvalAnswer, reason: "", ...extra }, day);
const settle = (id: string, day: number, payload: EventPayload) => ev(id, "case.decided", null, "ca", payload, day, "system:approvals");
const NO = { answer: "no" as const, category: "no-fit" as const, reason: "It does not serve a goal of this year and it would break the gauge standard" };

const OPTS = { discussion: true, projects: true, today: 0, seats: SEATS };
const stateOf = (day: number, ...events: CaseEvent[]): State => reduce(SEED, { events, day });
const caseOf = (s: State): ReducedCase => s.cases.find((c) => c.id === "ca") as ReducedCase;
const journey = (s: State, over: Partial<JourneyOpts> = {}): JourneyStage[] => journeyOf(caseOf(s), projectOfCase(s, caseOf(s)) ?? null, { ...OPTS, ...over });
const ids = (st: JourneyStage[]) => st.map((x) => x.id);
const states = (st: JourneyStage[]) => st.map((x) => `${x.id}:${x.state}`);
const stage = (st: JourneyStage[], id: JourneyStage["id"]) => st.find((x) => x.id === id) as JourneyStage;

it("GAT journey shows the review stage", () => {
  // Pending: between the raise and the desk, with the review seat's role and the day it is due; the desk has not got the case yet.
  const pending = journey(stateOf(1, reviewed()), { today: 1 });
  expect(ids(pending)).toEqual(["raised", "review", "desk", "discussion", "decision", "project"]);
  expect(states(pending)).toEqual(["raised:done", "review:now", "desk:todo", "discussion:todo", "decision:todo", "project:todo"]);
  expect(stage(pending, "review")).toMatchObject({ roleId: "role_review", dueDay: 2, day: null, outcome: null });
  expect(stage(pending, "desk")).toMatchObject({ roleId: null, dueDay: null });
  // Past its days it is late; a question to the raiser is shown as sent back and is not late.
  expect(stage(journey(stateOf(3, reviewed()), { today: 3 }), "review").state).toBe("late");
  const asked = journey(stateOf(3, reviewed(), ev("q", "case.asked", "u_rev", "ca", { text: "Which line?" }, 1)), { today: 3 });
  expect(stage(asked, "review")).toMatchObject({ state: "now", outcome: { kind: "sentBack" } });
  // Forwarded: done, with the day of the forward and the desk's role; forwarded by the clock says so.
  const done = journey(stateOf(3, reviewed(), forward(2)), { today: 3 });
  expect(states(done).slice(0, 3)).toEqual(["raised:done", "review:done", "desk:now"]);
  expect(stage(done, "review")).toMatchObject({ roleId: "role_review", day: 2, dueDay: null, outcome: { kind: "forwarded", auto: false } });
  expect(stage(done, "desk").roleId).toBe("role_owner");
  expect(stage(journey(stateOf(3, reviewed(), forward(2, { auto: true }, null)), { today: 3 }), "review").outcome).toEqual({ kind: "forwarded", auto: true });
  // A case that ended while the review held it: the stage is done with no day.
  const ended = journey(stateOf(3, reviewed(), ev("w", "case.withdrawn", "u_ra", "ca", {}, 1)), { today: 3 });
  expect(stage(ended, "review")).toMatchObject({ state: "done", outcome: { kind: "reviewEnded" } });
});

it("GAT journey shows the approval stage while waiting", () => {
  const st = journey(stateOf(4, reviewed(), forward(1), provisional("prov", 2)), { today: 4 });
  expect(ids(st)).toEqual(["raised", "review", "desk", "discussion", "decision", "approval", "project"]);
  expect(states(st)).toEqual(["raised:done", "review:done", "desk:done", "discussion:todo", "decision:done", "approval:now", "project:todo"]);
  expect(stage(st, "decision")).toMatchObject({ day: 2, dueDay: null, outcome: { kind: "provisional" } });
  expect(stage(st, "approval")).toMatchObject({ roleId: "role_plant", day: null, dueDay: 9, outcome: null, runId: "prov", supplement: false });
  // Past the step's day it is late.
  expect(stage(journey(stateOf(10, plain(), provisional("prov", 2)), { today: 10 }), "approval").state).toBe("late");
  // A council step is held by its secretary's role, once the journey knows the councils.
  const council = [{ kind: "council" as const, councilId: "k1" }];
  const withCouncil = journey(stateOf(4, plain(), provisional("prov", 2, { approvals: council })), { today: 4, councils: [{ id: "k1", secretaryRoleId: "role_head" }] });
  expect(stage(withCouncil, "approval").roleId).toBe("role_head");
});

it("GAT journey shows the approval stage done after a final yes", () => {
  const s = stateOf(5, plain(), provisional("prov", 2), answer("a1", "prov", 0, "yes", "u_plant", 4), settle("d", 4, { answer: "yes", projectId: "p1" }));
  const st = journey(s, { today: 5 });
  expect(states(st)).toEqual(["raised:done", "desk:done", "discussion:skipped", "decision:done", "approval:done", "project:now"]);
  expect(stage(st, "decision")).toMatchObject({ day: 4, outcome: { kind: "yes" } });
  expect(stage(st, "approval")).toMatchObject({ roleId: "role_plant", day: 4, dueDay: null, outcome: { kind: "approved" } });
  // The approval's no decides the case no: the run is done, refused, and the project is skipped.
  const refused = journey(stateOf(5, plain(), provisional("prov", 2), answer("a1", "prov", 0, "no", "u_plant", 4, { reason: NO.reason }), settle("d", 4, NO)), { today: 5 });
  expect(stage(refused, "approval")).toMatchObject({ state: "done", roleId: "role_plant", day: 4, outcome: { kind: "refused" } });
  expect(stage(refused, "decision").outcome).toMatchObject({ kind: "no" });
  expect(stage(refused, "project").state).toBe("skipped");
});

it("GAT journey keeps a refused run before the run after a reopen", () => {
  const first = [plain(), provisional("prov1", 5), answer("a1", "prov1", 0, "no", "u_plant", 5, { reason: NO.reason }), settle("d1", 5, NO), ev("stop", "project.stopped", null, "p1", { why: NO.reason }, 5, "system:approvals")];
  const second = [ev("ask", "case.appealed", "u_ra", "ca", { text: "The quote came in lower, please look again", toRoleHolderId: "s_lead" }, 5), ev("look", "case.appeal.decided", "u_lb", "ca", { uphold: false, reason: "The new quote changes it" }, 5)];
  const reopened = journey(stateOf(6, ...first, ...second), { today: 6 });
  expect(ids(reopened)).toEqual(["raised", "desk", "discussion", "decision", "approval", "project"]);
  expect(stage(reopened, "approval")).toMatchObject({ runId: "prov1", state: "done", outcome: { kind: "refused" } });
  expect(stage(reopened, "desk").outcome).toMatchObject({ kind: "cameBack" });
  // The new run, on the same day, comes after the refused one; the refused one stays in view.
  const again = journey(stateOf(6, ...first, ...second, provisional("prov2", 5, { projectId: "p2" })), { today: 6 });
  const approvals = again.filter((x) => x.id === "approval");
  expect(approvals.map((x) => [x.runId, x.state, x.outcome?.kind ?? null])).toEqual([["prov1", "done", "refused"], ["prov2", "now", null]]);
  expect(ids(again).indexOf("approval")).toBeLessThan(ids(again).indexOf("project"));
  const decided = journey(stateOf(6, ...first, ...second, provisional("prov2", 5, { projectId: "p2" }), answer("b1", "prov2", 0, "yes", "u_plant", 6), settle("d2", 6, { answer: "yes", projectId: "p2" })), { today: 6 });
  expect(decided.filter((x) => x.id === "approval").map((x) => [x.runId, x.outcome?.kind])).toEqual([["prov1", "refused"], ["prov2", "approved"]]);
});

it("GAT journey shows a supplement run in the approval stage", () => {
  const decided = [plain(), provisional("prov1", 2), answer("a1", "prov1", 0, "yes", "u_plant", 3), settle("d1", 3, { answer: "yes", projectId: "p1" })];
  const supplement = ev("sup1", "case.provisional", "u_own", "ca", { supplement: true, approvals: [{ kind: "budget", roleId: "role_head", coversUpToEur: null }], stepDueDay: 14, costEur: 40_000, decidingRoleId: "role_owner" }, 10);
  const st = journey(stateOf(12, ...decided, supplement), { today: 12 });
  expect(st.filter((x) => x.id === "approval").map((x) => [x.runId, x.supplement, x.state, x.roleId, x.dueDay])).toEqual([
    ["prov1", false, "done", "role_plant", null], ["sup1", true, "now", "role_head", 14],
  ]);
  // The decision stands while the supplement waits: it is still the yes.
  expect(stage(st, "decision")).toMatchObject({ state: "done", outcome: { kind: "yes" } });
  expect(stage(st, "approval")).toMatchObject({ runId: "prov1" });
});

it("GAT journey keeps the stages of today without review or approvals", () => {
  const s = stateOf(1, plain());
  expect(ids(journey(s, { today: 1 }))).toEqual(["raised", "desk", "discussion", "decision", "project"]);
  expect(states(journey(s, { today: 1 }))).toEqual(["raised:done", "desk:now", "discussion:todo", "decision:todo", "project:todo"]);
  expect(journey(s, { today: 1 }).every((x) => x.runId === undefined)).toBe(true);
  // A decided case without a run, and one with the stages switched off, read as before.
  const yes = stateOf(3, plain(), ev("yes", "case.decided", "u_own", "ca", { answer: "yes", projectId: "p1", lead: "T. Vogel", leadUserId: "u_own", title: "Case ca" }, 2));
  expect(ids(journey(yes, { today: 3 }))).toEqual(["raised", "desk", "discussion", "decision", "project"]);
  expect(ids(journey(s, { today: 1, discussion: false, projects: false }))).toEqual(["raised", "desk", "decision"]);
});
