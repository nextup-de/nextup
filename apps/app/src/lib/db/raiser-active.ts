// Is the person who raised this case no longer active (plan SEE, D20)? The case page shows a muted "(inactive)" after the raiser's name.
// The reduced State does not know who is active, so the page asks here. Every query names the company at the top level.
import { underHandle } from "@/features/cases/stamp";
import { getDb } from "./client";

/**
 * True when the case.raised event of this case names a user who is deactivated and who raised it by name. False for an active
 * raiser, for a raise without a user id (a seed case, an API raise), and for a raise posted under a handle: an anonymous raiser stays
 * anonymous, so nothing about their account is shown (Q10.18). The anonymity is the raise's own, read from the event's stored label
 * (a member's handle is "Anonymous #n"; a name is a name), not from the person's current name or role: the same person may raise one
 * case by name and another under their handle.
 */
export async function raiserIsInactive(companyId: string, caseId: string): Promise<boolean> {
  const db = getDb();
  const raised = await db.caseEvent.findFirst({
    where: { companyId, targetId: caseId, type: "case.raised" },
    orderBy: { seq: "asc" },
    select: { actor: true, actorUserId: true },
  });
  if (!raised || raised.actorUserId === null || underHandle(raised.actor) || raised.actor.startsWith("system:")) return false;
  const user = await db.user.findFirst({ where: { id: raised.actorUserId, companyId }, select: { active: true } });
  return user !== undefined && user !== null && !user.active;
}
