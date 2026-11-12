// The case area of the scheduler's writes (REG/D9): the events a case Due becomes. NOR adds its writes here, never in clock.ts.
import type { Due } from "@/features/clock/due";
import type { WriterCtx, WriterResult } from "./shared";

/** The writer's context plus the company's answer length, which the reduced State does not carry; the scheduler passes it when it has it. */
export type CaseWriterCtx = WriterCtx & { promiseDays?: number };
/** The reducer's answer length when a company has none (reducer.ts). */
const DEFAULT_PROMISE_DAYS = 5;

/**
 * A hand-over becomes case.handed to the fact's seat (nothing when the seat is gone), the unanswered return case.unanswered, a revisit
 * case.reopened on the fact's seat with a new answer date of today + the company's answer length (plan NOR, D12); every other case Due,
 * the second look's reminders (appeal) and the invitees' view (view) included, stays a clock.due fact (null).
 */
export function writeCaseDue(d: Due, ctx: CaseWriterCtx): WriterResult {
  if (d.kind === "handover") {
    const seat = ctx.state.seats.find((x) => x.id === d.toRoleHolderId);
    if (!seat) return { skip: true }; // the seat is gone
    return { type: "case.handed", payload: { to: seat.label, toRoleHolderId: seat.id, why: d.why ?? "deadline" } };
  }
  if (d.kind === "unanswered") return { type: "case.unanswered", payload: {} };
  if (d.kind === "revisit") return { type: "case.reopened", payload: { why: "revisit", dueDay: ctx.today + (ctx.promiseDays ?? DEFAULT_PROMISE_DAYS), toRoleHolderId: d.toRoleHolderId ?? null } };
  return null;
}

/** Before a run: nothing yet. */
export const beforeCaseRun: (companyId: string, day: number) => Promise<void> = async () => {};
