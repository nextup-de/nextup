// The overload area of the clock (REG/D6; plan OVL, D26): the kinds of absence and overload. OVL-C1 fills overloadDues and overloadAfterFacts; until then
// nothing is due and no kind goes behind the others.
import type { State } from "@/features/cases/reducer";
import type { Due, SeatAbove } from "../due";

/**
 * away: a case on an away holder's seat goes to the seat that answers for it; overflow: a case on a desk at overflow goes to the deputy desk or the appointed
 * cover; overloaded: a desk reached the up or the overflow level; cleared: a desk with an open episode is under up again.
 */
export const OVERLOAD_DUE_KINDS = ["away", "overflow", "overloaded", "cleared"] as const;
export type OverloadDueKind = (typeof OVERLOAD_DUE_KINDS)[number];

// OVL-C1: away and overflow are the events the scheduler writes, so they go after every fact (true for those two); the stubs below say nothing yet.
export const overloadAfterFacts: (d: Due) => boolean = () => false;

export const overloadDues: (state: State, today: number, above: SeatAbove) => Due[] = () => [];
