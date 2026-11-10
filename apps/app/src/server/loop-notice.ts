// The discussion and project events that mail people (features/loop/notice.ts decides who). The mails themselves
// are planned from the log by the dispatcher (features/notify/plan.ts, server/notify/dispatch.ts) and sent from the
// outbox (plan NTF, D13); nothing here sends any more.
import type { CaseEventType } from "@/features/cases/events";

export const LOOP_MAIL_TYPES: ReadonlySet<CaseEventType> = new Set<CaseEventType>([
  "case.discussion", "case.invited", "case.checkin", "case.decided",
  "case.asked", "case.answered", "case.unanswered", "case.handed",
  "project.handed", "project.member", "project.started", "project.done", "project.measured", "project.rewarded",
]);
