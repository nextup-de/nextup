// The discussion and project events that mail people (features/loop/notice.ts decides who). The mails themselves
// are planned from the log by the dispatcher (features/notify/plan.ts, server/notify/dispatch.ts) and sent from the
// outbox (plan NTF, D13); nothing here sends any more.
import type { CaseEventType } from "@/features/cases/events";
import { AGENT_LOOP_MAIL_TYPES } from "@/features/notify/areas/agent";
import { APPROVAL_LOOP_MAIL_TYPES } from "@/features/notify/areas/approval";
import { CASE_LOOP_MAIL_TYPES } from "@/features/notify/areas/case";
import { OVERLOAD_LOOP_MAIL_TYPES } from "@/features/notify/areas/overload";
import { PROJECT_LOOP_MAIL_TYPES } from "@/features/notify/areas/project";

// Composer (docs/process/README.md): a phase adds to its file under notify/areas/, never here.
export const LOOP_MAIL_TYPES: ReadonlySet<CaseEventType> = new Set<CaseEventType>([
  ...CASE_LOOP_MAIL_TYPES, ...PROJECT_LOOP_MAIL_TYPES, ...AGENT_LOOP_MAIL_TYPES, ...APPROVAL_LOOP_MAIL_TYPES, ...OVERLOAD_LOOP_MAIL_TYPES,
]);
