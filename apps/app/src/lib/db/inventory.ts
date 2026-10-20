// The counts behind /admin/company-data: rows per source, never their content. Every query names the
// company at the top level, so the tenant guard sees all of them (docs/INTEGRATIONS.md).
import type { DocumentGroup, InventoryFacts } from "@/features/admin/data";
import { getDb } from "./client";

type Counts = Pick<InventoryFacts, "updated" | "documents" | "n8n">;

export async function inventoryCounts(companyId: string): Promise<Counts> {
  const db = getDb();
  const where = { companyId };
  const newest = { _max: { updatedAt: true } } as const;
  const [units, roles, rules, goals, groups, n8n] = await Promise.all([
    db.orgUnit.aggregate({ where, ...newest }),
    db.orgRole.aggregate({ where, ...newest }),
    db.routingRule.aggregate({ where, ...newest }),
    db.goal.aggregate({ where, ...newest }),
    db.document.groupBy({ by: ["source", "classification"], where, _count: { _all: true }, _max: { updatedAt: true } }),
    db.caseEvent.aggregate({ where: { companyId, source: "n8n" }, _count: { _all: true }, _max: { ts: true } }),
  ]);

  const later = (a: Date | null, b: Date | null) => (a && b ? (a > b ? a : b) : a ?? b);
  const documents: DocumentGroup[] = groups.map((g) => ({
    source: g.source,
    classification: g.classification,
    count: g._count._all,
    updatedAt: g._max.updatedAt,
  }));

  return {
    updated: {
      org: later(units._max.updatedAt, roles._max.updatedAt),
      routing: rules._max.updatedAt,
      goals: goals._max.updatedAt,
    },
    documents,
    n8n: { events: n8n._count._all, last: n8n._max.ts },
  };
}
