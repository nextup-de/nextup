// What the case page shows of review and approvals (plan GAT, GAT-U1, D12, D13, D18, D22, D23), as plain facts: the review while it is pending, the cost,
// the flag that approvals are likely, every run with its steps and who may answer the current one. Pure: the reduced case, the state and who is looking
// in, facts out; the components only render them. A step never carries who answered it, and a council's answer only how many were present (D3).
import { holdsRole, type Me } from "@/features/auth/identity";
import type { Role } from "@/config/roles";
import type { ReducedCase, State } from "@/features/cases/reducer";
import { mayAnswerStep } from "./rights";
import { costFlag } from "./rules";
import { runsOf, stepLabel } from "./steps";
import type { ApprovalStep, CaseCost } from "./types";

type ViewCase = Pick<ReducedCase, "review" | "cost" | "approvals" | "approvalRuns" | "openingRunId" | "assigneeRoleId">;
type ViewState = Pick<State, "seats" | "approvals" | "rules">;

export type StepView = {
  id: string;
  /** The role's title or the council's name; empty for a role or council that no longer exists. */
  label: string;
  kind: ApprovalStep["kind"];
  dueDay: number | null;
  state: ApprovalStep["state"];
  /** The seat a late hand-over named, as it is shown; null while the step is with its own role. */
  seatLabel: string | null;
  /** The title of that seat's role: 'Handed to {role} (late)'; null while the step is with its own role. */
  handedRole: string | null;
  handed: boolean;
  /** What was said at the step, oldest first. No name: the page shows the outcome of a step, never who gave it. */
  answers: { answer: "yes" | "conditions" | "back" | "no"; reason: string; conditions: string | null; present: number | null; day: number }[];
};

export type RunView = {
  runId: string;
  active: boolean;
  /** The run whose final yes decided the case (D33). */
  opening: boolean;
  supplement: boolean;
  outcome: "yes" | "no" | null;
  steps: StepView[];
};

export type CaseApprovalView = {
  /** The review of the raise: null on a case that never had one. `seatLabel` is the seat it sits on, `dueDay` the day it should be forwarded by. */
  review: { pending: boolean; seatLabel: string | null; dueDay: number; auto: boolean } | null;
  cost: CaseCost | null;
  /** The viewer sees 'Approvals are likely after a yes': the cost is above the fast lane and the viewer is on the desk or on the review seat (D12). */
  flag: boolean;
  /** The active run first, then every finished run, newest first. */
  runs: RunView[];
  /** The current step of the active run when the viewer may answer it, with the identity the answer must carry (D22); null otherwise. */
  myStep: { runId: string; stepId: string; dueRev: number } | null;
};

export function caseApprovalView(kase: ViewCase, state: ViewState, me: Me): CaseApprovalView {
  const config = state.approvals;
  const seatOf = (id: string | null) => (id === null ? undefined : state.seats.find((s) => s.id === id));
  const review = kase.review === null ? null : { pending: kase.review.state === "pending", seatLabel: seatOf(kase.review.seatId)?.label ?? null, dueDay: kase.review.dueDay, auto: kase.review.auto };
  const stepView = (step: ApprovalStep): StepView => ({
    id: step.id,
    label: stepLabel(step, config, config.roles).name,
    kind: step.kind,
    dueDay: step.dueDay,
    state: step.state,
    seatLabel: seatOf(step.seatId)?.label ?? null,
    handedRole: config.roles.find((r) => r.id === seatOf(step.seatId)?.roleId)?.title ?? null,
    handed: step.seatId !== null,
    answers: step.answers.map((a) => ({ answer: a.answer, reason: a.reason, conditions: a.conditions, present: a.present, day: a.day })),
  });
  const runs = runsOf(kase).map(({ run, active, opening }): RunView => ({
    runId: run.runId, active, opening, supplement: run.supplement, outcome: run.outcome, steps: run.steps.map(stepView),
  }));

  // Who may answer: the rule is mayAnswerStep's, asked with the run, step and revision as the page shows them.
  const active = kase.approvals;
  const current = active === null || active.done ? undefined : active.steps.find((s) => s.state === "pending");
  const actor = { role: "member" as Role, name: "", handle: null, userId: me.userId, me };
  const myStep = active !== null && current !== undefined && mayAnswerStep(actor, kase, state, { runId: active.runId, stepId: current.id, dueRev: current.dueRev })
    ? { runId: active.runId, stepId: current.id, dueRev: current.dueRev } : null;

  const reviewRole = kase.review === null ? null : seatOf(kase.review.seatId)?.roleId ?? null;
  const onDeskOrReview = holdsRole(me, kase.assigneeRoleId) || holdsRole(me, reviewRole);
  return { review, cost: kase.cost, flag: onDeskOrReview && costFlag(kase.cost?.eur, state.rules.fastLaneEur), runs, myStep };
}
