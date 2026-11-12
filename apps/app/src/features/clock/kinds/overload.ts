// The overload area of the clock (REG/D6): empty until phase OVL fills it with its kinds and loops.
import type { State } from "@/features/cases/reducer";
import type { Due, SeatAbove } from "../due";

export const OVERLOAD_DUE_KINDS = [] as const;
export type OverloadDueKind = (typeof OVERLOAD_DUE_KINDS)[number];

export const overloadAfterFacts: (d: Due) => boolean = () => false;

export const overloadDues: (state: State, today: number, above: SeatAbove) => Due[] = () => [];
