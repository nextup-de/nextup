// The approval area of the clock (REG/D6): empty until phase GAT fills it with its kinds and loops.
import type { State } from "@/features/cases/reducer";
import type { Due, SeatAbove } from "../due";

export const APPROVAL_DUE_KINDS = [] as const;
export type ApprovalDueKind = (typeof APPROVAL_DUE_KINDS)[number];

export const approvalAfterFacts: (d: Due) => boolean = () => false;

export const approvalDues: (state: State, today: number, above: SeatAbove) => Due[] = () => [];
