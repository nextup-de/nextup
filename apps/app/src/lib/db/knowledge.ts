// Company knowledge tables <-> the plain rows in src/features/knowledge. Every query names the
// company at the top level, so the tenant guard sees all of them (no nested includes from Company).
import type { VisMember } from "@/features/cases/visibility";
import type { HolderRow, Knowledge, Profile } from "@/features/knowledge";
import { getDb } from "./client";
import { memo } from "./company-memo";

const unit = { id: true, key: true, name: true, kind: true, headcount: true, parentId: true, sort: true } as const;
const role = { id: true, orgUnitId: true, title: true, reportsToId: true, decides: true, spendLimitEur: true, skills: true, sort: true } as const;
const holder = { id: true, roleId: true, name: true, userId: true, sort: true } as const;
const rule = { id: true, key: true, type: true, keywords: true, ownerRoleId: true, deputyRoleId: true, buddyRoleId: true, wait: true, sort: true } as const;
const goal = { id: true, orgUnitId: true, parentId: true, title: true, kpi: true, target: true, period: true, keywords: true, sort: true } as const;

export function loadKnowledge(companyId: string): Promise<Knowledge> {
  return memo("knowledge", companyId, () => readKnowledge(companyId));
}

async function readKnowledge(companyId: string): Promise<Knowledge> {
  const db = getDb();
  const where = { companyId };
  const orderBy = { sort: "asc" } as const;
  const [units, roles, holders, rules, goals, withManager] = await Promise.all([
    db.orgUnit.findMany({ where, orderBy, select: unit }),
    db.orgRole.findMany({ where, orderBy, select: role }),
    db.orgRoleHolder.findMany({ where, orderBy, select: holder }),
    db.routingRule.findMany({ where, orderBy, select: rule }),
    db.goal.findMany({ where, orderBy, select: goal }),
    db.user.findMany({ where: { companyId, active: true, managerId: { not: null } }, select: { id: true, managerId: true } }),
  ]);
  const managers = withManager.flatMap((u) => (u.managerId ? [{ userId: u.id, managerId: u.managerId }] : []));
  return { units, roles, holders, rules, goals, ...(managers.length ? { managers } : {}) };
}

/**
 * The active people without a seat, for the visibility rule and the metric cohorts (FX3). Their unit is the
 * one their department names, by key or name like the directory matches it; a manager who has left counts as none.
 */
export function loadMembers(companyId: string): Promise<VisMember[]> {
  return memo("members", companyId, () => readMembers(companyId));
}

async function readMembers(companyId: string): Promise<VisMember[]> {
  const db = getDb();
  const [users, units, holders] = await Promise.all([
    db.user.findMany({ where: { companyId, active: true }, select: { id: true, dept: true, managerId: true } }),
    db.orgUnit.findMany({ where: { companyId }, orderBy: { sort: "asc" }, select: { id: true, key: true, name: true } }),
    db.orgRoleHolder.findMany({ where: { companyId, userId: { not: null } }, select: { userId: true } }),
  ]);
  const seated = new Set(holders.map((h) => h.userId));
  const active = new Set(users.map((u) => u.id));
  const unitOf = new Map<string, string>();
  for (const u of units) for (const label of [u.key, u.name]) if (!unitOf.has(label.toLowerCase())) unitOf.set(label.toLowerCase(), u.id);
  return users.filter((u) => !seated.has(u.id)).map((u) => ({
    userId: u.id,
    unitId: unitOf.get(u.dept.trim().toLowerCase()) ?? null,
    managerId: u.managerId && active.has(u.managerId) ? u.managerId : null,
  }));
}

/** One role's holders in `sort` order, for that company only. */
export async function loadHoldersOfRole(companyId: string, roleId: string): Promise<HolderRow[]> {
  return getDb().orgRoleHolder.findMany({ where: { companyId, roleId }, orderBy: { sort: "asc" }, select: holder });
}

/** Replace a company's knowledge wholesale, in one transaction. `by` is who saved it. */
export async function replaceKnowledge(companyId: string, k: Knowledge, by: string | null = null): Promise<void> {
  const db = getDb();
  const where = { companyId };
  const stamp = <T extends object>(rows: T[]) => rows.map((r) => ({ ...r, companyId, updatedBy: by }));
  await db.$transaction([
    // Children first; roles and goals point at each other within their own table, which one
    // statement's deleteMany handles.
    db.goal.deleteMany({ where }),
    db.routingRule.deleteMany({ where }),
    db.orgRoleHolder.deleteMany({ where }),
    db.orgRole.deleteMany({ where }),
    db.orgUnit.deleteMany({ where }),
    // One INSERT per table: Postgres checks the self-references (reportsTo, parent) at the end of
    // the statement, so row order inside a table does not matter.
    // An empty createMany names no company, which the tenant guard refuses; there is nothing to insert.
    ...(k.units.length ? [db.orgUnit.createMany({ data: stamp(k.units) })] : []),
    ...(k.roles.length ? [db.orgRole.createMany({ data: stamp(k.roles) })] : []),
    ...(k.holders.length ? [db.orgRoleHolder.createMany({ data: k.holders.map((h) => ({ ...h, companyId })) })] : []),
    ...(k.rules.length ? [db.routingRule.createMany({ data: stamp(k.rules) })] : []),
    ...(k.goals.length ? [db.goal.createMany({ data: stamp(k.goals) })] : []),
  ]);
}

export async function loadProfile(companyId: string): Promise<Profile | null> {
  return getDb().companyProfile.findUnique({
    where: { companyId },
    select: { vision: true, mission: true, principles: true, businessModel: true },
  });
}
