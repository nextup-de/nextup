"use server";
// /admin/company-data, idea studio card: the score an idea needs before it can be published
// (docs/IDEAS.md). Asks consoleCompany() first and writes the guard's company id; a support session
// changes nothing (ITC/D4).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminBase } from "@/features/admin/nav";
import { getDb, hasDatabase } from "@/lib/db/client";
import { consoleCompany } from "@/server/console-guard";

export type IdeaSettingsCode = "not-allowed" | "support-read-only" | "no-database" | "invalid";
export type IdeaSettingsState = { ok?: boolean; code?: IdeaSettingsCode };

const Form = z.object({ publishThreshold: z.coerce.number().int().min(0).max(100) });

export async function saveIdeaSettingsAction(_prev: IdeaSettingsState, form: FormData): Promise<IdeaSettingsState> {
  const guard = await consoleCompany();
  if (!guard) return { ok: false, code: "not-allowed" };
  if (guard.via === "support") return { ok: false, code: "support-read-only" };
  if (!hasDatabase()) return { ok: false, code: "no-database" };
  const p = Form.safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false, code: "invalid" };
  const companyId = guard.companyId, publishThreshold = p.data.publishThreshold;
  await getDb().companyConfig.upsert({ where: { companyId }, create: { companyId, publishThreshold }, update: { publishThreshold } });
  revalidatePath(adminBase() + "/company-data");
  return { ok: true };
}
