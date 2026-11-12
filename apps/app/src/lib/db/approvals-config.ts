// The review and approval settings of a company (plan GAT, D27): its CompanyRule rows under APPROVAL_CONFIG_KEYS, parsed. The keys are
// outside COMPANY_RULE_KEYS, so saving Settings -> Rules never touches them. The query names the company at the top level, so the tenant
// guard sees it.
import { APPROVAL_CONFIG_KEYS, parseApprovalConfig } from "@/features/approvals/config";
import type { ApprovalConfig } from "@/features/approvals/types";
import { getDb } from "./client";
import { memo } from "./company-memo";

export function loadApprovalConfig(companyId: string): Promise<ApprovalConfig> {
  return memo("approvals", companyId, async () => {
    const rows = await getDb().companyRule.findMany({ where: { companyId, key: { in: [...APPROVAL_CONFIG_KEYS] } }, select: { key: true, value: true } });
    return parseApprovalConfig(rows);
  });
}
