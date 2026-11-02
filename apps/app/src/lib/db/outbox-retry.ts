// The notifications page's database touches (ADM D18). Scoped by the company the guard named.
import { getDb } from "@/lib/db/client";

/** One failed message of this company goes back to pending, first attempt, due now. Nothing else changes. */
export async function retryOutboxRow(companyId: string, id: string): Promise<boolean> {
  const r = await getDb().outboxMessage.updateMany({
    where: { id, companyId, status: "failed" },
    data: { status: "pending", attempt: 0, nextAt: new Date() },
  });
  return r.count === 1;
}

/** The stored opt-outs of the company; the page only counts them. */
export async function loadOptOuts(companyId: string): Promise<{ userId: string; template: string; on: boolean }[]> {
  return getDb().notifyPreference.findMany({ where: { companyId, on: false }, select: { userId: true, template: true, on: true } });
}

/** The company's switch and stage. */
export async function loadNotifyState(companyId: string): Promise<{ on: boolean; stage: string }> {
  const db = getDb();
  const [cfg, company] = await Promise.all([
    db.companyConfig.findUnique({ where: { companyId }, select: { notifications: true } }),
    db.company.findUnique({ where: { id: companyId }, select: { stage: true } }),
  ]);
  return { on: cfg?.notifications ?? false, stage: company?.stage ?? "demo" };
}
