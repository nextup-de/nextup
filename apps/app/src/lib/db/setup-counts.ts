// What exists for one company, as the numbers setupStep() (features/settings/sections.ts) reads.
import type { SetupCounts } from "@/features/settings/sections";
import { getDb } from "./client";

export async function loadSetupCounts(companyId: string): Promise<SetupCounts> {
  const db = getDb();
  const [company, profile, units, seats, routes, members] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    db.companyProfile.findUnique({ where: { companyId }, select: { companyId: true } }),
    db.orgUnit.count({ where: { companyId } }),
    db.orgRoleHolder.count({ where: { companyId } }),
    db.routingRule.count({ where: { companyId } }),
    db.user.count({ where: { companyId, active: true } }),
  ]);
  // Every company is created with a name, so "named" means someone saved the Company step: that first
  // save writes the profile row. Only the name is required, the profile's texts may stay empty.
  const named = Boolean(company?.name.trim()) && profile !== null;
  return { named, units, seats, routes, members };
}
