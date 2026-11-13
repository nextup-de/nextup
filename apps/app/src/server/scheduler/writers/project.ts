// The project area of the scheduler's writes (REG/D9): the events a project Due becomes. MOV and RES add their writes here, never in clock.ts.
import type { Due } from "@/features/clock/due";
import type { EventPayload } from "@/features/cases/events";
import { ensureMovSinceDay } from "@/lib/db/rules";
import type { WriterCtx, WriterResult } from "./shared";

/** The kinds MOV adds (D27) and RES's reward reminder (D17): each is a plain clock.due fact, so the scheduler stores it with stepId, userId, check, toRoleHolderId and originEventId as they are. */
const MOV_KINDS: readonly Due["kind"][] = ["late", "blocked", "quiet", "stalled", "update", "vacant", "reward"];

/** A lapse is the answer itself (SET D11, D12): the draft goes back to the decider, or the invitation is let go. Every other project Due stays a clock.due fact (null). */
export const writeProjectDue: (d: Due, ctx: WriterCtx) => WriterResult = (d) => {
  if (MOV_KINDS.includes(d.kind)) {
    // A vacancy no desk can take (no route, nobody on the desk or above it) is still stored, without a seat: it keeps the project's
    // inbox item and shows up here, once, until a desk is assigned (D26). The id is the project's, never a person's.
    if (d.kind === "vacant" && !d.toRoleHolderId) console.warn(`[clock] project ${d.target}: no lead and no desk to tell`);
    return null;
  }
  if (!d.lapse) return null;
  if (d.kind === "lead") {
    const payload: EventPayload = { take: false, lapsed: true };
    if (d.askId !== undefined) payload.askId = d.askId;
    return { type: "project.lead.answered", payload };
  }
  if (d.kind === "invite") return { type: "project.invite.answered", payload: { inviteId: d.inviteId, userId: d.userId, take: false, lapsed: true } };
  return null;
};

/** Before a run: the first run after MOV is deployed fixes the day its clock starts from, before the seed is read (D17). The row never changes after that. */
export const beforeProjectRun: (companyId: string, day: number) => Promise<void> = async (companyId, day) => {
  await ensureMovSinceDay(companyId, day);
};
