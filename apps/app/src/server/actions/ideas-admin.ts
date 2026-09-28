"use server";
// /admin/knowledge, idea studio card: the score an idea needs before it can be published
// (docs/IDEAS.md). Admin only; the company comes from the form's slug and is looked up.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminBase } from "@/features/admin/nav";
import { getDb, hasDatabase } from "@/lib/db/client";
import { isAdmin } from "@/server/actions/admin";

export type IdeaSettingsState = { ok?: boolean; error?: string };

const Form = z.object({ slug: z.string().min(1), publishThreshold: z.coerce.number().int().min(0).max(100) });

export async function saveIdeaSettingsAction(_prev: IdeaSettingsState, form: FormData): Promise<IdeaSettingsState> {
  if (!(await isAdmin())) return { error: "Not signed in to the admin area." };
  if (!hasDatabase()) return { error: "No database is configured." };
  const p = Form.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "The threshold is a whole number from 0 to 100." };
  const db = getDb();
  const company = await db.company.findUnique({ where: { slug: p.data.slug }, select: { id: true } });
  if (!company) return { error: "No such company." };
  const companyId = company.id, publishThreshold = p.data.publishThreshold;
  await db.companyConfig.upsert({ where: { companyId }, create: { companyId, publishThreshold }, update: { publishThreshold } });
  revalidatePath(adminBase() + "/knowledge");
  return { ok: true };
}
