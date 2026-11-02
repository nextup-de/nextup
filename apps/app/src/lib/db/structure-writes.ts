// Writes a company's structure (units, roles, holders, routes, goals, rules) into its tables, and
// backfills companies stored before the tables existed (docs/COMPANY_KNOWLEDGE.md).
import { isSeed } from "@/features/demo/parse";
import { rowsFromSeed, type Knowledge } from "@/features/knowledge";
import type { CompanyRules } from "@/features/knowledge/rules";
import { getDb } from "./client";
import { saveCompanyRules } from "./rules";

/**
 * replaceKnowledge, except that a table with no rows is not inserted into: the tenant guard rejects
 * an empty createMany, and a backfill has no goals. (lib/db/knowledge.ts could take the same check.)
 */
async function replaceStructure(companyId: string, k: Knowledge, by: string | null): Promise<void> {
  const db = getDb();
  const where = { companyId };
  const stamp = <T extends object>(rows: T[]) => rows.map((r) => ({ ...r, companyId, updatedBy: by }));
  await db.$transaction([
    db.goal.deleteMany({ where }),
    db.routingRule.deleteMany({ where }),
    db.orgRoleHolder.deleteMany({ where }),
    db.orgRole.deleteMany({ where }),
    db.orgUnit.deleteMany({ where }),
    ...(k.units.length ? [db.orgUnit.createMany({ data: stamp(k.units) })] : []),
    ...(k.roles.length ? [db.orgRole.createMany({ data: stamp(k.roles) })] : []),
    ...(k.holders.length ? [db.orgRoleHolder.createMany({ data: k.holders.map((h) => ({ ...h, companyId })) })] : []),
    ...(k.rules.length ? [db.routingRule.createMany({ data: stamp(k.rules) })] : []),
    ...(k.goals.length ? [db.goal.createMany({ data: stamp(k.goals) })] : []),
  ]);
}

/** Knowledge always; rules only when given (an empty company keeps the defaults by having no rows). */
export async function writeStructure(
  companyId: string,
  input: { knowledge: Knowledge; rules: CompanyRules | null },
  by: string | null,
): Promise<void> {
  await replaceStructure(companyId, input.knowledge, by);
  if (input.rules) await saveCompanyRules(companyId, input.rules, by);
}

/**
 * For every company with no OrgUnit row whose stored seed has at least one dept, write the seed's
 * structure as rows. No rules and no goals. A second run finds units and writes nothing.
 */
export async function backfillStructure(): Promise<{ slug: string; line: string }[]> {
  const db = getDb();
  const companies = await db.company.findMany({ select: { id: true, slug: true, seedJson: true }, orderBy: { slug: "asc" } });
  const out: { slug: string; line: string }[] = [];
  for (const c of companies) {
    const skip = { slug: c.slug, line: `${c.slug}: left as it is` };
    if (!isSeed(c.seedJson) || c.seedJson.depts.length === 0) { out.push(skip); continue; }
    if ((await db.orgUnit.count({ where: { companyId: c.id } })) > 0) { out.push(skip); continue; }
    const k = rowsFromSeed(c.seedJson, [], () => crypto.randomUUID());
    await replaceStructure(c.id, k, "backfill");
    out.push({ slug: c.slug, line: `${c.slug}: wrote ${k.units.length} units, ${k.roles.length} roles, ${k.rules.length} rules` });
  }
  return out;
}
