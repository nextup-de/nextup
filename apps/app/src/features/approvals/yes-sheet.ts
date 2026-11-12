// What the yes sheet offers and sends where approvals may apply (plan GAT, D20, D21). Pure: the case, the company's settings and what the desk added by hand in,
// a model out - the answers to offer, the approvers in order, the line about a missing cost, the line about a join, and the `case.provisional` payload. The rules
// are the ones the server checks (features/approvals/rights.ts requiredApprovals, rules.ts approvalsFor); the server recomputes the steps and keeps only
// the roles the desk added by hand from what the sheet sends, so nothing here is a right. Roles, not people (D3).
import { newId, type EventPayload } from "@/features/cases/events";
import type { ReducedCase, State } from "@/features/cases/reducer";
import { RAISER_NOTE_MAX, type AcceptPerson } from "@/features/projects/accept";
import { DEFAULT_LOCALE, translate, type Locale } from "@/i18n";
import { requiredApprovals } from "./rights";
import type { ApprovalStepInput } from "./types";

export type YesApprover = { label: string; kind: ApprovalStepInput["kind"] };

/** What the sheet sends along: who says yes, who sets it up, the line to the raiser and the note. A new draft's project id is minted when missing. */
export type YesSheetInput = { decider: AcceptPerson; lead?: AcceptPerson; raiserNote?: string; note?: string; newProjectId?: string };

export type YesSheetModel = {
  /** Approvals apply to this case by the company's rules: the plain yes is not offered (D20). */
  onlyIfApproved: boolean;
  /** The yes waits for approval, by a rule or because the desk added a role by hand: the sheet sends `case.provisional`. */
  provisional: boolean;
  /** The approvers in order: the budget approver, the councils, the roles of the rules, then the roles the desk added (D19). */
  approvers: YesApprover[];
  /** There is no cost estimate, so no budget step was computed (D18, D19). */
  noBudgetCheck: boolean;
  /** 'Joins {project} once approved' when the yes joins an existing project (D20). */
  joinLine: string | null;
  /** The `case.provisional` payload: SET's yes fields, the note, the steps (the hand-added marked) and the joined project's id (D20). */
  payload(input: YesSheetInput): EventPayload;
};

type SheetCase = Pick<ReducedCase, "title" | "assigneeRoleId" | "routeId" | "cost">;
type SheetState = Pick<State, "approvals" | "rules">;

export function yesSheetModel(kase: SheetCase, state: SheetState, byHand: readonly string[], join: { projectId: string; title: string } | null, locale: Locale = DEFAULT_LOCALE): YesSheetModel {
  const byRules = requiredApprovals(kase, state);
  const all = requiredApprovals(kase, state, byHand);
  const nameOf = (s: ApprovalStepInput): string =>
    (s.kind === "council" ? state.approvals.councils.find((c) => c.id === s.councilId)?.name : state.approvals.roles.find((r) => r.id === s.roleId)?.title) ?? "";
  return {
    onlyIfApproved: byRules.length > 0,
    provisional: all.length > 0,
    approvers: all.map((s) => ({ label: nameOf(s), kind: s.kind })),
    noBudgetCheck: kase.cost === null,
    joinLine: join === null ? null : translate(locale, "approvals.joinWaits", { project: join.title }),
    payload(input) {
      const lead = input.lead ?? input.decider;
      const raiserNote = input.raiserNote?.trim().slice(0, RAISER_NOTE_MAX) ?? "";
      const note = input.note?.trim() ?? "";
      return {
        draft: true,
        projectId: join?.projectId ?? input.newProjectId ?? newId("p"),
        lead: lead.name,
        ...(lead.userId ? { leadUserId: lead.userId } : {}),
        title: kase.title,
        ...(raiserNote ? { raiserNote } : {}),
        ...(note ? { note } : {}),
        approvals: all.map((s) => ({
          kind: s.kind,
          ...(s.roleId !== undefined ? { roleId: s.roleId } : {}),
          ...(s.councilId !== undefined ? { councilId: s.councilId } : {}),
          byHand: s.byHand === true,
        })),
      };
    },
  };
}
