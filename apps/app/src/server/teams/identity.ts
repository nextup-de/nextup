// Who is talking to the bot (TMS D12): the Entra object id of the Teams user, mapped to the company's person,
// and the personal conversation the bot keeps for them. Every query is scoped by company.
import { getDb } from "@/lib/db/client";
import { saveConversation } from "@/lib/db/teams";
import type { BotActivity } from "./bot";

export type TeamsPerson = { id: string; name: string; role: string; handle: string | null; locale: string | null; dept: string };

/** The active user of this company with this Entra object id, or null. Never matched by name or email. */
export async function personOf(companyId: string, aadObjectId: string): Promise<TeamsPerson | null> {
  if (!aadObjectId) return null;
  return getDb().user.findFirst({
    where: { companyId, active: true, entraOid: { equals: aadObjectId, mode: "insensitive" } },
    select: { id: true, name: true, role: true, handle: true, locale: true, dept: true },
  });
}

/** The tenant an activity comes from. */
export function tenantOf(activity: BotActivity): string {
  return activity.conversation?.tenantId ?? activity.channelData?.tenant?.id ?? "";
}

export const isPersonal = (activity: BotActivity): boolean => activity.conversation?.conversationType === "personal";

/** Keep the person's personal conversation (one row per company and person). Other conversations are not kept. */
export async function rememberConversation(companyId: string, person: Pick<TeamsPerson, "id">, activity: BotActivity): Promise<boolean> {
  const aadObjectId = activity.from?.aadObjectId;
  const conversationId = activity.conversation?.id;
  const serviceUrl = activity.serviceUrl;
  if (!isPersonal(activity) || !aadObjectId || !conversationId || !serviceUrl) return false;
  await saveConversation(companyId, { userId: person.id, aadObjectId, tenantId: tenantOf(activity), conversationId, serviceUrl });
  return true;
}
