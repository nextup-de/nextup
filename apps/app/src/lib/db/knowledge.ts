// Company knowledge tables <-> the plain rows in src/features/knowledge. Every query names the
// company at the top level, so the tenant guard sees all of them (no nested includes from Company).
import type { Knowledge, Profile } from "@/features/knowledge";
import { getDb } from "./client";

const unit = { id: true, key: true, name: true, kind: true, headcount: true, parentId: true, sort: true } as const;
const role = { id: true, orgUnitId: true, title: true, reportsToId: true, decides: true, spendLimitEur: true, skills: true, sort: true } as const;
const holder = { id: true, roleId: true, name: true, userId: true, sort: true } as const;
const rule = { id: true, key: true, type: true, keywords: true, ownerRoleId: true, deputyRoleId: true, buddyRoleId: true, wait: true, sort: true } as const;
const goal = { id: true, orgUnitId: true, parentId: true, title: true, kpi: true, target: true, period: true, keywords: true, sort: true } as const;

export async function loadKnowledge(companyId: string): Promise<Knowledge> {
  const db = getDb();
  const where = { companyId };
  const orderBy = { sort: "asc" } as const;
  const [units, roles, holders, rules, goals] = await Promise.all([
    db.orgUnit.findMany({ where, orderBy, select: unit }),
    db.orgRole.findMany({ where, orderBy, select: role }),
    db.orgRoleHolder.findMany({ where, orderBy, select: holder }),
    db.routingRule.findMany({ where, orderBy, select: rule }),
    db.goal.findMany({ where, orderBy, select: goal }),
  ]);
  return { units, roles, holders, rules, goals };
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
    db.orgUnit.createMany({ data: stamp(k.units) }),
    db.orgRole.createMany({ data: stamp(k.roles) }),
    db.orgRoleHolder.createMany({ data: k.holders.map((h) => ({ ...h, companyId })) }),
    db.routingRule.createMany({ data: stamp(k.rules) }),
    db.goal.createMany({ data: stamp(k.goals) }),
  ]);
}

export async function loadProfile(companyId: string): Promise<Profile | null> {
  return getDb().companyProfile.findUnique({
    where: { companyId },
    select: { vision: true, mission: true, principles: true, businessModel: true },
  });
}
