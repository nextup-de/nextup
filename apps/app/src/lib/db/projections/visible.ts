// A user's viewer keys from their seats and role (VIS/D7): what they carry when the server filters cases.
import type { Role } from "@/config/roles";
import { meFor } from "@/features/auth/identity";
import { unitsOf, viewerKeys } from "@/features/cases/visibility";
import { getDb } from "../client";
import { loadSeats } from "../holders";
import { loadKnowledge, loadMembers } from "../knowledge";

/** The keys of one user of the company; just "all" for an unknown user. */
export async function visibleTo(companyId: string, userId: string): Promise<string[]> {
  const user = await getDb().user.findFirst({ where: { id: userId, companyId }, select: { role: true } });
  if (!user) return ["all"];
  const [seats, knowledge, members] = await Promise.all([loadSeats(companyId), loadKnowledge(companyId), loadMembers(companyId)]);
  const me = meFor(userId, seats);
  return viewerKeys(me, user.role as Role, unitsOf(me, { roles: knowledge.roles, members }));
}
