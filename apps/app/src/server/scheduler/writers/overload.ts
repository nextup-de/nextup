// The overload area of the scheduler's writes (REG/D6): empty until phase OVL fills it.
import type { Due } from "@/features/clock/due";
import type { WriterCtx, WriterResult } from "./shared";

export const writeOverloadDue: (d: Due, ctx: WriterCtx) => WriterResult = () => null;

export const beforeOverloadRun: (companyId: string, day: number) => Promise<void> = async () => {};
