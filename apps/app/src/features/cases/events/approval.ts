// The approval area's events (plan REG, decision D6; plan GAT, D6): the review of a new idea, the cost estimate, the provisional yes
// and the answers of an approval run. GAT writes here; the composer (../events.ts) is closed. A field that more than one file
// uses (note, reason, routeId, projectId, stepId, ...) lives in CorePayload in ../events.ts.
import type { ApprovalStepInput } from "@/features/approvals/types";

/** The approval.* types the app may append, in the order of APP_EVENT_TYPES. */
export const APPROVAL_EVENT_TYPES = ["case.reviewed", "case.costed", "case.provisional", "case.approval"] as const;

/** Every approval-area type, with the fields it carries. */
export type ApprovalAreaEventType =
  | "case.reviewed" // { outcome: 'forward', routeId?, auto? }  the review seat sends the raise on to its desk (D12, D13); auto: the clock did, system:clock (D14). Send-back is case.asked
  | "case.costed" // { eur, basis }  the cost estimate of the case, the latest one counts (D18)
  | "case.provisional" // { approvals, supplement?, projectId?, lead?, leadUserId?, title?, draft?, raiserNote?, note? }  a yes that waits for approval: starts an approval run (D21, D32), runId = this event's id. supplement: the decision stands and only the missing approvals are asked (D33)
  | "case.approval"; // { runId, stepId, dueRev, step, approvalAnswer, reason?, conditions?, present?, plus NOR's no fields }  one answer of the current step; written only by the settle operation (D22, D32)

// Compile-time: every app type is a member of the area's union.
const _appTypesAreMembers: readonly ApprovalAreaEventType[] = APPROVAL_EVENT_TYPES;
void _appTypesAreMembers;

/**
 * The EventPayload fields only approval events carry. Reused from the core and the case area, with the same meaning and type: `note`,
 * `reason`, `routeId`, `toRoleHolderId`, `lead`, `leadUserId`, `projectId`, `title`, `draft`, `raiserNote`, `category`, `changeIf`,
 * `revisitDay`, `stepId` (an approval step's id, '<runId>:<index>', on case.approval and on its clock facts), and `outcome` (case.reviewed
 * carries 'forward'; the field is the case area's `outcome?: string`, which a narrower type here would break).
 */
export type ApprovalAreaPayload = {
  auto?: boolean; // case.reviewed: the clock forwarded it, nobody reviewed (D14)
  eur?: number; // case.costed: whole euros, 0-100000000 (D18)
  basis?: string; // case.costed: how it was estimated, up to 300 characters
  approvals?: ApprovalStepInput[]; // case.provisional: the steps the server computed, in order (D32)
  supplement?: boolean; // case.provisional: asks only the missing approvals of a decided case (D33)
  runId?: string; // case.approval and its clock facts: the approval run (the case.provisional event's id)
  dueRev?: number; // case.approval and its clock facts: the step's revision, +1 on each send-back (D22, D32)
  decidingRoleId?: string | null; // case.provisional: the role whose desk said the yes, frozen for the run (D33)
  step?: number; // case.approval: the index of the answered step in its run
  approvalAnswer?: "yes" | "conditions" | "back" | "no"; // case.approval (D22)
  conditions?: string; // case.approval: the text of an approval with conditions, 1-1000 characters
  present?: number; // case.approval of a council: how many were present, 0-200; never who voted how (D3)
  stepDueDay?: number; // case.approval and case.provisional: the due day the server stamped on the step this answer concerns (D23)
  nextStepDueDay?: number | null; // case.approval: the due day of the next step when the answer moves on; null: none follows
  costEur?: number | null; // case.provisional: the cost the run was computed with, frozen for it (D33)
  review?: boolean; // case.raised: the raise is reviewed first (D14), stamped by the server
  reviewDueDay?: number; // case.raised: raise day + the review days (D14), stamped by the server
};
