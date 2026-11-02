// What exists for one company, as the numbers setupStep() (features/settings/sections.ts) reads.
import type { SetupCounts } from "@/features/settings/sections";
import { getDb } from "./client";

export async function loadSetupCounts(companyId: string): Promise<SetupCounts> {
  const db = getDb();
  const [company, profile, units, linkedSeats, routes, members] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    db.companyProfile.findUnique({ where: { companyId }, select: { mission: true, vision: true } }),
    db.orgUnit.count({ where: { companyId } }),
    db.orgRoleHolder.count({ where: { companyId, userId: { not: null } } }),
    db.routingRule.count({ where: { companyId } }),
    db.user.count({ where: { companyId, active: true } }),
  ]);
  const named = Boolean(company?.name.trim()) && Boolean(profile?.mission.trim() || profile?.vision.trim());
  return { named, units, linkedSeats, routes, members };
}
