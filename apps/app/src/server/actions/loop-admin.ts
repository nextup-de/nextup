"use server";
// /admin/company-data, "After the decision" card: the company's discussion rhythm, measure checks and
// reward rule (src/features/loop/rules.ts). Admin only; the company comes from the form's slug.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminBase } from "@/features/admin/nav";
import { loopRules } from "@/features/loop/rules";
import { getDb, hasDatabase } from "@/lib/db/client";
import { saveLoopRules } from "@/lib/db/loop";
import { isAdmin } from "@/server/actions/admin";

export type LoopSettingsState = { ok?: boolean; error?: string };

const euros = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).max(10_000_000).nullable());

const Form = z.object({
  slug: z.string().min(1),
  discussEveryDays: z.coerce.number().int().min(1).max(30),
  discussMaxRounds: z.coerce.number().int().min(1).max(10),
  fastLaneEur: z.coerce.number().int().min(0).max(10_000_000),
  // "30, 90" -> [30, 90]
  measureDays: z.string().transform((s) => s.split(/[\s,;]+/).filter(Boolean).map(Number)).pipe(z.array(z.number().int().min(1).max(730)).min(1).max(4)),
  tolerancePct: z.coerce.number().int().min(0).max(50),
  rewardRule: z.enum(["none", "thanks", "fixed", "share"]),
  rewardAmountEur: euros,
  rewardSharePct: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).max(100).nullable()),
  rewardCapEur: euros,
});

export async function saveLoopSettingsAction(_prev: LoopSettingsState, form: FormData): Promise<LoopSettingsState> {
  if (!(await isAdmin())) return { error: "Not signed in to the admin area." };
  if (!hasDatabase()) return { error: "No database is configured." };
  const p = Form.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Check the numbers: whole numbers, measure days like \"30, 90\"." };
  const f = p.data;
  if (f.rewardRule === "fixed" && f.rewardAmountEur == null) return { error: "A fixed reward needs its amount." };
  if (f.rewardRule === "share" && f.rewardSharePct == null) return { error: "A share needs its percent." };
  const company = await getDb().company.findUnique({ where: { slug: f.slug }, select: { id: true } });
  if (!company) return { error: "No such company." };
  await saveLoopRules(company.id, loopRules({
    discussEveryDays: f.discussEveryDays,
    discussMaxRounds: f.discussMaxRounds,
    fastLaneEur: f.fastLaneEur,
    measureDays: f.measureDays,
    tolerancePct: f.tolerancePct,
    reward: { kind: f.rewardRule, amount: f.rewardAmountEur, sharePct: f.rewardSharePct, capEur: f.rewardCapEur },
  }));
  revalidatePath(adminBase() + "/company-data");
  return { ok: true };
}
