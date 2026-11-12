// The approval area of the scheduler's writes (REG/D6): empty until phase GAT fills it.
import type { Due } from "@/features/clock/due";
import type { WriterCtx, WriterResult } from "./shared";

export const writeApprovalDue: (d: Due, ctx: WriterCtx) => WriterResult = () => null;

export const beforeApprovalRun: (companyId: string, day: number) => Promise<void> = async () => {};
