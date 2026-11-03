// The company's privacy switches (GDP D17). No row means the defaults.
import { getDb } from "./client";

export type PrivacyPolicy = { reportScreenshots: boolean };

export async function loadPrivacyPolicy(companyId: string): Promise<PrivacyPolicy> {
  const row = await getDb().privacyPolicy.findUnique({ where: { companyId }, select: { reportScreenshots: true } });
  return { reportScreenshots: row?.reportScreenshots ?? true };
}

/** Stores the switches. Returns the policy before and after, for the caller's audit row. */
export async function savePrivacyPolicy(
  companyId: string,
  next: PrivacyPolicy,
  userId: string | null,
): Promise<{ before: PrivacyPolicy; after: PrivacyPolicy }> {
  const before = await loadPrivacyPolicy(companyId);
  await getDb().privacyPolicy.upsert({
    where: { companyId },
    create: { companyId, reportScreenshots: next.reportScreenshots, updatedById: userId },
    update: { reportScreenshots: next.reportScreenshots, updatedById: userId },
  });
  return { before, after: { reportScreenshots: next.reportScreenshots } };
}
