// The write functions of the goals editor (ADM D17). The company id comes from the caller (the
// guard's viewer) and addresses every row; `by` is the admin's display name. The pure rules in
// features/org-edit/goals run first, in the action. Ideas already scored keep their score.
import type { GoalInput } from "@/features/org-edit/goals";
import { getDb } from "./client";
import type { Tx } from "./org-edit";

const fields = (g: GoalInput) => ({
  title: g.title.trim(), kpi: g.kpi.trim(), target: g.target.trim(), period: g.period.trim(),
  orgUnitId: g.orgUnitId, keywords: g.keywords.map((x) => x.trim()).filter(Boolean),
});

export async function addGoal(companyId: string, by: string, g: GoalInput, outer?: Tx): Promise<string> {
  const work = async (tx: Tx) => {
    const last = await tx.goal.findFirst({ where: { companyId }, orderBy: { sort: "desc" }, select: { sort: true } });
    const row = await tx.goal.create({
      data: { companyId, ...fields(g), sort: (last?.sort ?? -1) + 1, updatedBy: by },
      select: { id: true },
    });
    return row.id;
  };
  return outer ? work(outer) : getDb().$transaction(work);
}

export async function updateGoal(companyId: string, by: string, id: string, g: GoalInput, tx?: Tx): Promise<void> {
  await (tx ?? getDb()).goal.updateMany({ where: { id, companyId }, data: { ...fields(g), updatedBy: by } });
}

export async function removeGoal(companyId: string, id: string, tx?: Tx): Promise<void> {
  await (tx ?? getDb()).goal.deleteMany({ where: { id, companyId } });
}
