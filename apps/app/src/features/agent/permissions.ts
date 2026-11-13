// Who may do what with the project agent (plan AGT, D15). Pure: a viewer, the project or case and the agent's state in, a verdict out. The
// verdict's key is a projectAgent perm key, so the server action shows the sentence in the person's language. Managers are `role === "manager"`.
// A Plan is written as project.step.added only when mayAppend allows that event for the person: that check is the action's (AGT-J1), not here.
import { currentStep } from "@/features/approvals/steps";
import { meFor, holdsRole, type Me, type SeatRow } from "@/features/auth/identity";
import type { ReducedCase, State } from "@/features/cases/reducer";
import { onDeskOf } from "@/features/cases/selectors";
import { isSponsor } from "@/features/projects/permissions";
import type { ReducedProject } from "@/features/projects/types";
import { DISMISS_WHY_MAX, NUDGE_MAX, PLAN_RUNS_MAX, REPORT_MAX, STEP_TITLE_MAX } from "./limits";
import type { AgentState, AgentSuggestion, AgentSuggestionKind } from "./types";

export type PermKey =
  | "projectAgent.permLeadOnly" | "projectAgent.permAnswer" | "projectAgent.permOpenOnly" | "projectAgent.permFlagOff" | "projectAgent.permRunning"
  | "projectAgent.permPlanDesk" | "projectAgent.permPlanRuns" | "projectAgent.permPlanState" | "projectAgent.permText" | "projectAgent.permWeekSent";
export type AgentVerdict = { ok: true } | { ok: false; key: PermKey };

/**
 * The person asking. `me` (their seats and roles) is needed only for what depends on a desk. `approver`: the server worked out that they hold the open
 * approval step of the case (holdsOpenStep): only server/agent/case-context.ts sets it, from the state it just reduced, never a client.
 */
export type AgentViewer = { userId: string | null; role: string; me?: Me; approver?: boolean };

const OK: AgentVerdict = { ok: true };
const no = (key: PermKey): AgentVerdict => ({ ok: false, key });
const isManager = (v: AgentViewer): boolean => v.role === "manager";
const isLead = (v: AgentViewer, p: Pick<ReducedProject, "leadUserId">): boolean => v.userId !== null && p.leadUserId === v.userId;
const meOf = (v: AgentViewer, seats: readonly SeatRow[]): Me => v.me ?? meFor(v.userId, seats);

/** The lead or a manager switches the agent on a draft or a running project; not on one that is done or stopped. */
export function maySwitchAgent(v: AgentViewer, p: ReducedProject): AgentVerdict {
  if (!isLead(v, p) && !isManager(v)) return no("projectAgent.permLeadOnly");
  return p.stopped !== null || p.doneDay !== null || p.status === "recognised" ? no("projectAgent.permRunning") : OK;
}

/** Accept or dismiss an open suggestion: the lead or a manager; a Report also the project's sponsor (not a Plan, not an Unblock). */
export function mayAnswerSuggestion(v: AgentViewer, p: ReducedProject, s: Pick<AgentSuggestion, "kind" | "status">): AgentVerdict {
  if (s.status !== "open") return no("projectAgent.permOpenOnly");
  if (isLead(v, p) || isManager(v)) return OK;
  if (s.kind === "report" && isSponsor(p, v.userId) && p.sponsorUserId !== p.leadUserId) return OK;
  return no("projectAgent.permAnswer");
}

/** The words a person may send after editing a suggestion: an Unblock nudge up to 600, a Report 1-4000, a Plan step's title 1-120 characters (D15). */
export function checkAgentText(kind: AgentSuggestionKind, text: string): AgentVerdict {
  const n = text.trim().length;
  const max = kind === "unblock" ? NUDGE_MAX : kind === "report" ? REPORT_MAX : STEP_TITLE_MAX;
  return n >= 1 && n <= max ? OK : no("projectAgent.permText");
}

/** A dismissal's reason: optional, at most 400 characters. */
export const checkDismissWhy = (why: string | undefined): AgentVerdict => ((why ?? "").trim().length <= DISMISS_WHY_MAX ? OK : no("projectAgent.permText"));

/** The Agent tab: the lead, the sponsor and managers. A team member and a raiser do not see it. */
export function maySeeAgentTab(v: AgentViewer, p: ReducedProject): AgentVerdict {
  return isLead(v, p) || isSponsor(p, v.userId) || isManager(v) ? OK : no("projectAgent.permAnswer");
}

/**
 * The person holds the open step of the case's approval run: the holder of its role, a council step's secretary role, or the seat a late hand-over
 * named (plan GAT, D22, D23). false without a run, and once the run is done: nobody has a step to hold then. Roles and seats by id, from `me`.
 */
export function holdsOpenStep(me: Me, kase: Pick<ReducedCase, "approvals">, state: Pick<State, "approvals">): boolean {
  const step = currentStep(kase.approvals);
  if (step === null) return false;
  if (step.seatId !== null && me.seatIds.includes(step.seatId)) return true;
  const roleId = step.kind === "council" ? state.approvals.councils.find((c) => c.id === step.councilId)?.secretaryRoleId : step.roleId;
  return holdsRole(me, roleId ?? null);
}

/**
 * A planning run: a holder of the case's desk or a manager, on a case that is open, in a discussion or waiting for approval (the desk still has the
 * idea, and what the plan says may help the approvers; REM Q7.9), at most PLAN_RUNS_MAX runs per case.
 */
export function mayPlanCase(v: AgentViewer, kase: ReducedCase, state: Pick<State, "seats">, agent: Pick<AgentState, "plans">): AgentVerdict {
  const onDesk = onDeskOf(kase, meOf(v, state.seats));
  if (!onDesk && !isManager(v)) return no("projectAgent.permPlanDesk");
  const waiting = kase.status === "approval";
  if (kase.archived || !(kase.open || waiting) || (kase.status !== "open" && kase.status !== "discussion" && !waiting)) return no("projectAgent.permPlanState");
  return (agent.plans[kase.id]?.length ?? 0) >= PLAN_RUNS_MAX ? no("projectAgent.permPlanRuns") : OK;
}

/**
 * The planning draft's words: the desk holder, managers, the people invited to the case's discussion and, while the case waits for approval, the
 * holders of the run's open step (REM Q7.10): they decide on the plan's steps and effort and need to read it.
 */
export function maySeePlan(v: AgentViewer, kase: ReducedCase, seats: readonly SeatRow[] = []): AgentVerdict {
  if (isManager(v)) return OK;
  if (v.userId !== null && kase.discussion?.invitedUserIds.includes(v.userId)) return OK;
  if (v.approver === true && v.userId !== null && kase.approvals !== null && !kase.approvals.done) return OK;
  return onDeskOf(kase, meOf(v, seats)) ? OK : no("projectAgent.permPlanDesk");
}

/** That a planning draft exists, and nothing more: the raiser sees this, and everyone who may see the draft. */
export function maySeePlanExists(v: AgentViewer, kase: ReducedCase, seats: readonly SeatRow[] = []): boolean {
  return maySeePlan(v, kase, seats).ok || (v.userId !== null && kase.fromUserId === v.userId);
}

export { holdsRole };
