// GAT-R1 (B2): what the server lets a person append while a raise is in review, when approvals apply, and for the start of a draft that
// waits (plan GAT, D13, D16 to D18, D20, D21, D33). mayAppend and mayAppendProject against fixed states; no database.
import { describe, expect, it } from "vitest";
import type { Role } from "@/config/roles";
import { EMPTY_APPROVAL_CONFIG, type ApprovalConfig, type ApprovalRoleInfo, type ApprovalStep, type CaseApprovals, type CaseReview } from "@/features/approvals/types";
import { meFor, type SeatRow } from "@/features/auth/identity";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import type { ReducedCase, State } from "@/features/cases/reducer";
import { LOOP_DEFAULTS } from "@/features/loop/rules";
import { mayAppendProject } from "@/features/projects/permissions";
import type { ReducedProject } from "@/features/projects/types";
import { createT } from "@/i18n";

const t = createT("en");
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
  seat("s_dir", "director", "u_dir", 0), seat("s_plant", "plant", "u_plant", 1), seat("s_desk", "desk", "u_desk", 3), seat("s_q1", "quality", "u_q1", 4), seat("s_q2", "quality", "u_q2", 5),
  seat("s_fin", "finance", "u_fin", 6), seat("s_tri", "triage", "u_tri", 7), seat("s_fb", "fallback", "u_fb", 8), seat("s_raiser", "worker", "u_raiser", 9), seat("s_mgr", "worker", "u_mgr", 10),
];
const REVIEW: ApprovalConfig["review"] = { on: true, roleId: "quality", days: 2, deputyRoleId: null, routes: {} };
const ROUTES = [{ id: "r1", ownerSeatId: "s_desk", ownerRoleId: "desk", deputySeatId: "s_plant", deputyRoleId: "plant" }, { id: "r2", ownerSeatId: "s_desk", ownerRoleId: "desk", deputySeatId: null, deputyRoleId: null }];

const actor = (userId: string | null, role: Role = "leader"): Actor => ({ role, name: String(userId), handle: null, userId, me: meFor(userId, SEATS) });
const pending: CaseReview = { state: "pending", seatId: "s_q1", since: 1, dueDay: 3, forwardFrom: 2, waitsOn: null, auto: false };
const NO = "A reason that is long enough to count as a real one for the raiser";

const kase = (over: Partial<ReducedCase> = {}): ReducedCase => ({
  id: "c1", seed: false, kind: "idea", title: "Idea", body: "", from: "J. Raiser", fromDept: "", fromUserId: "u_raiser", assigneeSeatId: "s_q1", assigneeRoleId: "quality", routeId: "r1",
  assignee: "Q", raisedDay: 0, reason: "", upside: "", linkedIdea: null, status: "open", read: null, decided: null, withdrawn: null, question: null, handed: [], building: null, shipped: null,
  override: null, discussion: null, versions: [], decisions: [], passes: 0, notNowInRow: 0, appeal: null, reopens: [], cycleStartDay: 0, dueFloor: null, reopenSeq: null, decidedSeq: null,
  follows: null, followedBy: [], sameAs: null, related: [], merged: null, mergedIn: [], links: [], review: pending, cost: null, approvals: null, approvalRuns: [], openingRunId: null,
  pausedDays: 0, pausedSince: null, history: [], route: null, age: 0, clock: 0, open: true, archived: false, overdue: false, dueDay: 5, escalated: null,
  ...over,
} as unknown as ReducedCase);

const world = (cases: ReducedCase[], config: Partial<ApprovalConfig> = {}, projects: ReducedProject[] = []): State => ({
  day: 10, cases, ideas: [], projects, seats: SEATS, routes: ROUTES, rules: { ...LOOP_DEFAULTS, noReasonMin: 40 },
  approvals: { ...EMPTY_APPROVAL_CONFIG, review: REVIEW, triageRoleId: "triage", fallbackRoleId: "fallback", ...config, roles: ROLES },
} as unknown as State);

const other = kase({ id: "c2", fromUserId: "u_other", review: null, assigneeSeatId: "s_q1", assigneeRoleId: "quality" });
const ask = (a: Actor, type: string, payload: Record<string, unknown>, c: ReducedCase = kase(), config: Partial<ApprovalConfig> = {}) =>
  mayAppend(a, { type, target: c.id, payload }, world([c, other], config), "en");
const refusedWith = (v: { ok: boolean; error?: string }, key: Parameters<typeof t>[0]) => expect(v).toEqual({ ok: false, error: t(key) });

const REVIEW_PAYLOADS: [string, Record<string, unknown>][] = [
  ["case.reviewed", { outcome: "forward", routeId: "r1" }],
  ["case.asked", { text: "Which line is it?" }],
  ["case.merged", { into: "c2" }],
  ["case.linked", { to: "c2" }],
  ["case.decided", { answer: "no", category: "no-fit", reason: NO }],
  ["case.override", { proposed: "r1", chosen: "r2" }],
  ["case.handed", { to: "s_desk", toRoleHolderId: "s_desk", why: "It belongs to the desk" }],
];

describe("GAT permissions", () => {
  it("refuses each review action on the raisers own idea", () => {
    const own = (userId: string, role: Role, c: Partial<ReducedCase> = {}) => ({ who: actor(userId, role), c: kase({ fromUserId: userId, ...c }) });
    const cases = [
      own("u_q1", "leader"), // a review holder who raised it: the server placed it on the other quality seat, the role still overlaps
      own("u_mgr", "manager"), // a manager who raised it
      own("u_desk", "leader", { assigneeSeatId: "s_desk", assigneeRoleId: "desk", review: { ...pending, seatId: "s_desk" } }), // the seat the case was handed to is the raiser's
    ];
    for (const { who, c } of cases) {
      for (const [type, payload] of REVIEW_PAYLOADS) refusedWith(ask(who, type, payload, c), "approvals.permSelfReview");
    }
    // The same people on someone else's idea are a different matter.
    expect(ask(actor("u_mgr", "manager"), "case.reviewed", { outcome: "forward" }).ok).toBe(true);
  });

  it("allows review actions to review holders", () => {
    const holder = actor("u_q1");
    for (const [type, payload] of REVIEW_PAYLOADS) expect(ask(holder, type, payload), type).toEqual({ ok: true });
    expect(ask(holder, "case.costed", { eur: 12_000, basis: "Two offers" })).toEqual({ ok: true });
    // a manager reviews too; someone with no part in it does not
    expect(ask(actor("u_mgr", "manager"), "case.reviewed", { outcome: "forward" })).toEqual({ ok: true });
    refusedWith(ask(actor("u_fin"), "case.reviewed", { outcome: "forward" }), "approvals.permReviewOnly");
    refusedWith(ask(actor("u_fin"), "case.decided", { answer: "no", category: "no-fit", reason: NO }), "approvals.permReviewOnly");
    // the review's forward is a forward: no other outcome, and never the clock's flag from a person
    refusedWith(ask(holder, "case.reviewed", { outcome: "reject" }), "approvals.permReviewOnly");
    refusedWith(ask(holder, "case.reviewed", { outcome: "forward", auto: true }), "approvals.permReviewOnly");
    // outside a review the existing rules hold: a desk holder's no on an ordinary case goes through
    expect(ask(actor("u_q1"), "case.decided", { answer: "no", category: "no-fit", reason: NO }, kase({ review: null }))).toEqual({ ok: true });
  });

  it("refuses a yes during review or when approvals apply", () => {
    const yes = { answer: "yes", projectId: "p_new", lead: "L", leadUserId: "u_l", draft: true };
    // review pending: no yes, not even a provisional one
    refusedWith(ask(actor("u_q1"), "case.decided", yes), "approvals.permReviewNoYes");
    refusedWith(ask(actor("u_q1"), "case.provisional", { ...yes, approvals: [] }), "approvals.permReviewNoYes");
    // review over, a rule applies to the route: a plain yes is refused, 'Yes, if approved' is allowed
    const rule = { rules: [{ id: "rule1", kind: "role" as const, roleId: "finance", routeKey: null, minEur: null }] };
    const forwarded = kase({ review: { ...pending, state: "forwarded" }, assigneeSeatId: "s_desk", assigneeRoleId: "desk" });
    refusedWith(ask(actor("u_desk"), "case.decided", yes, forwarded, rule), "approvals.permNeedsApproval");
    refusedWith(ask(actor("u_mgr", "manager"), "case.decided", { answer: "yes", projectId: "p_join", lead: "L", draft: false }, forwarded, rule), "approvals.permNeedsApproval");
    expect(ask(actor("u_desk"), "case.provisional", { ...yes, approvals: [{ kind: "role", roleId: "finance" }] }, forwarded, rule)).toEqual({ ok: true });
    // a hand-added role makes it 'Yes, if approved' even when no rule applies; without a rule a plain yes is fine
    expect(ask(actor("u_desk"), "case.provisional", { ...yes, approvals: [{ kind: "role", roleId: "finance", byHand: true }] }, forwarded)).toEqual({ ok: true });
    expect(ask(actor("u_desk"), "case.decided", yes, forwarded)).toEqual({ ok: true });
    // only the desk (or a manager) may say it; a stranger may not
    refusedWith(ask(actor("u_fin"), "case.provisional", { ...yes, approvals: [] }, forwarded, rule), "cases.permDeskOnly");
    // a no is never held back by approvals
    expect(ask(actor("u_desk"), "case.decided", { answer: "no", category: "no-fit", reason: NO }, forwarded, rule)).toEqual({ ok: true });
  });

  it("refuses a persons decision on a case in approval", () => {
    const waiting = kase({ status: "approval", review: null, assigneeSeatId: "s_desk", assigneeRoleId: "desk" });
    for (const who of [actor("u_desk"), actor("u_mgr", "manager"), actor("u_plant")]) {
      refusedWith(ask(who, "case.decided", { answer: "yes", projectId: "p_x", lead: "L", draft: true }, waiting), "approvals.permNotProvisional");
      refusedWith(ask(who, "case.decided", { answer: "no", category: "no-fit", reason: NO }, waiting), "approvals.permNotProvisional");
    }
  });

  it("refuses a discussion during review", () => {
    refusedWith(ask(actor("u_q1"), "case.discussion", { invited: ["x"], missing: "y" }), "approvals.permReviewNoYes");
    expect(ask(actor("u_desk"), "case.discussion", { invited: ["x"], missing: "y" }, kase({ review: { ...pending, state: "forwarded" }, assigneeSeatId: "s_desk", assigneeRoleId: "desk" }))).toEqual({ ok: true });
  });

  it("checks cost ranges", () => {
    const holder = actor("u_q1");
    for (const [eur, basis] of [[0, ""], [12_000, "Two offers"], [100_000_000, "x".repeat(300)]] as const) expect(ask(holder, "case.costed", { eur, basis }), `${eur}`).toEqual({ ok: true });
    for (const [eur, basis] of [[-1, ""], [1.5, ""], [100_000_001, ""], [Number.NaN, ""], ["5", ""], [5, "x".repeat(301)]] as const) refusedWith(ask(holder, "case.costed", { eur, basis }), "approvals.permCostRange");
    // the desk's holders, the lead of the draft and managers may; the raiser while it is reviewed and strangers may not
    refusedWith(ask(actor("u_fin"), "case.costed", { eur: 10, basis: "" }), "approvals.permCostRights");
    refusedWith(ask(actor("u_raiser"), "case.costed", { eur: 10, basis: "" }), "approvals.permSelfReview");
    refusedWith(ask(actor("u_q1"), "case.costed", { eur: 10, basis: "" }, kase({ fromUserId: "u_q1", review: { ...pending, seatId: "s_q2" } })), "approvals.permSelfReview");
    expect(ask(actor("u_mgr", "manager"), "case.costed", { eur: 10, basis: "" })).toEqual({ ok: true });
  });

  const stepOf = (over: Partial<ApprovalStep> = {}, i = 0, runId = "run1"): ApprovalStep => ({ kind: "role", roleId: "plant", id: `${runId}:${i}`, state: "yes", dueDay: 9, dueRev: 0, seatId: null, answers: [], ...over });
  const runOf = (steps: ApprovalStep[], over: Partial<CaseApprovals> = {}): CaseApprovals => ({
    runId: "run1", deciderUserId: "u_desk", decidingRoleId: "desk", since: 1, projectId: "p1", opened: true, supplement: false, costEur: null, steps, done: true, outcome: "yes", ...over,
  });
  const project = (over: Partial<ReducedProject> = {}) => ({
    id: "p1", status: "planning", startedDay: null, leadUserId: "u_lead", baseline: { none: true, why: "x", day: 1, by: "L" }, draft: false, leadState: "taken", goal: null, escalated: null,
    stopped: null, sources: ["c1"], ...over,
  }) as unknown as ReducedProject;
  const decided = (over: Partial<ReducedCase> = {}) => kase({
    review: null, assigneeRoleId: "desk", assigneeSeatId: "s_desk", status: "decided", routeId: "r1", openingRunId: "run1", cost: { eur: 12_000, basis: "x", day: 1, by: "D", byUserId: "u_desk" },
    decided: { answer: "yes", reason: "", note: "", by: "D", byUserId: "u_desk", day: 4, projectId: "p1" } as ReducedCase["decided"],
    approvalRuns: [runOf([stepOf({ kind: "budget", roleId: "plant", coversUpToEur: 25_000 })])],
    ...over,
  });
  const startAs = (who: Actor, c: ReducedCase, p: ReducedProject, config: Partial<ApprovalConfig> = {}) =>
    mayAppendProject(who, { type: "project.started", target: "p1", payload: {} }, world([c], config, [p]), "en");

  it("allows a supplement only with missing approvals", () => {
    // the cost rose after the run: the budget approver changed, so a step is missing
    const higher = decided({ cost: { eur: 60_000, basis: "x", day: 5, by: "D", byUserId: "u_desk" } });
    const p = project();
    const lead = actor("u_lead");
    expect(mayAppend(lead, { type: "case.provisional", target: "c1", payload: { supplement: true, approvals: [] } }, world([higher], {}, [p]), "en")).toEqual({ ok: true });
    expect(mayAppend(actor("u_desk"), { type: "case.provisional", target: "c1", payload: { supplement: true, approvals: [] } }, world([higher], {}, [p]), "en")).toEqual({ ok: true }); // the decider
    // someone else may not ask for it
    expect(mayAppend(actor("u_fin"), { type: "case.provisional", target: "c1", payload: { supplement: true, approvals: [] } }, world([higher], {}, [p]), "en").ok).toBe(false);
    // nothing is missing: the opening run covers what is needed
    refusedWith(mayAppend(lead, { type: "case.provisional", target: "c1", payload: { supplement: true, approvals: [] } }, world([decided()], {}, [p]), "en"), "approvals.permNotProvisional");
    // the project started, or the case is not decided yes: no supplement
    refusedWith(mayAppend(lead, { type: "case.provisional", target: "c1", payload: { supplement: true, approvals: [] } }, world([higher], {}, [project({ startedDay: 6, status: "running" })]), "en"), "approvals.permNotProvisional");
    refusedWith(mayAppend(lead, { type: "case.provisional", target: "c1", payload: { supplement: true, approvals: [] } }, world([kase({ review: null })], {}, [p]), "en"), "approvals.permNotProvisional");
  });

  it("refuses Start while waiting or missing an approval", () => {
    const lead = actor("u_lead");
    expect(startAs(lead, decided(), project())).toEqual({ ok: true });
    // the draft waits for its run
    expect(startAs(lead, decided(), project({ waitsForApproval: true }))).toEqual({ ok: false, error: t("approvals.permStartWaits") });
    // a higher cost needs a higher approver: the step is missing and the answer names it
    const higher = decided({ cost: { eur: 60_000, basis: "x", day: 5, by: "D", byUserId: "u_desk" } });
    const verdict = startAs(lead, higher, project());
    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.error).toContain(t("approvals.permStartNewApproval"));
    expect(!verdict.ok && verdict.error).toContain("Director");
    // a new rule at unchanged cost
    const rule = { rules: [{ id: "rule1", kind: "role" as const, roleId: "finance", routeKey: null, minEur: null }] };
    expect(startAs(lead, decided(), project(), rule).ok).toBe(false);
    // ... which a covering step answers
    const covered = decided({ approvalRuns: [runOf([stepOf({ kind: "budget", roleId: "plant", coversUpToEur: 25_000 }), stepOf({ roleId: "finance" }, 1)])] });
    expect(startAs(lead, covered, project(), rule)).toEqual({ ok: true });
  });

  it("refuses Start again after a refused supplement", () => {
    const lead = actor("u_lead");
    const higher = decided({ cost: { eur: 60_000, basis: "x", day: 5, by: "D", byUserId: "u_desk" } });
    const refusedRun = runOf([stepOf({ kind: "budget", roleId: "director", coversUpToEur: null, state: "no" }, 0, "run2")], { runId: "run2", supplement: true, outcome: "no" });
    const afterNo = { ...higher, approvalRuns: [...higher.approvalRuns, refusedRun] } as ReducedCase;
    expect(startAs(lead, afterNo, project()).ok).toBe(false); // a no covers nothing: Start stays held
    const yesRun = runOf([stepOf({ kind: "budget", roleId: "director", coversUpToEur: null }, 0, "run3")], { runId: "run3", supplement: true });
    expect(startAs(lead, { ...higher, approvalRuns: [...higher.approvalRuns, refusedRun, yesRun] } as ReducedCase, project())).toEqual({ ok: true });
  });

  it("refuses Start while a rule names a deleted approver", () => {
    const lead = actor("u_lead");
    const broken = { rules: [{ id: "rule_gone", kind: "role" as const, roleId: "role_deleted", routeKey: null, minEur: null }] };
    const verdict = startAs(lead, decided(), project(), broken);
    expect(verdict).toEqual({ ok: false, error: t("approvals.approverMissing", { rule: "rule_gone" }) });
    // a rule that names a council that is gone is the same
    const councilGone = { rules: [{ id: "rule_c", kind: "council" as const, councilId: "k_gone", routeKey: null, minEur: null }] };
    expect(startAs(lead, decided(), project(), councilGone).ok).toBe(false);
    // a rule of another route does not matter
    const elsewhere = { rules: [{ id: "rule_x", kind: "role" as const, roleId: "role_deleted", routeKey: "r_other", minEur: null }] };
    expect(startAs(lead, decided(), project(), elsewhere)).toEqual({ ok: true });
  });

  it("lets review triage and fallback holders move to a desk", () => {
    const move = { proposed: "r1", chosen: "r2" };
    // a review holder, on a case in review
    expect(ask(actor("u_q1"), "case.override", move)).toEqual({ ok: true });
    // a triage and a fallback holder, on a case without a route
    const routeless = kase({ review: null, routeId: null, assigneeSeatId: "s_tri", assigneeRoleId: "triage" });
    expect(ask(actor("u_tri"), "case.override", move, routeless)).toEqual({ ok: true });
    expect(ask(actor("u_fb"), "case.override", move, routeless)).toEqual({ ok: true });
    // ... but not on a case that has a route and is not in review
    const routed = kase({ review: null, routeId: "r1" });
    refusedWith(ask(actor("u_tri"), "case.override", move, routed), "cases.permOverrideManager");
    refusedWith(ask(actor("u_q1"), "case.override", move, routed), "cases.permOverrideManager");
    // a stranger may not, a manager may; nobody moves their own idea
    refusedWith(ask(actor("u_fin"), "case.override", move, routeless), "cases.permOverrideManager");
    expect(ask(actor("u_mgr", "manager"), "case.override", move, routed)).toEqual({ ok: true });
    refusedWith(ask(actor("u_tri"), "case.override", move, kase({ review: null, routeId: null, fromUserId: "u_tri" })), "approvals.permSelfReview");
    // the route must be one the company has
    refusedWith(ask(actor("u_tri"), "case.override", { proposed: null, chosen: "r_none" }, routeless), "cases.permOverrideRoute");
    // a decided case is not moved
    refusedWith(ask(actor("u_mgr", "manager"), "case.override", move, kase({ review: null, status: "decided" })), "cases.permOverrideOpen");
  });
});
