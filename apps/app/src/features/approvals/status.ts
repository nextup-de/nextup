// Where an idea's approval stands, as one plain object (decisions A to D, Kevin and Sam, 16 Nov 2026): who the approvers are, what each said, how many
// approved of how many, who it still waits on, and the no that returned it to its raiser. The idea page's approver line renders it, and the Ideas tab
// can show "2 of 3 approved · waiting on Anna Weber" from it (approvalLine). Pure: the reduced case and the state in, facts out.
import type { ReducedCase, State } from "@/features/cases/reducer";
import type { T } from "@/i18n";
import { approverName } from "./approvers";
import { returnedRun, stepLabel } from "./steps";
import type { ApprovalReturn, ApprovalStep, CaseApprovals } from "./types";

/** What one approver said: approved (yes or yes with conditions), still pending, or no. */
export type ApproverAnswer = "approved" | "pending" | "no";

export type ApproverView = {
  stepId: string;
  /** The named person (decision A); null on an old run's step, which a role or a council answers. */
  userId: string | null;
  /** The person's name, or the role's title or the council's name on an old step; empty when neither is known any more. */
  name: string;
  answer: ApproverAnswer;
};

/**
 * `none`: no approval was asked; `pending`: the approvers are voting; `returned`: one no sent the idea back to its raiser (decision B); `approved`: every
 * approver said yes; `refused`: an old sequential run said no, which decided the idea no (D22).
 */
export type IdeaApprovalState = "none" | "pending" | "returned" | "approved" | "refused";

export type IdeaApprovalStatus = {
  state: IdeaApprovalState;
  approved: number;
  total: number;
  approvers: ApproverView[];
  /** The approvers still pending, in the run's order. */
  waitingOn: ApproverView[];
  /** The no that returned the idea, while it is back with its raiser; null otherwise. */
  returned: ApprovalReturn | null;
  /** The run this is about; null with state `none`. */
  runId: string | null;
  /** The run is a parallel approval among named people (decisions A to D); false for an old sequential run. */
  parallel: boolean;
};

type StatusCase = Pick<ReducedCase, "status" | "approvals" | "approvalRuns" | "openingRunId">;
type StatusState = Pick<State, "seats" | "approvals">;

const NONE: IdeaApprovalStatus = { state: "none", approved: 0, total: 0, approvers: [], waitingOn: [], returned: null, runId: null, parallel: false };

/** The run an idea's approval is about: the active one, else the one that returned it, else the one whose yes decided it, else the last one. */
function runOf(kase: StatusCase): CaseApprovals | null {
  if (kase.approvals !== null && !kase.approvals.supplement) return kase.approvals;
  const back = returnedRun(kase);
  if (back !== null) return back;
  const opening = kase.approvalRuns.find((r) => r.runId === kase.openingRunId);
  return opening ?? [...kase.approvalRuns].reverse().find((r) => !r.supplement) ?? null;
}

const answerOf = (step: ApprovalStep): ApproverAnswer => (step.state === "yes" || step.state === "conditions" ? "approved" : step.state === "no" ? "no" : "pending");

/** Where the idea's approval stands (decisions A to D). Old sequential runs are read the same way, each step named by its role or council. */
export function ideaApprovalStatus(kase: StatusCase, state: StatusState): IdeaApprovalStatus {
  const run = runOf(kase);
  if (run === null) return NONE;
  const approvers = run.steps.map((step): ApproverView => ({
    stepId: step.id,
    userId: step.userId ?? null,
    name: step.userId !== undefined ? approverName(state.seats, step.userId) : stepLabel(step, state.approvals, state.approvals.roles).name,
    answer: answerOf(step),
  }));
  const returned = run.parallel === true && run.outcome === "no" ? run.returned ?? null : null;
  const live = !run.done ? "pending" : run.outcome === "yes" ? "approved" : returned !== null ? "returned" : "refused";
  return {
    state: live,
    approved: approvers.filter((a) => a.answer === "approved").length,
    total: approvers.length,
    approvers,
    // Nobody is waited on once the run is over: a no ends it for everyone.
    waitingOn: run.done ? [] : approvers.filter((a) => a.answer === "pending"),
    returned: returned !== null && returnedRun(kase) !== null ? returned : null,
    runId: run.runId,
    parallel: run.parallel === true,
  };
}

/**
 * "2 of 3 approved · waiting on Anna Weber": the count, and while it is pending who it waits on. No zero is shown (DESIGN_RULES 2): before the first yes
 * the line is "Waiting on …" alone. Empty when no approval was asked.
 */
export function approvalLine(status: IdeaApprovalStatus, t: T): string {
  if (status.state === "none" || status.total === 0) return "";
  const names = status.waitingOn.map((a) => a.name).filter((n) => n !== "").join(", ");
  if (status.approved === 0) return names === "" ? "" : t("approvals.approversWaitingFirst", { names });
  const count = t("approvals.approversCount", { n: status.approved, m: status.total });
  return names === "" ? count : `${count} · ${t("approvals.approversWaitingOn", { names })}`;
}
