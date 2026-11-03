// Company rules (CompanyRule rows) <-> the plain values in src/features/knowledge/rules.ts. Every
// query names the company at the top level, so the tenant guard sees it.
import type { Prisma } from "@prisma/client";
import { COMPANY_RULE_KEYS, rulesFromRows, rowsFromRules, type CompanyRules } from "@/features/knowledge/rules";
import { getDb } from "./client";
import type { Tx } from "./org-edit";

export async function loadCompanyRules(companyId: string): Promise<CompanyRules> {
  const rows = await getDb().companyRule.findMany({ where: { companyId }, select: { key: true, value: true } });
  return rulesFromRows(rows);
}

/** Replace a company's rules wholesale, in one transaction. `by` is who saved it. */
export async function saveCompanyRules(companyId: string, rules: CompanyRules, by: string | null = null, tx?: Tx): Promise<void> {
  const write = async (db: Tx) => {
    await db.companyRule.deleteMany({ where: { companyId, key: { in: [...COMPANY_RULE_KEYS] } } });
    await db.companyRule.createMany({
      data: rowsFromRules(rules).map((r) => ({ companyId, key: r.key, value: r.value as Prisma.InputJsonValue, updatedBy: by })),
    });
  };
  if (tx) await write(tx);
  else await getDb().$transaction(write);
}
