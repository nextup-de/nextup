"use server";
// Settings -> Rules -> Goals (ADM D17). One action per change: companyAdminOf -> load the
// company's knowledge -> pure rule -> write + audit row in one transaction -> revalidate. The company
// id is the guard's, never the form's; the unit and goal ids from the form are checked against that
// company's knowledge.
import { revalidatePath } from "next/cache";
import { auditChanges } from "@/features/audit";
import type { Knowledge } from "@/features/knowledge";
import { checkGoalChange, type GoalChange, type GoalError, type GoalInput } from "@/features/org-edit/goals";
import { companyPrefix } from "@/features/tenant/urls";
import { loadKnowledge } from "@/lib/db/knowledge";
import * as write from "@/lib/db/goals-edit";
import { settingsActor } from "@/server/audit/record";
import { audited, type Tx } from "./audited";
import { companyAdminOf } from "./guard";

export type GoalResult = { ok: true } | { ok: false; error: GoalError };

const fieldsOf = (g: Pick<GoalInput, "title" | "kpi" | "target" | "period" | "orgUnitId" | "keywords">) => ({
  title: g.title.trim(), kpi: g.kpi.trim(), target: g.target.trim(), period: g.period.trim(),
  orgUnitId: g.orgUnitId, keywords: g.keywords.map((x) => x.trim()).filter(Boolean),
});

async function apply(
  slug: string,
  change: GoalChange,
  run: (companyId: string, by: string, tx: Tx) => Promise<string | void>,
  describe: (before: Knowledge, id: string) => { id: string; changes: ReturnType<typeof auditChanges> },
): Promise<GoalResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return { ok: false, error: "settingsGoals.errForbidden" };
  const before = await loadKnowledge(admin.companyId);
  const refused = checkGoalChange(before, change);
  if (refused) return { ok: false, error: refused };
  const saved = await audited<string | undefined>(
    admin.companyId,
    (made) => {
      const d = describe(before, made ?? "");
      return { actor: settingsActor(admin), action: "audit.settings.goals", target: { kind: "goal", id: d.id }, changes: d.changes, source: "settings" };
    },
    async (tx) => (await run(admin.companyId, admin.name, tx)) ?? undefined,
  );
  if (!saved.ok) return { ok: false, error: "settingsGoals.errAudit" };
  revalidatePath(`${companyPrefix(slug)}/settings/rules`);
  return { ok: true };
}

export async function addGoalAction(slug: string, goal: GoalInput): Promise<GoalResult> {
  return apply(
    slug, { kind: "addGoal", goal },
    (c, by, tx) => write.addGoal(c, by, goal, tx),
    (_k, id) => ({ id, changes: auditChanges(null, fieldsOf(goal)) }),
  );
}
export async function updateGoalAction(slug: string, id: string, goal: GoalInput): Promise<GoalResult> {
  return apply(
    slug, { kind: "updateGoal", id, goal },
    (c, by, tx) => write.updateGoal(c, by, id, goal, tx),
    (k) => {
      const old = k.goals.find((g) => g.id === id);
      return { id, changes: auditChanges(old && fieldsOf(old), fieldsOf(goal)) };
    },
  );
}
export async function removeGoalAction(slug: string, id: string): Promise<GoalResult> {
  return apply(
    slug, { kind: "removeGoal", id },
    (c, _by, tx) => write.removeGoal(c, id, tx),
    (k) => {
      const old = k.goals.find((g) => g.id === id);
      return { id, changes: auditChanges(old && fieldsOf(old), null) };
    },
  );
}
