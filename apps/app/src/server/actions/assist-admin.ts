"use server";
// /admin/assistant: the assistant's switches for the console's own company - on/off (the kill switch),
// the classification ceiling, retention, the data-processing agreement date, compliance rules and
// extra redaction patterns. Every action asks consoleCompany() first and writes the guard's company id,
// never one from the form; a support session reads and changes nothing (ITC/D4).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ceilingOf } from "@/features/assist/classify";
import { adminBase } from "@/features/admin/nav";
import { getDb, hasDatabase } from "@/lib/db/client";
import { deleteDocument } from "@/lib/db/assist";
import { consoleCompany } from "@/server/console-guard";

/** Where the assistant card is shown. */
function revalidateAssistant() {
  revalidatePath(adminBase() + "/assistant");
  revalidatePath(adminBase() + "/company-data");
}

export type AssistSettingsCode = "not-allowed" | "support-read-only" | "no-database" | "invalid" | "bad-pattern";
export type AssistSettingsState = { ok?: boolean; code?: AssistSettingsCode; /** The pattern that does not compile. */ detail?: string };

const Form = z.object({
  assistant: z.enum(["on", "off"]),
  ceiling: z.string(),
  retentionDays: z.coerce.number().int().min(1).max(365),
  dpaSignedAt: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  rules: z.string().max(4000),
  patterns: z.string().max(2000),
});

export async function saveAssistSettingsAction(_prev: AssistSettingsState, form: FormData): Promise<AssistSettingsState> {
  const guard = await consoleCompany();
  if (!guard) return { ok: false, code: "not-allowed" };
  if (guard.via === "support") return { ok: false, code: "support-read-only" };
  if (!hasDatabase()) return { ok: false, code: "no-database" };
  const p = Form.safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false, code: "invalid" };
  const f = p.data;

  const patterns = f.patterns.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 20);
  for (const x of patterns) {
    try { new RegExp(x); } catch { return { ok: false, code: "bad-pattern", detail: x }; }
  }

  const db = getDb();
  const companyId = guard.companyId;
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
  revalidateAssistant();
  return { ok: true };
}

/** One document out of the assistant's reach, e.g. imported with the wrong class. n8n re-adds it on its next run if the source still has it. */
export async function deleteDocumentAction(form: FormData): Promise<void> {
  const guard = await consoleCompany();
  if (!guard || guard.via === "support" || !hasDatabase()) return;
  const id = String(form.get("id") ?? "");
  if (!id) return;
  await deleteDocument(guard.companyId, id);
  revalidateAssistant();
}
