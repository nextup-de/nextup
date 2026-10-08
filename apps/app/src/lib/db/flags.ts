// Feature flags as admin.sellux.ch set them for a company (prisma/schema.prisma FeatureFlag). Read
// by src/features/flags; replaced as a whole by the one-minute sync from admin.
import { getDb } from "@/lib/db/client";

/** The company's id and stage, or null - all a flag lookup needs. */
export async function companyForFlags(slug: string): Promise<{ id: string; stage: string } | null> {
  return getDb().company.findUnique({ where: { slug }, select: { id: true, stage: true } });
}

/** What admin set: flag key -> on or off. A key admin never set is absent. */
export async function flagOverrides(companyId: string): Promise<Record<string, boolean>> {
  const rows = await getDb().featureFlag.findMany({ where: { companyId }, select: { key: true, enabled: true } });
  return Object.fromEntries(rows.map((r) => [r.key, r.enabled]));
}

export type FlagSetting = { key: string; enabled: boolean; updatedAt: Date };

/**
 * Admin's list is the whole truth: keys it no longer lists go back to their stage default, the rest
 * are written as given. One transaction, so a page never sees half of a change.
 */
export async function replaceFlagOverrides(companyId: string, settings: readonly FlagSetting[]): Promise<void> {
  const db = getDb();
  await db.$transaction(async (tx) => {
    await tx.featureFlag.deleteMany({ where: { companyId, key: { notIn: settings.map((s) => s.key) } } });
    for (const s of settings) {
      await tx.featureFlag.upsert({
        where: { companyId_key: { companyId, key: s.key } },
        create: { companyId, key: s.key, enabled: s.enabled, updatedAt: s.updatedAt },
        update: { enabled: s.enabled, updatedAt: s.updatedAt },
      });
    }
  });
}
