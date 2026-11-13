// GAT-B1 (B2): who may review, cost, answer an approval step and move a case, where a second look goes, who may open the draft, and what Start still
// lacks after a higher cost, a changed approver, a supplement or a deleted role (plan GAT, D13, D16 to D18, D20, D22, D24, D33), pure and without a
// database. Flat top-level tests (D36).
import { expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { Role } from "@/config/roles";
import {
  appealSeatWithReview, approvalCoverage, approverRoleIds, isOwnIdea, isReviewHolder, mayAnswerStep, mayCost, mayMoveToDesk, mayReview,
  unmetApprovals, validCost, yesNeedsApproval, type RightsCase, type RightsState,
} from "@/features/approvals/rights";
import { EMPTY_APPROVAL_CONFIG, type ApprovalConfig, type ApprovalRoleInfo, type ApprovalRule, type ApprovalStep, type CaseApprovals, type CaseReview } from "@/features/approvals/types";
import type { Decision } from "@/features/cases/reducer";
import { LOOP_DEFAULTS } from "@/features/loop/rules";

const ROLES: ApprovalRoleInfo[] = [
  { id: "director", title: "Director", reportsToId: null, spendLimitEur: null },
  { id: "plant", title: "Plant manager", reportsToId: "director", spendLimitEur: 25_000 },
  { id: "desk", title: "Setter lead", reportsToId: "plant", spendLimitEur: 5_000 },
  { id: "quality", title: "Quality lead", reportsToId: "plant", spendLimitEur: null },
  { id: "finance", title: "Finance", reportsToId: "plant", spendLimitEur: null },
  { id: "triage", title: "Triage", reportsToId: "plant", spendLimitEur: null },
  { id: "fallback", title: "Fallback", reportsToId: "plant", spendLimitEur: null },
  { id: "worker", title: "Operator", reportsToId: "desk", spendLimitEur: null },
];
const seat = (id: string, roleId: string, userId: string | null, sort: number): SeatRow => ({ id, roleId, label: id, userId, sort });
const SEATS: SeatRow[] = [
  seat("s_dir", "director", "u_dir", 0), seat("s_plant", "plant", "u_plant", 1), seat("s_plant2", "plant", "u_plant2", 2), seat("s_desk", "desk", "u_desk", 3),
  seat("s_q1", "quality", "u_q1", 4), seat("s_q2", "quality", "u_q2", 5), seat("s_fin", "finance", "u_fin", 6), seat("s_tri", "triage", "u_tri", 7),
  seat("s_fb", "fallback", "u_fb", 8), seat("s_raiser", "worker", "u_raiser", 9),
];
const COUNCIL = { id: "k1", name: "Investment council", memberRoleIds: ["plant", "finance"], secretaryRoleId: "finance", everyDays: 10, firstDay: 20 };
const REVIEW: ApprovalConfig["review"] = { on: true, roleId: "quality", days: 2, deputyRoleId: null, routes: {} };

const state = (config: Partial<ApprovalConfig> = {}, over: { roles?: ApprovalRoleInfo[]; seats?: SeatRow[]; projects?: RightsState["projects"] } = {}): RightsState => ({
  seats: over.seats ?? SEATS,
  approvals: { ...EMPTY_APPROVAL_CONFIG, review: REVIEW, triageRoleId: "triage", fallbackRoleId: "fallback", councils: [COUNCIL], ...config, roles: over.roles ?? ROLES },
  rules: LOOP_DEFAULTS,
  projects: over.projects ?? [],
});
const actor = (userId: string | null, role: Role = "leader", seats: readonly SeatRow[] = SEATS) => ({ role, name: String(userId), handle: null, userId, me: meFor(userId, seats) });
const pending: CaseReview = { state: "pending", seatId: "s_q1", since: 1, dueDay: 3, forwardFrom: 2, waitsOn: null, auto: false };
const yes = (): Decision => ({ answer: "yes", reason: "", note: "", by: "Desk", day: 4, category: null, changeIf: "", revisitDay: null, duplicateOf: null, projectId: null });
const kase = (over: Partial<RightsCase> = {}): RightsCase => ({
  fromUserId: "u_raiser", routeId: "r1", status: "open", withdrawn: null, merged: null, review: pending, cost: null, decided: null,
  approvals: null, approvalRuns: [], openingRunId: null, assigneeRoleId: "desk", ...over,
});

const step = (index: number, over: Partial<ApprovalStep> = {}, runId = "run1"): ApprovalStep => ({
  kind: "role", roleId: "plant", id: `${runId}:${index}`, state: "pending", dueDay: 9, dueRev: 0, seatId: null, answers: [], ...over,
});
const run = (runId: string, steps: ApprovalStep[], over: Partial<CaseApprovals> = {}): CaseApprovals => ({
  runId, deciderUserId: "u_desk", decidingRoleId: "desk", since: 1, projectId: null, opened: true, supplement: false, costEur: 12_000, steps, done: false, outcome: null, ...over,
});
const budget = (roleId: string, covers: number | null, runId: string, index = 0, st: ApprovalStep["state"] = "yes"): ApprovalStep =>
  step(index, { kind: "budget", roleId, coversUpToEur: covers, state: st }, runId);

it("GAT rights refuses review actions on the raisers own idea for holders, managers and handed seats", () => {
  const s = state();
  // A review holder raised it (the server placed it on the other quality seat): they cannot review it.
  const own = kase({ fromUserId: "u_q1", review: { ...pending, seatId: "s_q2" } });
  expect(isOwnIdea(actor("u_q1"), own)).toBe(true);
  expect(mayReview(actor("u_q1"), own, s)).toBe(false);
  expect(mayReview(actor("u_q2"), own, s)).toBe(true); // the other holder of the role still may
  // A manager who raised it cannot either, and a manager's seat the review was handed to does not help.
  const manager = kase({ fromUserId: "u_plant", review: { ...pending, seatId: "s_plant" } });
  expect(mayReview(actor("u_plant", "manager"), manager, s)).toBe(false);
  expect(mayReview(actor("u_plant", "leader"), manager, s)).toBe(false); // holder of the handed seat
  expect(isReviewHolder(actor("u_plant"), manager, s)).toBe(true);
  expect(mayReview(actor("u_plant2", "leader"), manager, s)).toBe(true); // another holder of that role is not the raiser
  // The other rights that follow the review: moving to a desk and the cost are refused to the raiser too.
  expect(mayMoveToDesk(actor("u_plant", "manager"), manager, s)).toBe(false);
  expect(mayCost(actor("u_q1"), own, s)).toBe(false);
  // Nobody is the raiser of a case whose raiser is not known, and a signed-out actor is nobody.
  expect(isOwnIdea(actor(null), kase({ fromUserId: null }))).toBe(false);
  expect(isOwnIdea({ userId: undefined }, kase())).toBe(false);
});

it("GAT rights lets review holders and managers review others ideas", () => {
  const s = state();
  expect(mayReview(actor("u_q1"), kase(), s)).toBe(true);
  expect(mayReview(actor("u_q2"), kase(), s)).toBe(true); // a holder of the review seat's role
  expect(mayReview(actor("u_boss", "manager"), kase(), s)).toBe(true); // a manager, whatever seat they hold
  expect(mayReview(actor("u_desk"), kase(), s)).toBe(false);
  expect(mayReview(actor("u_tri"), kase(), s)).toBe(false);
  expect(mayReview(actor("u_raiser", "member"), kase(), s)).toBe(false);
  // Only while the review is pending.
  expect(mayReview(actor("u_q1"), kase({ review: { ...pending, state: "forwarded" } }), s)).toBe(false);
  expect(mayReview(actor("u_q1"), kase({ review: { ...pending, state: "ended" } }), s)).toBe(false);
  expect(mayReview(actor("u_q1"), kase({ review: null }), s)).toBe(false);
  expect(isReviewHolder(actor("u_q1"), kase({ review: null }), s)).toBe(false);
});

it("GAT rights checks cost rights and ranges", () => {
  const s = state();
  expect(mayCost(actor("u_desk"), kase({ review: null }), s)).toBe(true); // the desk's role
  expect(mayCost(actor("u_q1"), kase(), s)).toBe(true); // the review seat's role
  expect(mayCost(actor("u_boss", "manager"), kase(), s)).toBe(true);
  expect(mayCost(actor("u_fin"), kase(), s)).toBe(false);
  expect(mayCost(actor("u_raiser", "member"), kase({ review: null }), s)).toBe(false);
  // The draft's lead, until the project starts.
  const project = (startedDay: number | null) => ({ id: "p1", leadUserId: "u_lead", startedDay }) as unknown as RightsState["projects"][number];
  const decided = kase({ review: null, decided: { ...yes(), projectId: "p1" } });
  expect(mayCost(actor("u_lead"), decided, state({}, { projects: [project(null)] }))).toBe(true);
  expect(mayCost(actor("u_lead"), decided, state({}, { projects: [project(7)] }))).toBe(false);
  expect(mayCost(actor("u_boss", "manager"), decided, state({}, { projects: [project(7)] }))).toBe(false); // nobody, once it started
  // Not on a case that is gone.
  expect(mayCost(actor("u_desk"), kase({ review: null, merged: { into: "c2", day: 1, by: "D", byUserId: null, note: "" } }), s)).toBe(false);
  expect(mayCost(actor("u_desk"), kase({ review: null, withdrawn: { day: 1, by: "R", byUserId: "u_raiser", note: "" } }), s)).toBe(false);
  // The ranges: a whole number of euros from 0 to 100 000 000, a basis of 300 characters at most.
  expect([0, 1, 12_000, 100_000_000].map((n) => validCost(n, ""))).toEqual([true, true, true, true]);
  expect([-1, 1.5, 100_000_001, Number.NaN, "5", null].map((n) => validCost(n, ""))).toEqual([false, false, false, false, false, false]);
  expect([validCost(5, "x".repeat(300)), validCost(5, "x".repeat(301)), validCost(5, 7)]).toEqual([true, false, false]);
});

it("GAT rights needs approval when approvalsFor is not empty", () => {
  const rules: ApprovalRule[] = [{ id: "ru", kind: "role", roleId: "finance", routeKey: "r2", minEur: null }];
  const s = state({ rules });
  const cost = (eur: number) => ({ eur, basis: "quote", day: 2, by: "Desk", byUserId: "u_desk" });
  expect(yesNeedsApproval(kase({ cost: cost(12_000) }), s)).toBe(true); // above the fast lane and the desk's limit: a budget step
  expect(yesNeedsApproval(kase({ cost: cost(4_000) }), s)).toBe(false);
  expect(yesNeedsApproval(kase({ cost: null }), s)).toBe(false); // no cost, no budget step
  expect(yesNeedsApproval(kase({ routeId: "r2" }), s)).toBe(true); // a rule of the route
  expect(yesNeedsApproval(kase({ cost: null }), s, ["finance"])).toBe(true); // a role the desk adds by hand
  expect(yesNeedsApproval(kase({ cost: null }), s, ["desk"])).toBe(false); // the deciding role is never asked
  expect(yesNeedsApproval(kase({ cost: cost(12_000), assigneeRoleId: "plant" }), s)).toBe(false); // 12k is within the plant manager's own limit
});

const active = (over: Partial<CaseApprovals> = {}, steps: ApprovalStep[] = [step(0, { state: "yes", roleId: "finance" }), step(1)]): RightsCase =>
  kase({ review: null, approvals: run("run1", steps, over) });
const form = (stepId = "run1:1", dueRev = 0, runId = "run1") => ({ runId, stepId, dueRev });

it("GAT rights lets only the current step holder answer the active run", () => {
  const s = state();
  const c = active();
  expect(mayAnswerStep(actor("u_plant"), c, s, form())).toBe(true); // the holder of the current step's role
  expect(mayAnswerStep(actor("u_plant2"), c, s, form())).toBe(true); // any holder of it
  expect(mayAnswerStep(actor("u_fin"), c, s, form())).toBe(false); // the previous step's role has answered
  expect(mayAnswerStep(actor("u_dir"), c, s, form())).toBe(false);
  expect(mayAnswerStep(actor("u_boss", "manager"), c, s, form())).toBe(false); // a manager only holding that role
  expect(mayAnswerStep(actor("u_plant", "manager"), c, s, form())).toBe(true); // a manager who holds it
  expect(mayAnswerStep(actor(null), c, s, form())).toBe(false);
  // A council step is answered by its secretary's role.
  const council = active({}, [step(0, { kind: "council", councilId: "k1", roleId: undefined })]);
  expect(mayAnswerStep(actor("u_fin"), council, s, form("run1:0"))).toBe(true);
  expect(mayAnswerStep(actor("u_plant"), council, s, form("run1:0"))).toBe(false); // a member of the council, not its secretary
  // The seat a late hand-over named answers too.
  const handed = active({}, [step(0, { seatId: "s_dir" })]);
  expect(mayAnswerStep(actor("u_dir"), handed, s, form("run1:0"))).toBe(true);
  // A role that no longer exists is answered by the handed seat only.
  const gone = active({}, [step(0, { roleId: "deleted", seatId: "s_dir" })]);
  expect(mayAnswerStep(actor("u_dir"), gone, s, form("run1:0"))).toBe(true);
  expect(mayAnswerStep(actor("u_plant"), gone, s, form("run1:0"))).toBe(false);
});

it("GAT rights refuses the decider and a stale step", () => {
  const s = state();
  // The person who wrote the case.provisional never answers, even when they hold the role.
  const decider = active({ deciderUserId: "u_plant2" });
  expect(mayAnswerStep(actor("u_plant2"), decider, s, form())).toBe(false);
  expect(mayAnswerStep(actor("u_plant"), decider, s, form())).toBe(true);
  const c = active();
  expect(mayAnswerStep(actor("u_plant"), c, s, form("run1:0"))).toBe(false); // a step that is already answered
  expect(mayAnswerStep(actor("u_plant"), c, s, form("run1:2"))).toBe(false); // a step that is not current yet
  expect(mayAnswerStep(actor("u_plant"), c, s, form("run1:1", 0, "run0"))).toBe(false); // another run
  expect(mayAnswerStep(actor("u_plant"), active({ done: true, outcome: "yes" }), s, form())).toBe(false); // a finished run
  expect(mayAnswerStep(actor("u_plant"), kase({ review: null }), s, form())).toBe(false); // no run at all
});

it("GAT rights refuses an answer for an old dueRev", () => {
  const s = state();
  const sent = active({}, [step(0, { dueRev: 1 })]);
  expect(mayAnswerStep(actor("u_plant"), sent, s, form("run1:0", 1))).toBe(true);
  expect(mayAnswerStep(actor("u_plant"), sent, s, form("run1:0", 0))).toBe(false); // a form opened before the send-back
  expect(mayAnswerStep(actor("u_plant"), sent, s, form("run1:0", 2))).toBe(false);
});

it("GAT rights sends the second look to the review seat when review applies", () => {
  const s = state();
  const c = kase({ fromUserId: "u_raiser" });
  expect(appealSeatWithReview(c, s, "u_desk")?.id).toBe("s_q1"); // the review seat takes the desk's place
  expect(appealSeatWithReview(c, s, "u_q1")).toBeNull(); // the one who said no holds the review role: NOR's rule
  expect(appealSeatWithReview(c, s, "u_q2")).toBeNull(); // by role, not by seat
  expect(appealSeatWithReview(c, s, null)?.id).toBe("s_q1");
  expect(appealSeatWithReview(kase({ routeId: "never" }), state({ review: { ...REVIEW, routes: { never: "never" } } }), "u_desk")).toBeNull(); // review does not apply to the route
  expect(appealSeatWithReview(c, state({ review: { ...REVIEW, on: false } }), "u_desk")).toBeNull(); // the switch is off
  expect(appealSeatWithReview(kase({ routeId: "always" }), state({ review: { ...REVIEW, on: false, routes: { always: "always" } } }), "u_desk")?.id).toBe("s_q1");
  // Never a seat the raiser holds: the review role's other seat.
  expect(appealSeatWithReview(kase({ fromUserId: "u_q1" }), s, "u_desk")?.id).toBe("s_q2");
  // No quality seat is occupied: the role above takes it (D12); with nobody there either, NOR's rule decides.
  expect(appealSeatWithReview(c, state({}, { seats: SEATS.filter((x) => x.roleId !== "quality") }), "u_desk")?.id).toBe("s_plant");
  expect(appealSeatWithReview(c, state({}, { seats: SEATS.filter((x) => x.roleId !== "quality" && x.roleId !== "plant") }), "u_desk")).toBeNull();
});

it("GAT rights lists approver roles", () => {
  const s = state();
  const open = run("run2", [step(0, { kind: "budget", roleId: "plant", coversUpToEur: 25_000 }, "run2"), step(1, { kind: "council", councilId: "k1", roleId: undefined }, "run2"), step(2, { roleId: "desk", seatId: "s_dir" }, "run2")]);
  const last = run("run1", [step(0, { roleId: "quality" })], { done: true, outcome: "yes" });
  const older = run("run0", [step(0, { roleId: "worker" }, "run0")], { done: true, outcome: "yes" });
  const listed = approverRoleIds(kase({ approvals: open, approvalRuns: [older, last] }), s);
  // The active run's roles, the council's secretary and members, the handed seat's role, and the last finished run's roles - not the older run's.
  expect([...listed].sort()).toEqual(["desk", "director", "finance", "plant", "quality"]);
  expect(approverRoleIds(kase(), s)).toEqual([]);
  expect(approverRoleIds(kase({ approvals: null, approvalRuns: [last] }), s)).toEqual(["quality"]);
  // A council that is gone adds nothing, and a handed seat nobody knows adds nothing.
  const gone = run("run3", [step(0, { kind: "council", councilId: "deleted", roleId: undefined, seatId: "s_unknown" }, "run3")]);
  expect(approverRoleIds(kase({ approvals: gone }), s)).toEqual([]);
});

it("GAT rights lets review triage and fallback holders move to a desk", () => {
  const s = state();
  const routeless = kase({ routeId: null, review: null });
  expect(mayMoveToDesk(actor("u_tri"), routeless, s)).toBe(true); // the triage role on a case without a route
  expect(mayMoveToDesk(actor("u_fb"), routeless, s)).toBe(true); // the fallback role
  expect(mayMoveToDesk(actor("u_q1"), routeless, s)).toBe(true); // the review role
  expect(mayMoveToDesk(actor("u_q1"), kase(), s)).toBe(true); // a pending review on a case with a route
  expect(mayMoveToDesk(actor("u_tri"), kase({ review: null }), s)).toBe(false); // a case with a route and no review pending
  expect(mayMoveToDesk(actor("u_tri"), kase({ review: { ...pending, state: "forwarded" } }), s)).toBe(false);
  expect(mayMoveToDesk(actor("u_desk"), routeless, s)).toBe(false);
  // Managers as NOR has it: an open or asked case.
  expect(mayMoveToDesk(actor("u_boss", "manager"), kase({ review: null }), s)).toBe(true);
  expect(mayMoveToDesk(actor("u_boss", "manager"), kase({ review: null, status: "asked" }), s)).toBe(true);
  expect(mayMoveToDesk(actor("u_boss", "manager"), kase({ review: null, status: "decided" }), s)).toBe(false);
  expect(mayMoveToDesk(actor("u_tri"), kase({ routeId: null, review: null, status: "decided" }), s)).toBe(false);
  // Never the raiser's own idea.
  expect(mayMoveToDesk(actor("u_tri"), kase({ routeId: null, review: null, fromUserId: "u_tri" }), s)).toBe(false);
  expect(mayMoveToDesk(actor("u_boss", "manager"), kase({ review: null, fromUserId: "u_boss" }), s)).toBe(false);
});

// A decided case: the opening run's yes covered a budget step of the plant manager (up to 25k) for a 12k idea on the 5k desk.
const decidedCase = (cost: number, runs: CaseApprovals[], extra: Partial<RightsCase> = {}): RightsCase => {
  const opening = run("open", [budget("plant", 25_000, "open")], { done: true, outcome: "yes" });
  return kase({ review: null, decided: yes(), cost: { eur: cost, basis: "quote", day: 2, by: "Desk", byUserId: "u_desk" }, approvalRuns: [opening, ...runs], openingRunId: "open", ...extra });
};

it("GAT rights finds an unmet budget approval after a higher cost", () => {
  const s = state();
  expect(unmetApprovals(decidedCase(12_000, []), s)).toEqual({ missing: [], broken: [] });
  expect(unmetApprovals(decidedCase(25_000, []), s).missing).toEqual([]); // still within what the plant manager covered
  // 30k is above the plant manager's limit: the top of the chain must approve, and nothing covers it.
  expect(unmetApprovals(decidedCase(30_000, []), s).missing).toEqual([{ kind: "budget", roleId: "director", coversUpToEur: null }]);
  // A cost back under the fast lane needs nothing, and a case that was not decided yes or has no opening run lacks nothing.
  expect(unmetApprovals(decidedCase(3_000, []), s).missing).toEqual([]);
  expect(unmetApprovals(decidedCase(30_000, [], { decided: null }), s)).toEqual({ missing: [], broken: [] });
  expect(unmetApprovals(decidedCase(30_000, [], { openingRunId: null }), s)).toEqual({ missing: [], broken: [] });
  // The same plant manager, but the run covered less than the new cost: unmet as well.
  const narrow = decidedCase(20_000, [], { approvalRuns: [run("open", [budget("plant", 15_000, "open")], { done: true, outcome: "yes" })] });
  expect(unmetApprovals(narrow, s).missing).toEqual([{ kind: "budget", roleId: "plant", coversUpToEur: 25_000 }]);
});

it("GAT rights counts coverage across two successive supplements", () => {
  const s = state({ rules: [{ id: "ru", kind: "role", roleId: "finance", routeKey: null, minEur: 50_000 }] });
  const first = run("sup1", [budget("director", null, "sup1")], { supplement: true, done: true, outcome: "yes" });
  const second = run("sup2", [step(0, { roleId: "finance", state: "conditions" }, "sup2")], { supplement: true, done: true, outcome: "yes" });
  // At 60k the budget goes to the director and the rule adds finance: the opening run covers neither.
  expect(unmetApprovals(decidedCase(60_000, []), s).missing.map((m) => m.roleId)).toEqual(["director", "finance"]);
  // The first supplement meets the budget, the second the role: only both together meet everything.
  expect(unmetApprovals(decidedCase(60_000, [first]), s).missing.map((m) => m.roleId)).toEqual(["finance"]);
  expect(unmetApprovals(decidedCase(60_000, [first, second]), s).missing).toEqual([]);
  expect(approvalCoverage(decidedCase(60_000, [first, second])).map((c) => c.roleId)).toEqual(["plant", "director", "finance"]);
  // A run that is neither the opening run nor a supplement covers nothing, and an active supplement counts for the steps it has answered.
  const stray = run("stray", [step(0, { roleId: "finance", state: "yes" }, "stray")], { done: true, outcome: "yes" });
  expect(unmetApprovals(decidedCase(60_000, [first, stray]), s).missing.map((m) => m.roleId)).toEqual(["finance"]);
  const live = run("sup2", [step(0, { roleId: "finance", state: "yes" }, "sup2"), step(1, { roleId: "desk" }, "sup2")], { supplement: true });
  expect(unmetApprovals(decidedCase(60_000, [first], { approvals: live }), s).missing).toEqual([]);
});

it("GAT rights finds an approver change at unchanged cost", () => {
  // The plant manager covered a 12k idea. The company then lowers the plant manager's spend limit to 10k: the approver for 12k is the director now.
  const lowered = state({}, { roles: ROLES.map((r) => (r.id === "plant" ? { ...r, spendLimitEur: 10_000 } : r)) });
  expect(unmetApprovals(decidedCase(12_000, []), lowered).missing).toEqual([{ kind: "budget", roleId: "director", coversUpToEur: null }]);
  // A new rule at unchanged cost is a new requirement, and a rule for another route is none.
  const withRule = state({ rules: [{ id: "n", kind: "role", roleId: "quality", routeKey: null, minEur: null }, { id: "o", kind: "role", roleId: "finance", routeKey: "r9", minEur: null }] });
  expect(unmetApprovals(decidedCase(12_000, []), withRule).missing).toEqual([{ kind: "role", roleId: "quality" }]);
  // A council added the same way.
  const withCouncil = state({ rules: [{ id: "c", kind: "council", councilId: "k1", routeKey: null, minEur: null }] });
  expect(unmetApprovals(decidedCase(12_000, []), withCouncil).missing).toEqual([{ kind: "council", councilId: "k1" }]);
  // The hand-added roles of the opening run stay required, and a role that already answered meets its own requirement.
  const hand = run("open", [budget("plant", 25_000, "open"), step(1, { roleId: "quality", byHand: true, state: "yes" }, "open")], { done: true, outcome: "yes" });
  expect(unmetApprovals(decidedCase(12_000, [], { approvalRuns: [hand] }), state()).missing).toEqual([]);
  const handNo = run("open", [budget("plant", 25_000, "open"), step(1, { roleId: "quality", byHand: true, state: "no" }, "open")], { done: true, outcome: "no" });
  expect(unmetApprovals(decidedCase(12_000, [], { approvalRuns: [handNo] }), state()).missing).toEqual([{ kind: "role", roleId: "quality", byHand: true }]);
});

it("GAT rights keeps a refused supplement unmet", () => {
  const s = state();
  const refused = run("sup1", [budget("director", null, "sup1", 0, "no")], { supplement: true, done: true, outcome: "no" });
  const c = decidedCase(30_000, [refused]);
  expect(unmetApprovals(c, s).missing).toEqual([{ kind: "budget", roleId: "director", coversUpToEur: null }]); // a step answered no covers nothing
  expect(approvalCoverage(c).map((x) => x.roleId)).toEqual(["plant"]);
  // Asking again and getting a yes meets it.
  const again = run("sup2", [budget("director", null, "sup2")], { supplement: true, done: true, outcome: "yes" });
  expect(unmetApprovals(decidedCase(30_000, [refused, again]), s).missing).toEqual([]);
});

it("GAT rights reports a rule naming a deleted role as broken", () => {
  const deletedRole: ApprovalRule = { id: "d1", kind: "role", roleId: "deleted", routeKey: null, minEur: null };
  const deletedCouncil: ApprovalRule = { id: "d2", kind: "council", councilId: "deleted", routeKey: "r1", minEur: null };
  const otherRoute: ApprovalRule = { id: "d3", kind: "role", roleId: "deleted", routeKey: "r9", minEur: null };
  const needsCost: ApprovalRule = { id: "d4", kind: "role", roleId: "deleted", routeKey: null, minEur: 90_000 };
  const s = state({ rules: [deletedRole, deletedCouncil, otherRoute, needsCost] });
  const result = unmetApprovals(decidedCase(12_000, []), s);
  expect(result.broken.map((r) => r.id)).toEqual(["d1", "d2"]); // the rules that match the case and name what is gone
  expect(result.missing).toEqual([]); // nothing can be asked of a role that is not there
  expect(unmetApprovals(decidedCase(95_000, []), s).broken.map((r) => r.id)).toEqual(["d1", "d2", "d4"]);
  // Rules that name what exists are not broken.
  expect(unmetApprovals(decidedCase(12_000, []), state({ rules: [{ id: "ok", kind: "role", roleId: "finance", routeKey: null, minEur: null }] })).broken).toEqual([]);
});
