// Who may do what in review and approvals, as pure functions (plan GAT, GAT-B1, D13, D16 to D18, D20, D22, D24, D33). Each answers one question for
// one actor on one case in one state; the server (R1) and the pages ask the same functions. Nothing here changes a state. Roles and user ids, never
// names (D3): the actor's own seats come from `actor.me`, or from the state's seats by user id.
import { holdsRole, meFor, seatsOfRole, type Me, type SeatRow } from "@/features/auth/identity";
import type { Actor } from "@/features/cases/permissions";
import type { ReducedCase, State } from "@/features/cases/reducer";
import { approvalsFor, matchingRules, reviewApplies, reviewSeatFor } from "./rules";
import { currentStep } from "./steps";
import { COST_BASIS_MAX, COST_EUR_MAX, type ApprovalRule, type ApprovalStepInput, type CaseApprovals } from "./types";

/** What these rules read of the state: the seats, the company's settings with its roles, the loop's fast lane and the projects. */
export type RightsState = Pick<State, "seats" | "approvals" | "rules" | "projects">;
export type RightsCase = Pick<ReducedCase, "fromUserId" | "routeId" | "status" | "withdrawn" | "merged" | "review" | "cost" | "decided" | "approvals" | "approvalRuns" | "openingRunId" | "assigneeRoleId">;

const meOf = (actor: Pick<Actor, "userId" | "me">, seats: readonly SeatRow[]): Me => actor.me ?? meFor(actor.userId ?? null, seats);
const isManager = (actor: Pick<Actor, "role">): boolean => actor.role === "manager";
const roleOfSeat = (seats: readonly SeatRow[], seatId: string | null): string | null => (seatId === null ? null : seats.find((s) => s.id === seatId)?.roleId ?? null);

/** The actor raised this case (by user id, as the reducer keeps it). Nobody reviews, costs, moves or answers for their own idea (D13). */
export function isOwnIdea(actor: Pick<Actor, "userId">, kase: Pick<ReducedCase, "fromUserId">): boolean {
  return actor.userId != null && kase.fromUserId !== null && actor.userId === kase.fromUserId;
}

/** The actor holds the role of the seat the case's review sits on (D12), whatever the review's state. */
export function isReviewHolder(actor: Pick<Actor, "userId" | "me">, kase: Pick<ReducedCase, "review">, state: Pick<State, "seats">): boolean {
  return kase.review !== null && holdsRole(meOf(actor, state.seats), roleOfSeat(state.seats, kase.review.seatId));
}

/** May the actor review: the review is pending, the actor holds the review seat's role or is a manager, and it is not their own idea (D13). */
export function mayReview(actor: Actor, kase: RightsCase, state: Pick<State, "seats">): boolean {
  if (kase.review === null || kase.review.state !== "pending" || isOwnIdea(actor, kase)) return false;
  return isManager(actor) || isReviewHolder(actor, kase, state);
}

/** A cost the case may carry: a whole number of euros from 0 to the limit, with a basis of at most 300 characters (D18). */
export function validCost(eur: unknown, basis: unknown): boolean {
  return typeof eur === "number" && Number.isInteger(eur) && eur >= 0 && eur <= COST_EUR_MAX && typeof basis === "string" && basis.length <= COST_BASIS_MAX;
}

/**
 * May the actor record the cost (D18): the holders of the desk's role, of the review seat's role, the lead of the case's draft and managers, on a case
 * that is not withdrawn or merged and whose project has not started. Never on their own idea while it is reviewed (D13).
 */
export function mayCost(actor: Actor, kase: RightsCase, state: RightsState): boolean {
  if (kase.withdrawn !== null || kase.merged !== null) return false;
  const project = state.projects.find((p) => p.id === kase.decided?.projectId);
  if (project !== undefined && project.startedDay !== null) return false;
  if (kase.review?.state === "pending" && isOwnIdea(actor, kase)) return false;
  if (isManager(actor)) return true;
  const me = meOf(actor, state.seats);
  if (holdsRole(me, kase.assigneeRoleId)) return true;
  if (holdsRole(me, roleOfSeat(state.seats, kase.review?.seatId ?? null))) return true;
  return project !== undefined && actor.userId != null && project.leadUserId === actor.userId;
}

/** The approvals a yes on this case needs now: the rules for its desk, route and cost, and the roles the desk added by hand (D19, D20). */
export function requiredApprovals(kase: Pick<RightsCase, "assigneeRoleId" | "routeId" | "cost">, state: Pick<RightsState, "approvals" | "rules">, byHand: readonly string[] = []): ApprovalStepInput[] {
  return approvalsFor({
    config: state.approvals, roles: state.approvals.roles, fastLaneEur: state.rules.fastLaneEur,
    decidingRoleId: kase.assigneeRoleId, routeKey: kase.routeId, costEur: kase.cost?.eur ?? null, byHand,
  });
}

/** A plain yes is not allowed while approvals are required: only 'Yes, if approved' is (D20). */
export const yesNeedsApproval = (kase: Pick<RightsCase, "assigneeRoleId" | "routeId" | "cost">, state: Pick<RightsState, "approvals" | "rules">, byHand: readonly string[] = []): boolean =>
  requiredApprovals(kase, state, byHand).length > 0;

/** The role that answers a step: its role, or its council's secretary (D22). null for a role or council that no longer exists. */
function stepRoleId(step: { kind: string; roleId?: string; councilId?: string }, state: Pick<State, "approvals">): string | null {
  const id = step.kind === "council" ? state.approvals.councils.find((c) => c.id === step.councilId)?.secretaryRoleId : step.roleId;
  return id !== undefined && (step.kind === "council" || state.approvals.roles.some((r) => r.id === id)) ? id : null;
}

/**
 * May the actor answer an approval step (D22): the run is the active one, the step is its current step and the form was opened for its current
 * revision (an older form is stale), and the actor holds the step's role (a council's secretary role), or the seat a late hand-over named; never the
 * person who wrote the case.provisional. A manager answers only when they hold that role.
 */
export function mayAnswerStep(actor: Actor, kase: Pick<RightsCase, "approvals">, state: Pick<State, "seats" | "approvals">, form: { runId: string; stepId: string; dueRev: number }): boolean {
  const run = kase.approvals;
  if (run === null || run.done || run.runId !== form.runId) return false;
  const step = currentStep(run);
  if (step === null || step.id !== form.stepId || step.dueRev !== form.dueRev) return false;
  if (actor.userId == null || actor.userId === run.deciderUserId) return false;
  const me = meOf(actor, state.seats);
  if (step.seatId !== null && me.seatIds.includes(step.seatId)) return true;
  return holdsRole(me, stepRoleId(step, state));
}

/**
 * The seat a second look goes to when review applies to the case's route (D17): the review seat, never one the raiser holds. null when review does not
 * apply, no seat is free, or the person who said no holds the review role: NOR's rule (the route's deputy role) applies then.
 */
export function appealSeatWithReview(kase: Pick<RightsCase, "fromUserId" | "routeId">, state: Pick<State, "seats" | "approvals">, noSayerUserId: string | null): SeatRow | null {
  const config = state.approvals;
  if (!reviewApplies(config, kase.routeId)) return null;
  const reviewRole = config.review.roleId;
  if (reviewRole !== null && noSayerUserId !== null && seatsOfRole(state.seats, reviewRole).some((s) => s.userId === noSayerUserId)) return null;
  return reviewSeatFor({ config, seats: state.seats, roles: config.roles, raiserUserId: kase.fromUserId });
}

/** Every role whose holders may open the case and its draft because of its approvals (D24): the step roles of the active and the last run, each council step's secretary and member roles, and the roles of seats a late step was handed to. */
export function approverRoleIds(kase: Pick<RightsCase, "approvals" | "approvalRuns">, state: Pick<State, "seats" | "approvals">): string[] {
  const last = kase.approvalRuns[kase.approvalRuns.length - 1] ?? null;
  const roles = new Set<string>();
  for (const run of [kase.approvals, last]) {
    for (const step of run?.steps ?? []) {
      if (step.roleId !== undefined) roles.add(step.roleId);
      if (step.kind === "council") {
        const council = state.approvals.councils.find((c) => c.id === step.councilId);
        if (council) [council.secretaryRoleId, ...council.memberRoleIds].forEach((r) => roles.add(r));
      }
      const handed = roleOfSeat(state.seats, step.seatId);
      if (handed !== null) roles.add(handed);
    }
  }
  return [...roles];
}

/**
 * May the actor move the case to a desk (D16): managers on an open or asked case, as NOR has it, and the holders of the review, triage and fallback
 * roles on a case without a route or with a review pending. Never on their own idea.
 */
export function mayMoveToDesk(actor: Actor, kase: RightsCase, state: Pick<State, "seats" | "approvals">): boolean {
  if (isOwnIdea(actor, kase) || (kase.status !== "open" && kase.status !== "asked")) return false;
  if (isManager(actor)) return true;
  if (kase.routeId !== null && kase.review?.state !== "pending") return false;
  const { review, triageRoleId, fallbackRoleId } = state.approvals;
  const me = meOf(actor, state.seats);
  return [review.roleId, triageRoleId, fallbackRoleId].some((roleId) => holdsRole(me, roleId));
}

/** The steps a run answered yes or conditions, as what they cover (D33). A step answered no covers nothing. */
const coveredBy = (run: CaseApprovals): ApprovalStepInput[] =>
  run.steps.filter((s) => s.state === "yes" || s.state === "conditions").map((s) => ({ kind: s.kind, roleId: s.roleId, councilId: s.councilId, coversUpToEur: s.coversUpToEur }));

/** Every run that counts toward Start: the opening run and every supplement run of the case, the active one included, whatever its outcome (D33). */
function coveringRuns(kase: Pick<RightsCase, "approvals" | "approvalRuns" | "openingRunId">): CaseApprovals[] {
  const seen = new Set<string>();
  return [...kase.approvalRuns, ...(kase.approvals ? [kase.approvals] : [])].filter((r) => {
    if (seen.has(r.runId) || !(r.runId === kase.openingRunId || r.supplement)) return false;
    seen.add(r.runId);
    return true;
  });
}

/** What the opening run and every supplement run approved, step by step (D33). */
export const approvalCoverage = (kase: Pick<RightsCase, "approvals" | "approvalRuns" | "openingRunId">): ApprovalStepInput[] => coveringRuns(kase).flatMap(coveredBy);

const ruleNames = (rule: ApprovalRule, state: Pick<State, "approvals">): boolean =>
  rule.kind === "council" ? state.approvals.councils.some((c) => c.id === rule.councilId) : state.approvals.roles.some((r) => r.id === rule.roleId);

/**
 * What a case decided yes still lacks before it may start (D33): the requirements as they stand now (the rules, the cost and the roles today, the
 * opening run's deciding role and hand-added roles) that no step of the coverage meets, and the matching rules that name a role or council that no
 * longer exists, which no supplement can meet. Both empty for a case that is not decided yes or has no opening run.
 */
export function unmetApprovals(kase: Pick<RightsCase, "decided" | "routeId" | "cost" | "approvals" | "approvalRuns" | "openingRunId">, state: Pick<State, "approvals" | "rules">): { missing: ApprovalStepInput[]; broken: ApprovalRule[] } {
  const opening = kase.openingRunId === null ? undefined : [...kase.approvalRuns, ...(kase.approvals ? [kase.approvals] : [])].find((r) => r.runId === kase.openingRunId);
  if (kase.decided?.answer !== "yes" || opening === undefined) return { missing: [], broken: [] };
  const cost = kase.cost?.eur ?? null;
  const byHand = opening.steps.filter((s) => s.byHand === true && s.roleId !== undefined).map((s) => s.roleId as string);
  const required = approvalsFor({
    config: state.approvals, roles: state.approvals.roles, fastLaneEur: state.rules.fastLaneEur,
    decidingRoleId: opening.decidingRoleId, routeKey: kase.routeId, costEur: cost, byHand,
  });
  const coverage = approvalCoverage(kase);
  const met = (need: ApprovalStepInput): boolean => coverage.some((c) => {
    if (need.kind === "council") return c.kind === "council" && c.councilId === need.councilId;
    if (need.kind === "budget") return c.kind === "budget" && c.roleId === need.roleId && (c.coversUpToEur === null || c.coversUpToEur === undefined || cost === null || c.coversUpToEur >= cost);
    return c.kind !== "council" && c.roleId === need.roleId;
  });
  return {
    missing: required.filter((need) => !met(need)),
    broken: matchingRules(state.approvals, kase.routeId, cost).filter((rule) => !ruleNames(rule, state)),
  };
}
