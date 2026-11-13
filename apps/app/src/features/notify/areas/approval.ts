// The approval area of the notify registries (REG D6, D10; plan GAT, D14, D23, D26): the review and approval events that mail, the three duty reminders
// with their audiences and texts, and which template a person's existing switch covers. GAT adds to this file, never to the composers (plan.ts, digest.ts,
// templates.ts, channels.ts, server/loop-notice.ts). The loop notices themselves are built in features/loop/notice/approval.ts. The final yes and an
// approval's no are told by the existing case.decided notices. Roles, not people: a reminder goes to the holders of a seat's role, the lead and the
// decider by user id; no notice names who voted how (D3).
import { usersOfRole } from "@/features/auth/identity";
import type { CaseApprovals, ApprovalStep } from "@/features/approvals/types";
import type { ReducedCase } from "@/features/cases/reducer";
import type { PlanEvent, ReminderAudienceFn, ReminderCtx, ReminderTextFn } from "./shared";

export const APPROVAL_LOOP_TYPES = ["case.reviewed", "case.provisional", "case.approval"] as const;
export const APPROVAL_LOOP_TEMPLATES: readonly string[] = APPROVAL_LOOP_TYPES.map((t) => `loop.${t}`);
// A person's switch for case notices already covers them until they choose again.
export const APPROVAL_FOLLOWS: Record<string, string> = {
  "loop.case.reviewed": "loop.case.decided", "loop.case.provisional": "loop.case.decided", "loop.case.approval": "loop.case.decided",
  "reminder.review": "reminder.triage", "reminder.approval": "reminder.triage", "reminder.council": "reminder.triage",
};

export const APPROVAL_REMINDER_KINDS = ["review", "approval", "council"] as const;
type ApprovalReminderKind = (typeof APPROVAL_REMINDER_KINDS)[number];

/** The render entries of the approval reminders. */
export const APPROVAL_REMINDER_TEXTS: Record<`reminder.${ApprovalReminderKind}`, ReminderTextFn> = {
  "reminder.review": (_i, t, compose, { title, when, url }) =>
    compose(t("approvals.reminderReviewSubject", { title }), t("approvals.reminderReviewBody", { when }), t("mail.reminderOpenCase", { url })),
  "reminder.approval": (_i, t, compose, { title, when, url }) =>
    compose(t("approvals.reminderApprovalSubject", { title }), t("approvals.reminderApprovalBody", { when }), t("mail.reminderOpenCase", { url })),
  "reminder.council": (_i, t, compose, { title, when, url }) =>
    compose(t("approvals.reminderCouncilSubject", { title }), t("approvals.reminderCouncilBody", { when }), t("mail.reminderOpenCase", { url })),
};

/** The run and the step a clock fact is about: the fact carries the run's id and `<step id>@<due revision>` (D23). Finished runs are looked in too, so a late fact finds its step. */
function stepOf(kase: ReducedCase | undefined, ev: PlanEvent): { run: CaseApprovals; step: ApprovalStep } | null {
  const runId = ev.payload.originEventId;
  const stepKey = typeof ev.payload.stepId === "string" ? ev.payload.stepId.split("@")[0] : null;
  if (!kase || typeof runId !== "string" || stepKey === null) return null;
  const run = [kase.approvals, ...kase.approvalRuns].find((r) => r !== null && r.runId === runId) ?? null;
  const step = run?.steps.find((s) => s.id === stepKey);
  return run && step ? { run, step } : null;
}

/** The role whose holders answer a step: the step's role, or a council's secretary (D23). */
const answeringRole = (step: ApprovalStep, ctx: ReminderCtx): string | null =>
  step.kind === "council" ? ctx.state.approvals.councils.find((c) => c.id === step.councilId)?.secretaryRoleId ?? null : step.roleId ?? null;

/** Who gets each approval reminder: the review seat's role holders while the review is pending; a step's holders, after a late hand-over the handed seat, while it waits; the lead and the decider when a council moved it. */
export const APPROVAL_REMINDER_AUDIENCE: Record<ApprovalReminderKind, ReminderAudienceFn> = {
  review: (_ev, { kase, caseLink, usersOfSeat }) => {
    if (!kase) return null;
    const r = kase.review;
    // The forward is due on its own day; the reminder names the day the review should end (D14).
    return { users: r !== null && r.state === "pending" ? usersOfSeat(r.seatId) : [], title: kase.title, link: caseLink(kase.id), day: r?.dueDay };
  },
  approval: (ev, ctx) => {
    const found = stepOf(ctx.kase, ev);
    if (!ctx.kase || !found) return null;
    const { step } = found;
    const handed = ev.payload.check === 2;
    const role = answeringRole(step, ctx);
    const holders = handed ? ctx.usersOfSeat(ev.payload.toRoleHolderId) : step.seatId !== null ? ctx.usersOfSeat(step.seatId) : role === null ? [] : usersOfRole(ctx.state.seats, role);
    return { users: step.state === "pending" ? ctx.uniq(holders) : [], title: ctx.kase.title, link: ctx.caseLink(ctx.kase.id), day: step.dueDay };
  },
  council: (ev, ctx) => {
    const found = stepOf(ctx.kase, ev);
    if (!ctx.kase || !found) return null;
    const { run, step } = found;
    const lead = ctx.state.projects.find((p) => p.id === run.projectId)?.leadUserId ?? null;
    const told = [lead, run.deciderUserId].filter((u): u is string => u !== null);
    // The fact's own day is the next meeting the step moved to.
    return { users: step.state === "pending" ? ctx.uniq(told) : [], title: ctx.kase.title, link: ctx.caseLink(ctx.kase.id) };
  },
};

/** The reminders nobody can switch off (Q2.10). */
export const APPROVAL_DUTY_TEMPLATES = ["reminder.review", "reminder.approval", "reminder.council"] as const;
export const APPROVAL_LOOP_MAIL_TYPES = ["case.reviewed", "case.provisional", "case.approval"] as const;
