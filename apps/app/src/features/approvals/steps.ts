// The steps of an approval run as pure functions (plan GAT, GAT-B1, D23): which step is current, its revision id, when it is due, where it goes
// when it is late, what to call it. No state is changed here; the reducer (A1) and the clock (C1) call these.
import type { SeatRow } from "@/features/auth/identity";
import { firstManagerSeat } from "./rules";
import type { ApprovalConfig, ApprovalRoleInfo, ApprovalStep, CaseApprovals, Council } from "./types";

type StepCase = { approvals: CaseApprovals | null; approvalRuns: readonly CaseApprovals[]; openingRunId: string | null };

/** The step waiting for an answer: the lowest step of the active run that is not yes or conditions yet. null when there is no active run or it is done. */
export function currentStep(approvals: CaseApprovals | null): ApprovalStep | null {
  if (approvals === null || approvals.done) return null;
  return approvals.steps.find((s) => s.state === "pending") ?? null;
}

/** The identity a due fact and an answer carry for a step: '<step id>@<dueRev>', so a send-back starts a new reminder and a new escalation (D23). */
export const dueStepId = (step: Pick<ApprovalStep, "id" | "dueRev">): string => `${step.id}@${step.dueRev}`;

/** The first meeting day of the council on or after `from`: firstDay + k·everyDays, k from 0. */
export function nextMeetingDay(council: Pick<Council, "firstDay" | "everyDays">, from: number): number {
  if (from <= council.firstDay) return council.firstDay;
  return council.firstDay + Math.ceil((from - council.firstDay) / council.everyDays) * council.everyDays;
}

/**
 * The day a step is due once it becomes current on day `from` (D23): a budget or role step approval_days later; a council step the council's next
 * meeting on or after `from`. A council that no longer exists has no meeting: the step is due like a role step.
 */
export function stepDueDay(step: Pick<ApprovalStep, "kind" | "councilId">, from: number, config: Pick<ApprovalConfig, "approvalDays" | "councils">): number {
  const council = step.kind === "council" ? config.councils.find((c) => c.id === step.councilId) : undefined;
  return council ? nextMeetingDay(council, from) : from + config.approvalDays;
}

/**
 * The seat a late step goes to (D23): the first occupied seat of the role the step's role reports to (a council's role is its secretary's); for a
 * role or council that no longer exists, the first manager role's seat. null when nobody sits there.
 */
export function lateSeat(
  step: Pick<ApprovalStep, "kind" | "roleId" | "councilId">,
  seats: readonly SeatRow[],
  roles: readonly ApprovalRoleInfo[],
  extra: { councils?: readonly Council[]; managerUserIds?: ReadonlySet<string> } = {},
): SeatRow | null {
  const sorted = [...seats].sort((a, b) => a.sort - b.sort);
  const occupied = (roleId: string | null | undefined) => (roleId == null ? null : sorted.find((s) => s.roleId === roleId && s.userId !== null) ?? null);
  const roleId = step.kind === "council" ? extra.councils?.find((c) => c.id === step.councilId)?.secretaryRoleId : step.roleId;
  const role = roleId === undefined ? undefined : roles.find((r) => r.id === roleId);
  if (role === undefined) {
    const manager = firstManagerSeat({ seats, managerUserIds: extra.managerUserIds ?? new Set() });
    return manager ? occupied(manager.roleId) : null;
  }
  return occupied(role.reportsToId);
}

/** What to call a step on a page or in a notice: the role's title or the council's name; empty for a role or council that no longer exists. */
export function stepLabel(step: Pick<ApprovalStep, "kind" | "roleId" | "councilId">, config: Pick<ApprovalConfig, "councils">, roles: readonly ApprovalRoleInfo[]): { kind: ApprovalStep["kind"]; name: string } {
  const name = step.kind === "council" ? config.councils.find((c) => c.id === step.councilId)?.name : roles.find((r) => r.id === step.roleId)?.title;
  return { kind: step.kind, name: name ?? "" };
}

/** The runs to show for a case: the active one first, then the finished ones, newest first; `opening` marks the run whose yes decided the case (N5, D33). */
export function runsOf(kase: StepCase): { run: CaseApprovals; active: boolean; opening: boolean }[] {
  const active = kase.approvals;
  const finished = [...kase.approvalRuns].reverse().filter((r) => r.runId !== active?.runId);
  const all = active === null ? finished : [active, ...finished];
  return all.map((run) => ({ run, active: run === active && !run.done, opening: run.runId === kase.openingRunId }));
}
