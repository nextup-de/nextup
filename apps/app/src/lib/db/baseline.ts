// The MET baseline: one CompanyRule row, key `metrics_baseline` (MET D12). Every query names the company
// at the top level, so the tenant guard sees it.
import type { Prisma } from "@prisma/client";
import { BASELINE_RULE_KEY, parseBaseline } from "@/features/metrics/baseline";
import type { Baseline } from "@/features/metrics/types";
import type { AuditClient } from "./audit";
import { getDb } from "./client";
import type { Tx } from "./org-edit";

export async function loadBaseline(companyId: string): Promise<Baseline | null> {
  const row = await getDb().companyRule.findFirst({ where: { companyId, key: BASELINE_RULE_KEY }, select: { value: true } });
  return row ? parseBaseline(row.value) : null;
}

/** The audit writer of the caller (GDP `recordAudit`), handed in so this module does not reach into server code. */
export type BaselineAudit = (
  companyId: string,
  entry: {
    actor: { kind: "admin"; userId: string | null };
    action: "audit.settings.metrics_baseline";
    target: { kind: string; id: string };
    changes: Record<string, { before: unknown; after: unknown }>;
    source: "settings";
  },
  client: AuditClient,
) => Promise<unknown>;

/** Upsert the baseline row and write its audit row (before and after) in one transaction. `by` is a user id. */
export async function saveBaseline(companyId: string, baseline: Baseline, by: string, recordAudit: BaselineAudit): Promise<void> {
  await getDb().$transaction(async (tx: Tx & AuditClient) => {
    const old = await tx.companyRule.findFirst({ where: { companyId, key: BASELINE_RULE_KEY }, select: { value: true } });
    const value = baseline as unknown as Prisma.InputJsonValue;
    await tx.companyRule.upsert({
      where: { companyId_key: { companyId, key: BASELINE_RULE_KEY } },
      create: { companyId, key: BASELINE_RULE_KEY, value, updatedBy: by },
      update: { value, updatedBy: by },
    });
    await recordAudit(
      companyId,
      {
        actor: { kind: "admin", userId: by },
        action: "audit.settings.metrics_baseline",
        target: { kind: "metrics_baseline", id: BASELINE_RULE_KEY },
        changes: { baseline: { before: old?.value ?? null, after: baseline } },
        source: "settings",
      },
      tx,
    );
  });
}
