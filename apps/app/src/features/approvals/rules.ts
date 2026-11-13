// The rules of review and approvals as pure functions (plan GAT, GAT-B1): who reviews a raise, where a raise lands when no desk is named, which
// approvals a yes needs. Everything a rule reads is an argument - the seats, the roles with their boss and spend limit, the managers' user ids,
// the company's configuration - so the server, the clock and the pages call one answer. Roles, not people (D3): a seat is found by its role and
// by user ids, never by a name.
import { fallbackSeat } from "@/features/cases/stamp";
import type { SeatRow } from "@/features/auth/identity";
import type { ApprovalConfig, ApprovalRoleInfo, ApprovalRule, ApprovalStepInput } from "./types";

const bySort = (seats: readonly SeatRow[]): SeatRow[] => [...seats].sort((a, b) => a.sort - b.sort);

/** The first seat of `roleId` with someone on it, whoever holds it, except a seat held by `not` (a user id). */
function firstSeatOf(seats: readonly SeatRow[], roleId: string | null, not: string | null = null): SeatRow | null {
  if (roleId === null) return null;
  return bySort(seats).find((s) => s.roleId === roleId && s.userId !== null && (not === null || s.userId !== not)) ?? null;
}

/** Is a raise on this route reviewed (D12)? A route that says always, or follows the company switch (the default and a raise without a route) and the switch is on. */
export function reviewApplies(config: Pick<ApprovalConfig, "review">, routeKey: string | null): boolean {
  const mode = routeKey === null ? undefined : config.review.routes[routeKey];
  if (mode === "always") return true;
  if (mode === "never") return false;
  return config.review.on;
}

/**
 * The seat that reviews a raise (D12): the first occupied seat of the review role that the raiser does not hold; else of the review's deputy role;
 * else of the role the review role reports to. null when none of them gives a seat: the raise is then not reviewed. Nobody reviews their own idea.
 */
export function reviewSeatFor(input: { config: Pick<ApprovalConfig, "review">; seats: readonly SeatRow[]; roles: readonly ApprovalRoleInfo[]; raiserUserId: string | null }): SeatRow | null {
  const { config, seats, roles, raiserUserId } = input;
  const role = config.review.roleId;
  if (role === null) return null;
  const above = roles.find((r) => r.id === role)?.reportsToId ?? null;
  for (const id of [role, config.review.deputyRoleId, above]) {
    const seat = firstSeatOf(seats, id, raiserUserId);
    if (seat) return seat;
  }
  return null;
}

/** The first seat, by sort, whose holder has the app role manager (D16); 'the manager role' is that seat's role. */
export function firstManagerSeat(input: { seats: readonly SeatRow[]; managerUserIds: ReadonlySet<string> }): SeatRow | null {
  return bySort(input.seats).find((s) => s.userId !== null && input.managerUserIds.has(s.userId)) ?? null;
}

type DeskInput = { config: Pick<ApprovalConfig, "review" | "triageRoleId" | "fallbackRoleId">; seats: readonly SeatRow[]; roles: readonly ApprovalRoleInfo[]; managerUserIds: ReadonlySet<string>; raiserUserId: string | null };

/**
 * The seat a setting names, else the first manager role's seat, else today's head of the org chart (block A), so a raise always lands somewhere
 * unless the company has no org chart at all. The review seat comes first while the company's review switch is on (D16).
 */
function deskSeat(input: DeskInput, roleId: string | null): SeatRow | null {
  const { config, seats, roles, managerUserIds, raiserUserId } = input;
  if (config.review.on) {
    const review = reviewSeatFor({ config, seats, roles, raiserUserId });
    if (review) return review;
  }
  const named = firstSeatOf(seats, roleId);
  if (named) return named;
  const manager = firstManagerSeat({ seats, managerUserIds });
  const ofManagerRole = manager ? firstSeatOf(seats, manager.roleId) : null;
  if (ofManagerRole) return ofManagerRole;
  // fallbackSeat reads only the seats and the roles' places in the chart; an ApprovalRoleInfo has both.
  return fallbackSeat({ seats, roles: roles.map((r) => ({ id: r.id, orgUnitId: "", reportsToId: r.reportsToId })) });
}

/** Who holds a raise without a route (D16): the review seat when review is on, else the Triage role's seat, else the first manager role's seat, else the head of the chart. */
export const triageSeat = (input: DeskInput): SeatRow | null => deskSeat(input, input.config.triageRoleId);

/** Who holds a raise onto a route without an owner seat (D16): the review seat when review is on, else the fallback role's seat, else the first manager role's seat, else the head of the chart. */
export const fallbackSeatFor = (input: DeskInput): SeatRow | null => deskSeat(input, input.config.fallbackRoleId);

/** A cost above the fast lane flags the approvals that follow a yes (D12). No cost, no flag. */
export function costFlag(costEur: number | null | undefined, fastLaneEur: number): boolean {
  return typeof costEur === "number" && costEur > fastLaneEur;
}

const ruleMatches = (rule: ApprovalRule, routeKey: string | null, costEur: number | null): boolean =>
  (rule.routeKey === null || rule.routeKey === routeKey) && (rule.minEur === null || (costEur !== null && rule.minEur <= costEur));

/** The rules of `config` that apply to a case on this route at this cost, whether or not what they name still exists (D19, D33). */
export const matchingRules = (config: Pick<ApprovalConfig, "rules">, routeKey: string | null, costEur: number | null): ApprovalRule[] =>
  config.rules.filter((rule) => ruleMatches(rule, routeKey, costEur));

/**
 * The approver of a cost for a desk (D19): the first role up the chain above the deciding role whose spend limit (none counts as 0) is at least the
 * cost, else the top role of the chain. null when the deciding role has nobody above it. The step covers up to that role's limit, or any cost for
 * the top role taken because nobody above reaches the cost (D33).
 */
function budgetApprover(roles: readonly ApprovalRoleInfo[], decidingRoleId: string | null, costEur: number): { roleId: string; covers: number | null } | null {
  const byId = new Map(roles.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const at = decidingRoleId === null ? null : byId.get(decidingRoleId) ?? null;
  if (at === null) return null;
  seen.add(at.id);
  let top: ApprovalRoleInfo | null = null;
  for (let up = at.reportsToId === null ? null : byId.get(at.reportsToId) ?? null; up !== null && !seen.has(up.id); up = up.reportsToId === null ? null : byId.get(up.reportsToId) ?? null) {
    seen.add(up.id);
    top = up;
    if ((up.spendLimitEur ?? 0) >= costEur) return { roleId: up.id, covers: up.spendLimitEur };
  }
  return top === null ? null : { roleId: top.id, covers: null };
}

/**
 * The ordered approvals a yes needs (D19): the budget step, one step per council rule, one per role rule, then the roles the desk added by hand.
 * The deciding role is never asked, the same role or council twice is kept once at its first place, and a rule naming a role or council that no longer
 * exists is skipped (unmetApprovals reports it). A case without a cost has no budget step.
 */
export function approvalsFor(input: {
  config: Pick<ApprovalConfig, "rules" | "councils">;
  roles: readonly ApprovalRoleInfo[];
  fastLaneEur: number;
  decidingRoleId: string | null;
  routeKey: string | null;
  costEur: number | null;
  byHand: readonly string[];
}): ApprovalStepInput[] {
  const { config, roles, fastLaneEur, decidingRoleId, routeKey, costEur, byHand } = input;
  const steps: ApprovalStepInput[] = [];
  const roleSeen = new Set<string>(decidingRoleId === null ? [] : [decidingRoleId]);
  const councilSeen = new Set<string>();
  const addRole = (step: ApprovalStepInput & { roleId: string }) => {
    if (roleSeen.has(step.roleId)) return;
    roleSeen.add(step.roleId);
    steps.push(step);
  };

  const deciding = decidingRoleId === null ? undefined : roles.find((r) => r.id === decidingRoleId);
  if (costEur !== null && costEur > fastLaneEur && costEur > (deciding?.spendLimitEur ?? 0)) {
    const approver = budgetApprover(roles, decidingRoleId, costEur);
    if (approver) addRole({ kind: "budget", roleId: approver.roleId, coversUpToEur: approver.covers });
  }
  const rules = matchingRules(config, routeKey, costEur);
  for (const rule of rules) {
    if (rule.kind !== "council" || rule.councilId === undefined || councilSeen.has(rule.councilId)) continue;
    if (!config.councils.some((c) => c.id === rule.councilId)) continue;
    councilSeen.add(rule.councilId);
    steps.push({ kind: "council", councilId: rule.councilId });
  }
  for (const rule of rules) {
    if (rule.kind !== "role" || rule.roleId === undefined || !roles.some((r) => r.id === rule.roleId)) continue;
    addRole({ kind: "role", roleId: rule.roleId });
  }
  for (const roleId of byHand) if (roles.some((r) => r.id === roleId)) addRole({ kind: "role", roleId, byHand: true });
  return steps;
}
