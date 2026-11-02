// People's mail preferences per template ("*" for all), docs/adr/0004-webhook-and-outbox.md. Per company.
import { getDb } from "@/lib/db/client";

export type PrefRow = { userId: string; template: string; on: boolean };

/** The stored preferences of these users in this company. */
export async function prefsOf(companyId: string, userIds: string[]): Promise<PrefRow[]> {
  if (userIds.length === 0) return [];
  return getDb().notifyPreference.findMany({
    where: { companyId, userId: { in: userIds } },
    select: { userId: true, template: true, on: true },
    orderBy: [{ userId: "asc" }, { template: "asc" }],
  });
}

/** Set one preference; saving again replaces it. */
export async function setPref(companyId: string, userId: string, template: string, on: boolean): Promise<void> {
  await getDb().notifyPreference.upsert({
    where: { companyId_userId_template: { companyId, userId, template } },
    create: { companyId, userId, template, on },
    update: { on },
  });
}
