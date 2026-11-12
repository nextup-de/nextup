// The approval area of the clock (REG/D6; plan GAT, D14, D23): the kinds of review and approvals. GAT-C1 fills approvalDues with the review's
// forward, the reminders and late hand-overs of the steps and the council's next meeting; until then nothing is due.
import type { State } from "@/features/cases/reducer";
import type { Due, SeatAbove } from "../due";

/** review: the raise's review seat is reminded and the raise is forwarded on its due day; approval: a step is due (reminder, then the seat above); council: a meeting day passed without an answer. */
export const APPROVAL_DUE_KINDS = ["review", "approval", "council"] as const;
export type ApprovalDueKind = (typeof APPROVAL_DUE_KINDS)[number];

/** Working days after the raise the review seat is reminded (D14). */
export const REVIEW_REMIND_DAYS = 1;

export const approvalAfterFacts: (d: Due) => boolean = () => false;

export const approvalDues: (state: State, today: number, above: SeatAbove) => Due[] = () => [];
