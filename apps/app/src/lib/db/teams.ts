// A person's Teams conversation with the bot (TeamsConversation, TMS D5). Every query is scoped by company.
import { getDb } from "@/lib/db/client";

export type ConversationInput = { userId: string; aadObjectId: string; tenantId: string; conversationId: string; serviceUrl: string };

/** One row per company and person: a second save updates it in place. */
export async function saveConversation(companyId: string, input: ConversationInput) {
  const { userId, ...fields } = input;
  return getDb().teamsConversation.upsert({
    where: { companyId_userId: { companyId, userId } },
    create: { companyId, userId, ...fields },
    update: fields,
  });
}

export async function conversationOf(companyId: string, userId: string) {
  return getDb().teamsConversation.findFirst({ where: { companyId, userId } });
}

/** The people of this company who have a conversation with the bot. */
export async function teamsUserIds(companyId: string): Promise<Set<string>> {
  const rows = await getDb().teamsConversation.findMany({ where: { companyId }, select: { userId: true } });
  return new Set(rows.map((r) => r.userId));
}

export async function removeConversation(companyId: string, userId: string): Promise<void> {
  await getDb().teamsConversation.deleteMany({ where: { companyId, userId } });
}
