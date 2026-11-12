// The agent area of the clock (REG/D6): empty until phase AGT fills it with its kinds and loops.
import type { State } from "@/features/cases/reducer";
import type { Due, SeatAbove } from "../due";

export const AGENT_DUE_KINDS = [] as const;
export type AgentDueKind = (typeof AGENT_DUE_KINDS)[number];

export const agentAfterFacts: (d: Due) => boolean = () => false;

export const agentDues: (state: State, today: number, above: SeatAbove) => Due[] = () => [];
