// REM-A1 (plan REM; Q7.9, Q7.10, Q7.11): the agent plans a case that waits for approval, the holders of its open approval step read the draft, and the draft
// page's hints come from the stored plan, never from a model call. Fixed logs through the reducer. Flat top-level tests (D2).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { EMPTY_APPROVAL_CONFIG } from "@/features/approvals/types";
import { meFor, type SeatRow } from "@/features/auth/identity";
import { holdsOpenStep, mayPlanCase, maySeePlan, maySeePlanExists, type AgentViewer } from "@/features/agent/permissions";
import { planPanelOf } from "@/features/agent/plan-view";
import type { AgentState } from "@/features/agent/types";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type ReducedCase, type State } from "@/features/cases/reducer";
import type { Route, SeedRole } from "@/features/demo/types";
import { planHints } from "@/components/projects/draft/useProjectHints";

const SEATS: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "T. Vogel", userId: "u_own", sort: 0 },
  { id: "s_plant", roleId: "role_plant", label: "P. Plant", userId: "u_plant", sort: 1 },
  { id: "s_sec", roleId: "role_sec", label: "S. Secretary", userId: "u_sec", sort: 2 },
  { id: "s_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 3 },
  { id: "s_other", roleId: "role_other", label: "O. Other", userId: "u_other", sort: 4 },
];
const ROLES: SeedRole[] = [
  { id: "role_head", orgUnitId: "u", reportsToId: null, title: "Director" },
  { id: "role_plant", orgUnitId: "u", reportsToId: "role_head", title: "Plant manager", spendLimitEur: 25_000 },
  { id: "role_owner", orgUnitId: "u", reportsToId: "role_plant", title: "Quality lead", spendLimitEur: 5_000 },
  { id: "role_sec", orgUnitId: "u", reportsToId: "role_plant", title: "Secretary" },
  { id: "role_other", orgUnitId: "u", reportsToId: "role_plant", title: "Other" },
];
const ROUTES: Route[] = [{
  id: "r1", type: "Type", keys: ["k"], owner: { name: "T. Vogel", role: "Owner", dept: "PRD" }, deputy: "H", buddy: "B", wait: "2 days",
  ownerSeatId: "s_own", ownerRoleId: "role_owner", deputySeatId: null, deputyRoleId: null,
}];
const COUNCIL = { id: "k1", name: "Investment council", memberRoleIds: ["role_plant"], secretaryRoleId: "role_sec", everyDays: 10, firstDay: 20 };
const SEED: ReduceSeed = {
  cases: [], ideas: [], problems: [], routes: ROUTES, promiseDays: 5, seats: SEATS, roles: ROLES,
  approvals: { ...EMPTY_APPROVAL_CONFIG, councils: [COUNCIL] },
};
const NAME: Record<string, string> = { u_own: "T. Vogel", u_plant: "P. Plant", u_sec: "S. Secretary", u_head: "K. Head", u_ra: "J. Schmidt" };
const ev = (id: string, type: CaseEventType, by: string | null, payload: EventPayload, day: number, actor?: string): CaseEvent =>
  ({ id, ts: 0, type, actor: actor ?? (by === null ? "system:clock" : NAME[by]), actorUserId: by, target: "ca", payload, day });
const RAISE = ev("raise", "case.raised", "u_ra", { kind: "idea", title: "Shorter changeover", body: "b", routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "s_own", fromDept: "PRD", visibility: "everyone" }, 0);
const PROV = ev("prov", "case.provisional", "u_own", {
  approvals: [{ kind: "budget", roleId: "role_plant", coversUpToEur: 25_000 }, { kind: "council", councilId: "k1" }], stepDueDay: 9, costEur: 12_000, decidingRoleId: "role_owner",
  projectId: "p1", lead: "T. Vogel", leadUserId: "u_own", title: "Shorter changeover", draft: true,
}, 1);
const BUDGET = ev("a1", "case.approval", "u_plant", { runId: "prov", stepId: "prov:0", dueRev: 0, step: 0, approvalAnswer: "yes", nextStepDueDay: 20 }, 2);
const COUNCIL_YES = ev("a2", "case.approval", "u_sec", { runId: "prov", stepId: "prov:1", dueRev: 0, step: 1, approvalAnswer: "yes" }, 3);
const FINAL_YES = ev("d", "case.decided", null, { answer: "yes", projectId: "p1" }, 4, "system:approvals");

const stateOf = (...events: CaseEvent[]): State => reduce(SEED, { events: [RAISE, ...events], day: 5 });
const caseOf = (s: State): ReducedCase => s.cases[0];
const viewer = (userId: string, role = "leader"): AgentViewer => ({ userId, role, me: meFor(userId, SEATS) });
const agent = (n = 0): Pick<AgentState, "plans"> => ({ plans: { ca: Array.from({ length: n }, (_, i) => ({ id: "p" + i, caseId: "ca", day: 1, textId: "t" + i, byUserId: "u_own" })) } });
const OK = { ok: true };

it("REM agent plans a case in approval", () => {
  const s = stateOf(PROV);
  expect(caseOf(s)).toMatchObject({ status: "approval", archived: false, open: false });
  // The desk and a manager may ask for a planning draft while the case waits; nobody else.
  expect(mayPlanCase(viewer("u_own"), caseOf(s), s, agent())).toEqual(OK);
  expect(mayPlanCase(viewer("u_head", "manager"), caseOf(s), s, agent())).toEqual(OK);
  for (const who of ["u_plant", "u_sec", "u_ra", "u_other"]) expect(mayPlanCase(viewer(who, who === "u_ra" ? "member" : "leader"), caseOf(s), s, agent()), who).toEqual({ ok: false, key: "projectAgent.permPlanDesk" });
  // The runs per case are still counted, and a decided case is still refused.
  expect(mayPlanCase(viewer("u_own"), caseOf(s), s, agent(3))).toEqual({ ok: false, key: "projectAgent.permPlanRuns" });
  const decided = stateOf(PROV, BUDGET, COUNCIL_YES, FINAL_YES);
  expect(caseOf(decided).status).toBe("decided");
  expect(mayPlanCase(viewer("u_own"), caseOf(decided), decided, agent())).toEqual({ ok: false, key: "projectAgent.permPlanState" });
  // A case on the desk is as before.
  const open = stateOf();
  expect(mayPlanCase(viewer("u_own"), caseOf(open), open, agent())).toEqual(OK);
});

it("REM agent approver sees the draft", () => {
  const s = stateOf(PROV);
  const kase = caseOf(s);
  // The holder of the open step: the budget approver now, the council's secretary once the budget is answered, never the one after.
  expect(holdsOpenStep(meFor("u_plant", SEATS), kase, s)).toBe(true);
  expect(holdsOpenStep(meFor("u_sec", SEATS), kase, s)).toBe(false);
  expect(holdsOpenStep(meFor("u_other", SEATS), kase, s)).toBe(false);
  const next = stateOf(PROV, BUDGET);
  expect(holdsOpenStep(meFor("u_plant", SEATS), caseOf(next), next)).toBe(false);
  expect(holdsOpenStep(meFor("u_sec", SEATS), caseOf(next), next)).toBe(true); // a council step: its secretary role
  // A seat a late hand-over named holds it too.
  const handed = stateOf(PROV, ev("late", "clock.due", null, { kind: "approval", check: 2, dueDay: 9, toRoleHolderId: "s_head", originEventId: "prov", stepId: "prov:0@0" }, 15));
  expect(holdsOpenStep(meFor("u_head", SEATS), caseOf(handed), handed)).toBe(true);
  // No run, no step; a finished run, none either.
  const none = stateOf();
  expect(holdsOpenStep(meFor("u_plant", SEATS), caseOf(none), none)).toBe(false);
  const done = stateOf(PROV, BUDGET, COUNCIL_YES, FINAL_YES);
  expect(holdsOpenStep(meFor("u_sec", SEATS), caseOf(done), done)).toBe(false);

  // The server says so on the viewer it builds (case-context); the words are then theirs to read, the others' not.
  const approver: AgentViewer = { ...viewer("u_plant"), approver: true };
  expect(maySeePlan(approver, kase, SEATS)).toEqual(OK);
  expect(maySeePlan(viewer("u_plant"), kase, SEATS).ok, "a viewer nobody marked").toBe(false);
  expect(maySeePlan({ ...viewer("u_ra", "member"), approver: false }, kase, SEATS).ok).toBe(false);
  expect(maySeePlan({ userId: null, role: "member", approver: true }, kase, SEATS).ok, "nobody").toBe(false);
  expect(maySeePlan(approver, caseOf(none), SEATS).ok, "no run on the case").toBe(false);
  expect(maySeePlan(approver, caseOf(done), SEATS).ok, "the run is over").toBe(false);
  expect(maySeePlan(viewer("u_own"), kase, SEATS)).toEqual(OK); // the desk still reads it
  expect(maySeePlanExists(viewer("u_ra", "member"), { ...kase, fromUserId: "u_ra" }, SEATS)).toBe(true); // the raiser learns that one exists, as before
  // The panel gives the approver the words.
  const panel = planPanelOf({ available: true, flag: true, gateOpen: true, viewer: approver, kase, seats: SEATS, agent: agent(1) });
  expect(panel).toMatchObject({ draft: "words", button: null });
});

it("REM agent draft hints need no brain call", () => {
  const draft = {
    template: "quick-win", templateWhy: "small", steps: [{ title: "Order the cart", role: "lead" }, { title: "Mark the floor", role: "team" }], teamRoles: [],
    metric: { name: "Minutes", unit: "min", better: "down" as const, target: 30 }, effort: { minDays: 2, maxDays: 5 }, risks: [], approvals: [],
  };
  expect(planHints(draft)).toEqual({ steps: ["Order the cart", "Mark the floor"], metric: { name: "Minutes", unit: "min", better: "down" } });
  expect(planHints(null)).toEqual({ steps: [], metric: null });
  expect(planHints({ ...draft, metric: null }).metric).toBeNull();
  // The hook reads the stored plan and never asks the brain: no import of the brain's action, no hook that calls it, and the old hook is gone.
  const root = join(__dirname, "../../..");
  const hints = readFileSync(join(root, "src/components/projects/draft/useProjectHints.ts"), "utf8");
  expect(hints).toContain("loadPlanAction");
  for (const brain of ["brainPlanAction", "use-brain", "useBrainPlan", "server/actions/brain", "askBrain"]) expect(hints, brain).not.toContain(brain);
  expect(existsSync(join(root, "src/lib/use-brain.ts"))).toBe(false);
});
