// Company rules (CompanyRule rows) <-> the plain values in src/features/knowledge/rules.ts. Every
// query names the company at the top level, so the tenant guard sees it.
import type { Prisma } from "@prisma/client";
import { COMPANY_RULE_KEYS, MOV_SINCE_KEY, movSinceOf, rulesFromRows, rowsFromRules, type CompanyRules } from "@/features/knowledge/rules";
import { getDb } from "./client";
import { memo } from "./company-memo";
import type { Tx } from "./org-edit";

export function loadCompanyRules(companyId: string): Promise<CompanyRules> {
  return memo("rules", companyId, async () => {
    const rows = await getDb().companyRule.findMany({ where: { companyId }, select: { key: true, value: true } });
    return rulesFromRows(rows);
  });
}

/** The day MOV went live for the company, or null while nobody wrote it. A plain query, not memoised: the row is outside COMPANY_RULE_KEYS (plan MOV). */
export async function loadMovSinceDay(companyId: string): Promise<number | null> {
  const row = await getDb().companyRule.findFirst({ where: { companyId, key: MOV_SINCE_KEY }, select: { key: true, value: true } });
  return row ? movSinceOf([row]) : null;
}

/**
 * Write the day MOV went live for the company, once: the row is inserted when absent and never updated, so the same state
 * and day always give the same clock facts (MOV D17). Returns the stored day, which is the first one written.
 */
export async function ensureMovSinceDay(companyId: string, day: number): Promise<number> {
  await getDb().companyRule.createMany({ data: [{ companyId, key: MOV_SINCE_KEY, value: { day } as Prisma.InputJsonValue }], skipDuplicates: true });
  return (await loadMovSinceDay(companyId)) ?? day;
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
