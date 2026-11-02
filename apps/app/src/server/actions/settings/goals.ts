"use server";
// Settings -> Rules -> Goals (ADM D17). One action per change: companyAdminOf -> load the
// company's knowledge -> pure rule -> write -> revalidate. The company id is the guard's, never the
// form's; the unit and goal ids from the form are checked against that company's knowledge.
import { revalidatePath } from "next/cache";
import { checkGoalChange, type GoalChange, type GoalError, type GoalInput } from "@/features/org-edit/goals";
import { companyPrefix } from "@/features/tenant/urls";
import { loadKnowledge } from "@/lib/db/knowledge";
import * as write from "@/lib/db/goals-edit";
import { companyAdminOf } from "./guard";

export type GoalResult = { ok: true } | { ok: false; error: GoalError };

async function apply(slug: string, change: GoalChange, run: (companyId: string, by: string) => Promise<void>): Promise<GoalResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return { ok: false, error: "settingsGoals.errForbidden" };
  const refused = checkGoalChange(await loadKnowledge(admin.companyId), change);
  if (refused) return { ok: false, error: refused };
  await run(admin.companyId, admin.name);
  revalidatePath(`${companyPrefix(slug)}/settings/rules`);
  return { ok: true };
}

export async function addGoalAction(slug: string, goal: GoalInput): Promise<GoalResult> {
  return apply(slug, { kind: "addGoal", goal }, async (c, by) => { await write.addGoal(c, by, goal); });
}
export async function updateGoalAction(slug: string, id: string, goal: GoalInput): Promise<GoalResult> {
  return apply(slug, { kind: "updateGoal", id, goal }, (c, by) => write.updateGoal(c, by, id, goal));
}
export async function removeGoalAction(slug: string, id: string): Promise<GoalResult> {
  return apply(slug, { kind: "removeGoal", id }, (c) => write.removeGoal(c, id));
}
