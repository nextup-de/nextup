"use server";
// /admin/knowledge: the assistant's switches for one company - on/off (the kill switch), the
// classification ceiling, retention, the data-processing agreement date, compliance rules and
// extra redaction patterns. Admin only; the company comes from the form's slug and is looked up.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ceilingOf } from "@/features/assist/classify";
import { adminBase } from "@/features/admin/nav";
import { getDb, hasDatabase } from "@/lib/db/client";
import { deleteDocument } from "@/lib/db/assist";
import { isAdmin } from "@/server/actions/admin";

export type AssistSettingsState = { ok?: boolean; error?: string };

const Form = z.object({
  slug: z.string().min(1),
  assistant: z.enum(["on", "off"]),
  ceiling: z.string(),
  retentionDays: z.coerce.number().int().min(1).max(365),
  dpaSignedAt: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  rules: z.string().max(4000),
  patterns: z.string().max(2000),
});

export async function saveAssistSettingsAction(_prev: AssistSettingsState, form: FormData): Promise<AssistSettingsState> {
  if (!(await isAdmin())) return { error: "Not signed in to the admin area." };
  if (!hasDatabase()) return { error: "No database is configured." };
  const p = Form.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Check the fields: retention 1-365 days, date as YYYY-MM-DD." };
  const f = p.data;

  const patterns = f.patterns.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 20);
  for (const x of patterns) {
    try { new RegExp(x); } catch { return { error: `Not a valid pattern: ${x}` }; }
  }

  const db = getDb();
  const company = await db.company.findUnique({ where: { slug: f.slug }, select: { id: true } });
  if (!company) return { error: "No such company." };
  const companyId = company.id;
  const config = {
    assistant: f.assistant === "on",
    classificationCeiling: ceilingOf(f.ceiling),
    retentionDays: f.retentionDays,
    dpaSignedAt: f.dpaSignedAt ? new Date(f.dpaSignedAt + "T00:00:00Z") : null,
    redactPatterns: patterns,
  };
  await db.$transaction([
    db.companyConfig.upsert({ where: { companyId }, create: { companyId, ...config }, update: config }),
    db.companyProfile.upsert({ where: { companyId }, create: { companyId, complianceRules: f.rules.trim(), principles: [] }, update: { complianceRules: f.rules.trim() } }),
  ]);
  revalidatePath(adminBase() + "/knowledge");
  return { ok: true };
}

/** One document out of the assistant's reach, e.g. imported with the wrong class. n8n re-adds it on its next run if the source still has it. */
export async function deleteDocumentAction(form: FormData): Promise<void> {
  if (!(await isAdmin()) || !hasDatabase()) return;
  const slug = String(form.get("slug") ?? ""), id = String(form.get("id") ?? "");
  if (!slug || !id) return;
  const company = await getDb().company.findUnique({ where: { slug }, select: { id: true } });
  if (!company) return;
  await deleteDocument(company.id, id);
  revalidatePath(adminBase() + "/knowledge");
}
