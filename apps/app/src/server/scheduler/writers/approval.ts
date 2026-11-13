// The approval area of the scheduler's writes (REG/D6; plan GAT, D14, D23): the review's forward is an event, every other approval Due a fact.
import type { Due } from "@/features/clock/due";
import type { WriterCtx, WriterResult } from "./shared";

/**
 * A review's forward (kind review, check 2) becomes case.reviewed { outcome: 'forward', auto: true } to the route's owner seat, as system:clock; nothing is
 * written when the review is no longer pending or the case has no route with an owner seat to go to (D14). Every other approval Due, the review's and the
 * steps' reminders, a late step's hand-over fact and a council's move, stays a clock.due fact (null), which carries the seat and the day (clockDuePayload).
 */
export function writeApprovalDue(d: Due, ctx: WriterCtx): WriterResult {
  if (d.kind !== "review" || d.check !== 2) return null;
  const kase = ctx.state.cases.find((c) => c.id === d.target);
  if (!kase || kase.review === null || kase.review.state !== "pending" || kase.route === null) return { skip: true };
  const to = d.toRoleHolderId ?? kase.route.ownerSeatId ?? null;
  if (to === null) return { skip: true };
  return { type: "case.reviewed", payload: { outcome: "forward", routeId: kase.routeId, toRoleHolderId: to, auto: true } };
}

export const beforeApprovalRun: (companyId: string, day: number) => Promise<void> = async () => {};
