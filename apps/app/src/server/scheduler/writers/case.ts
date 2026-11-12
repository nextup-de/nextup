// The case area of the scheduler's writes (REG/D9): the events a case Due becomes. NOR adds its writes here, never in clock.ts.
import type { Due } from "@/features/clock/due";
import type { WriterCtx, WriterResult } from "./shared";

/** A hand-over becomes case.handed to the fact's seat (nothing when the seat is gone), the unanswered return case.unanswered; every other case Due stays a clock.due fact (null). */
export function writeCaseDue(d: Due, ctx: WriterCtx): WriterResult {
  if (d.kind === "handover") {
    const seat = ctx.state.seats.find((x) => x.id === d.toRoleHolderId);
    if (!seat) return { skip: true }; // the seat is gone
    return { type: "case.handed", payload: { to: seat.label, toRoleHolderId: seat.id, why: d.why ?? "deadline" } };
  }
  if (d.kind === "unanswered") return { type: "case.unanswered", payload: {} };
  return null;
}

/** Before a run: nothing yet. */
export const beforeCaseRun: (companyId: string, day: number) => Promise<void> = async () => {};
