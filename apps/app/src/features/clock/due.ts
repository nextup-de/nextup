// What has fallen due, as facts still to be stored (CLK/D12). Pure: state and today in, a list out.
// The scheduler (CLK-D1) appends one clock.due event per Due; the reducer reads those events (D11).
// Demo companies get nothing: their reducer escalates at render time.
// One file per area under kinds/ holds the kinds and loops (REG/D9); this file composes them.
import type { State } from "@/features/cases/reducer";
import { AGENT_DUE_KINDS, agentAfterFacts, agentDues, type AgentDueKind } from "./kinds/agent";
import { APPROVAL_DUE_KINDS, approvalAfterFacts, approvalDues, type ApprovalDueKind } from "./kinds/approval";
import { CASE_DUE_KINDS, caseAfterFacts, caseDues, type CaseClockExtra, type CaseDueKind } from "./kinds/case";
import { OVERLOAD_DUE_KINDS, overloadAfterFacts, overloadDues, type OverloadDueKind } from "./kinds/overload";
import { PROJECT_DUE_KINDS, projectAfterFacts, projectDues, type ProjectDueKind } from "./kinds/project";

export { hasFact, idemKeyOf, targetSeat } from "./kinds/shared";
export { QUESTION_REMIND_DAYS, QUESTION_RETURN_DAYS, TRIAGE_REMIND_DAYS } from "./kinds/case";
export { DRAFT_UP_DAYS, INVITE_LAPSE_DAYS, INVITE_REMIND_DAYS, LEAD_REMIND_DAYS, LEAD_RETURN_DAYS } from "./kinds/project";

export type DueKind = CaseDueKind | ProjectDueKind | AgentDueKind | ApprovalDueKind | OverloadDueKind;

/** Every kind of every area, in area order. */
export const DUE_KINDS = [...CASE_DUE_KINDS, ...PROJECT_DUE_KINDS, ...AGENT_DUE_KINDS, ...APPROVAL_DUE_KINDS, ...OVERLOAD_DUE_KINDS] as const;

export type Due = {
  kind: DueKind;
  target: string; // the case or project id
  dueDay: number;
  check?: number; // measure and confirm; draft: DRAFT_UP_DAYS for the second reminder
  toRoleHolderId?: string | null; // the seat the fact escalates to
  why?: "escalation" | "vacant"; // handover only: the second level's hand-over, or off a desk nobody sits at; missing = the deadline's
  /** lead and invite: the person the clock waits for (the lead, the invitee). */
  userId?: string;
  /** lead and invite: the fact that leads to the lapse (the answer the clock writes), not the reminder before it. */
  lapse?: boolean;
  /** invite: the project.invited event, the invitation's identity (Invite.id); a second invitation of the same person is another cycle. */
  inviteId?: string;
  /** lead: the event that asked the lead (the yes, or a project.handed on the draft), so a new ask is a new cycle. */
  askId?: string;
  /** MOV: the project step a fact is about. */
  stepId?: string;
  /** MOV: the event a fact belongs to. */
  originEventId?: string;
  idemKey: string;
};

/** The seat above a desk's role, not counting the roles in `skip`; null when nobody is above (features/knowledge seatAbove). */
export type SeatAbove = (roleId: string, skip: readonly string[]) => string | null;

/**
 * Composer (docs/process/README.md): a phase adds kinds and loops to its file under kinds/, never here.
 * Each area lists its Dues in its own loop order; the ones an area marks as going after every fact (the events
 * the scheduler writes: hand-overs, the unanswered return, the lapses) are moved behind all others, stably.
 */
export function dueNow(state: State, today: number, above: SeatAbove = () => null, extra?: CaseClockExtra): Due[] {
  if (state.clock.mode !== "workdays") return [];
  const all = [...caseDues(state, today, above, extra), ...projectDues(state, today, above), ...agentDues(state, today, above), ...approvalDues(state, today, above), ...overloadDues(state, today, above)];
  const after = (d: Due) => caseAfterFacts(d) || projectAfterFacts(d) || agentAfterFacts(d) || approvalAfterFacts(d) || overloadAfterFacts(d);
  return [...all.filter((d) => !after(d)), ...all.filter(after)];
}
