// The agent area of the scheduler's writes (REG/D6): empty until phase AGT fills it.
import type { Due } from "@/features/clock/due";
import type { WriterCtx, WriterResult } from "./shared";

export const writeAgentDue: (d: Due, ctx: WriterCtx) => WriterResult = () => null;

export const beforeAgentRun: (companyId: string, day: number) => Promise<void> = async () => {};
