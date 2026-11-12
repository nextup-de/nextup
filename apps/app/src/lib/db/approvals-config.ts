// The review and approval settings of a company (plan GAT, D27): its CompanyRule rows under APPROVAL_CONFIG_KEYS, parsed and saved. The keys are
// outside COMPANY_RULE_KEYS, so saving Settings -> Rules never touches them. The query names the company at the top level, so the tenant
// guard sees it.
import type { Prisma } from "@prisma/client";
import { APPROVAL_CONFIG_KEYS, approvalConfigRows, parseApprovalConfig } from "@/features/approvals/config";
import type { ApprovalConfig } from "@/features/approvals/types";
import { getDb } from "./client";
import { memo } from "./company-memo";
import type { Tx } from "./org-edit";

export function loadApprovalConfig(companyId: string): Promise<ApprovalConfig> {
  return memo("approvals", companyId, async () => {
    const rows = await getDb().companyRule.findMany({ where: { companyId, key: { in: [...APPROVAL_CONFIG_KEYS] } }, select: { key: true, value: true } });
    return parseApprovalConfig(rows);
  });
}

/**
 * Replace the six approval keys of a company, in one transaction (the caller's, or its own): the keys are deleted and written again, every
 * one, so a saved company never falls back to a default by a missing row. `by` is who saved it. Rows of other keys are never touched.
 */
export async function saveApprovalConfig(companyId: string, config: ApprovalConfig, by: string | null = null, tx?: Tx): Promise<void> {
  const write = async (db: Tx) => {
    await db.companyRule.deleteMany({ where: { companyId, key: { in: [...APPROVAL_CONFIG_KEYS] } } });
    await db.companyRule.createMany({
      data: approvalConfigRows(config).map((r) => ({ companyId, key: r.key, value: r.value as Prisma.InputJsonValue, updatedBy: by })),
    });
  };
  if (tx) await write(tx);
  else await getDb().$transaction(write);
}
