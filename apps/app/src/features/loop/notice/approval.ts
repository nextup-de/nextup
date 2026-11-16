// The approval area of the loop mails (REG/D6; plan GAT, D3, D26): a forward, a provisional yes and an answer of an approval step. Roles, not people:
// desks and approvers are told by the holders of their role, the raiser, the lead and the decider by user id. An approval is named by its role's title or its
// council's name, a council's answer by how many were present and never who voted how. The final yes and an approval's no are told by the case.decided notices.
import { usersOfRole } from "@/features/auth/identity";
import { approverName } from "@/features/approvals/approvers";
import { currentStep, openSteps, stepLabel } from "@/features/approvals/steps";
import type { ApprovalStep, CaseApprovals } from "@/features/approvals/types";
import type { ReducedCase, State } from "@/features/cases/reducer";
import { dateOfWorkday } from "@/features/clock/calendar";
import type { T } from "@/i18n";
import { inDays, type NoticeBuilder, type NoticeBuilders } from "./shared";

/** A working-day number as the company's date, in the reader's numeric layout; "day N" where the company has no calendar (the demo). */
function dateOf(t: T, state: Pick<State, "clock">, day: number): string {
  if (state.clock.mode === "workdays") {
    try {
      const [y, m, d] = dateOfWorkday(day, state.clock.calendar).split("-");
      return t("caseNo.dateNumeric", { y, m, d });
    } catch {
      // A calendar without working days has no date to name.
    }
  }
  return t("mail.dayNumber", { day });
}

/** The run with this id, the active one or a finished one. */
const runOf = (kase: ReducedCase, runId: unknown): CaseApprovals | null =>
  typeof runId === "string" ? [kase.approvals, ...kase.approvalRuns].find((r) => r !== null && r.runId === runId) ?? null : null;

/** The users who answer a step: the handed seat's desk after a late hand-over, else the holders of the step's role or of a council's secretary role. */
function holdersOf(state: State, step: ApprovalStep, deskOf: (seatId: string | null | undefined) => string[]): string[] {
  if (step.userId !== undefined) return [step.userId]; // a named approver (decision A)
  if (step.seatId !== null) return deskOf(step.seatId);
  const role = step.kind === "council" ? state.approvals.councils.find((c) => c.id === step.councilId)?.secretaryRoleId : step.roleId;
  return role === undefined ? [] : usersOfRole(state.seats, role);
}

/** The title of the role of the desk a case is on; the seat's label when the role has no title. */
const deskName = (state: State, kase: ReducedCase): string => state.approvals.roles.find((r) => r.id === kase.assigneeRoleId)?.title || kase.assignee;

const ANSWER_KEY = { yes: "approvals.stepYes", conditions: "approvals.stepConditions", back: "approvals.stepBack", no: "approvals.stepNo" } as const;

/** case.reviewed (forward): the raiser hears who has the idea now, the new desk gets it (D26). A clock forward says it was not reviewed. */
const reviewedNotice: NoticeBuilder = ({ ev, state, pl, kase, send, caseLink, authorOf, deskOf }) => {
  if (!kase || pl.outcome !== "forward") return;
  const desk = deskName(state, kase);
  const auto = pl.auto === true;
  send(authorOf(kase), (t) => t("approvals.mailForwardedSubject", { desk }), (t) => [
    t("approvals.mailForwardedBody", { desk }), ...(auto ? ["", t("approvals.reviewAuto", { days: state.approvals.review.days })] : []), "", `  ${kase.title}`, "", caseLink(kase),
  ]);
  for (const who of deskOf(kase.assigneeSeatId)) {
    send(who, (t) => t("mail.passedDeskSubject", { title: kase.title }), (t) => [
      t("mail.passedDeskIntro", { actor: auto ? "NextUp" : ev.actor }), "", `  ${kase.title}`, "",
      t("mail.passedDeskNext", { when: inDays(t, kase.dueDay - state.day), url: caseLink(kase) }),
    ]);
  }
};

/** What to call the approver of a step: the named person (decision A), else the role's title or the council's name. */
const nameOf = (state: State, step: ApprovalStep): string =>
  step.userId !== undefined ? approverName(state.seats, step.userId) : stepLabel(step, state.approvals, state.approvals.roles).name;

/**
 * case.provisional: the raiser hears the yes waits for the approvers, in order; the holders of the first step are asked (D26). A parallel run asks every
 * approver at once (decision D); a resend is the raiser's own act, so only the approvers hear of it (decision B).
 */
const provisionalNotice: NoticeBuilder = ({ ev, state, kase, send, caseLink, authorOf, deskOf }) => {
  const run = kase ? runOf(kase, ev.id) : null;
  if (!kase || !run) return;
  if (run.parallel === true) {
    const resend = ev.payload.resend === true;
    if (!resend) {
      const names = run.steps.map((s) => nameOf(state, s)).filter((n) => n !== "").join(", ");
      send(authorOf(kase), (t) => t("approvals.mailProvisionalSubject", { title: kase.title }), (t) => [
        t("approvals.mailProvisionalBody", { actor: ev.actor, approvers: names }), "", `  ${kase.title}`, "", caseLink(kase),
      ]);
    }
    for (const step of openSteps(run)) {
      for (const who of holdersOf(state, step, deskOf)) {
        send(who, (t) => t("approvals.mailApprovalAskedSubject", { title: kase.title }), (t) => [
          t(resend ? "approvals.mailResentBody" : "approvals.mailApprovalAskedBody", { actor: ev.actor, when: step.dueDay === null ? "" : dateOf(t, state, step.dueDay) }), "", `  ${kase.title}`, "", caseLink(kase),
        ]);
      }
    }
    return;
  }
  const approvers = run.steps.map((s) => stepLabel(s, state.approvals, state.approvals.roles).name).filter((n) => n !== "").join(", ");
  send(authorOf(kase), (t) => t("approvals.mailProvisionalSubject", { title: kase.title }), (t) => [
    t("approvals.mailProvisionalBody", { actor: ev.actor, approvers }), "", `  ${kase.title}`, "", caseLink(kase),
  ]);
  const first = currentStep(run) ?? run.steps[0];
  if (!first) return;
  for (const who of holdersOf(state, first, deskOf)) {
    send(who, (t) => t("approvals.mailApprovalAskedSubject", { title: kase.title }), (t) => [
      t("approvals.mailApprovalAskedBody", { actor: ev.actor, when: first.dueDay === null ? "" : dateOf(t, state, first.dueDay) }), "", `  ${kase.title}`, "", caseLink(kase),
    ]);
  }
};

/** case.approval: the lead and the decider hear the answer (the reason of a send-back or a no, the conditions, how many were present); on a yes or conditions the next step's holders are asked (D26). */
const approvalNotice: NoticeBuilder = ({ ev, state, pl, kase, project, send, caseLink, deskOf, find, authorOf }) => {
  const run = kase ? runOf(kase, pl.runId) : null;
  const step = run?.steps.find((s) => s.id === pl.stepId);
  const answer = pl.approvalAnswer;
  if (!kase || !run || !step || answer === undefined || !(answer in ANSWER_KEY)) return;
  const approver = run.parallel === true ? approverName(state.seats, step.userId) || ev.actor : stepLabel(step, state.approvals, state.approvals.roles).name;
  // A parallel run's no returns the idea to its raiser (decision B): they hear who said no and why, and that they may change it and send it again.
  if (run.parallel === true && answer === "no") {
    send(authorOf(kase), (t) => t("approvals.mailReturnedSubject", { title: kase.title }), (t) => [
      t("approvals.mailReturnedBody", { approver }), ...(pl.reason ? ["", t("caseNo.reasonLine", { why: pl.reason })] : []), "", `  ${kase.title}`, "", caseLink(kase),
    ]);
  }
  const lead = (state.projects.find((p) => p.id === run.projectId) ?? project)?.leadUserId ?? null;
  const lines = (t: T): string[] => [
    t("approvals.mailApprovalAnsweredBody", { approver, answer: t(ANSWER_KEY[answer]) }),
    ...((answer === "back" || answer === "no") && pl.reason ? ["", t("caseNo.reasonLine", { why: pl.reason })] : []),
    ...(answer === "conditions" && pl.conditions ? ["", `${t("approvals.conditions")}: ${pl.conditions}`] : []),
    ...(step.kind === "council" && typeof pl.present === "number" ? ["", `${t("approvals.present")}: ${pl.present}`] : []),
    "", `  ${kase.title}`, "", caseLink(kase),
  ];
  for (const who of [lead, run.deciderUserId]) send(who, (t) => t("approvals.mailApprovalAnsweredSubject", { approver, answer: t(ANSWER_KEY[answer]) }), lines);
  // A parallel run asked everyone at once: nobody is asked next (decision D).
  const next = (answer === "yes" || answer === "conditions") && run.parallel !== true ? currentStep(run) : null;
  if (!next) return;
  const decider = find(run.deciderUserId)?.name ?? "";
  for (const who of holdersOf(state, next, deskOf)) {
    send(who, (t) => t("approvals.mailApprovalAskedSubject", { title: kase.title }), (t) => [
      t("approvals.mailApprovalAskedBody", { actor: decider, when: next.dueDay === null ? "" : dateOf(t, state, next.dueDay) }), "", `  ${kase.title}`, "", caseLink(kase),
    ]);
  }
};

export const APPROVAL_NOTICES: NoticeBuilders = {
  "case.reviewed": reviewedNotice,
  "case.provisional": provisionalNotice,
  "case.approval": approvalNotice,
};
