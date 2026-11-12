// The project area of the scheduler's writes (REG/D9): the events a project Due becomes. MOV and RES add their writes here, never in clock.ts.
import type { Due } from "@/features/clock/due";
import type { EventPayload } from "@/features/cases/events";
import type { WriterCtx, WriterResult } from "./shared";

/** A lapse is the answer itself (SET D11, D12): the draft goes back to the decider, or the invitation is let go. Every other project Due stays a clock.due fact (null). */
export const writeProjectDue: (d: Due, ctx: WriterCtx) => WriterResult = (d) => {
  if (!d.lapse) return null;
  if (d.kind === "lead") {
    const payload: EventPayload = { take: false, lapsed: true };
    if (d.askId !== undefined) payload.askId = d.askId;
    return { type: "project.lead.answered", payload };
  }
  if (d.kind === "invite") return { type: "project.invite.answered", payload: { inviteId: d.inviteId, userId: d.userId, take: false, lapsed: true } };
  return null;
};

/** Before a run: nothing yet. MOV: ensureMovSinceDay(companyId, day). */
export const beforeProjectRun: (companyId: string, day: number) => Promise<void> = async () => {};
