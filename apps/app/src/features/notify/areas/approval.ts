// The approval area of the notify registries (REG D6, D10; plan GAT, D26): the review and approval events that mail, the three duty reminders and
// which template a person's existing switch covers. GAT adds to this file, never to the composers (plan.ts, digest.ts, templates.ts, channels.ts,
// server/loop-notice.ts). The notice builders are features/loop/notice/approval.ts and the reminders' real audiences and Dues come with GAT-C1; until then an
// approval reminder reaches nobody. The final yes and an approval's no are told by the existing case.decided notices.
import type { ReminderAudienceFn, ReminderTextFn } from "./shared";

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

/** Who gets each approval reminder: nobody until GAT-C1 reads the review and the steps. */
export const APPROVAL_REMINDER_AUDIENCE: Record<ApprovalReminderKind, ReminderAudienceFn> = {
  review: () => null,
  approval: () => null,
  council: () => null,
};

/** The reminders nobody can switch off (Q2.10). */
export const APPROVAL_DUTY_TEMPLATES = ["reminder.review", "reminder.approval", "reminder.council"] as const;
export const APPROVAL_LOOP_MAIL_TYPES = ["case.reviewed", "case.provisional", "case.approval"] as const;
