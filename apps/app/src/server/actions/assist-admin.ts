"use server";
// /admin/assistant: the assistant's switches for the console's own company - on/off (the kill switch),
// the classification ceiling, the data-processing agreement date, compliance rules and
// extra redaction patterns. Every action asks consoleWrite() first and writes the guard's company id,
// never one from the form; a support session reads and changes nothing (ITC/D4).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditChanges } from "@/features/audit";
import { ceilingOf } from "@/features/assist/classify";
import { adminBase } from "@/features/admin/nav";
import { getDb, hasDatabase } from "@/lib/db/client";
import { deleteDocument } from "@/lib/db/assist";
import { consoleActor, recordAudit } from "@/server/audit/record";
import { consoleWrite } from "@/server/console-write";

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
  dpaSignedAt: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  rules: z.string().max(4000),
  patterns: z.string().max(2000),
});

export async function saveAssistSettingsAction(_prev: AssistSettingsState, form: FormData): Promise<AssistSettingsState> {
  const door = await consoleWrite();
  if (!door.ok) return { ok: false, code: door.code };
  const guard = door.c;
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
    dpaSignedAt: f.dpaSignedAt ? new Date(f.dpaSignedAt + "T00:00:00Z") : null,
    redactPatterns: patterns,
  };
  const actor = await consoleActor();
  const day = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
  await db.$transaction(async (tx) => {
    const [oldConfig, oldProfile] = await Promise.all([
      tx.companyConfig.findUnique({ where: { companyId } }),
      tx.companyProfile.findUnique({ where: { companyId } }),
    ]);
    await tx.companyConfig.upsert({ where: { companyId }, create: { companyId, ...config }, update: config });
    await tx.companyProfile.upsert({ where: { companyId }, create: { companyId, complianceRules: f.rules.trim(), principles: [] }, update: { complianceRules: f.rules.trim() } });
    const fields = (c: typeof oldConfig, rules: string | undefined) => ({
      assistant: c?.assistant ?? null,
      classificationCeiling: c?.classificationCeiling ?? null,
      dpaSignedAt: day(c?.dpaSignedAt),
      redactPatterns: c?.redactPatterns ?? [],
      complianceRules: rules ?? "",
    });
    const changes = auditChanges(
      fields(oldConfig, oldProfile?.complianceRules),
      { ...fields(null, f.rules.trim()), assistant: config.assistant, classificationCeiling: config.classificationCeiling, dpaSignedAt: day(config.dpaSignedAt), redactPatterns: config.redactPatterns },
    );
    await recordAudit(companyId, { actor, action: "audit.assistant.saved", target: { kind: "assistant", id: "settings" }, changes, source: "console" }, tx);
  });
  revalidateAssistant();
  return { ok: true };
}

/** One document out of the assistant's reach, e.g. imported with the wrong class. n8n re-adds it on its next run if the source still has it. */
export async function deleteDocumentAction(form: FormData): Promise<void> {
  const door = await consoleWrite();
  if (!door.ok || !hasDatabase()) return;
  const guard = door.c;
  const id = String(form.get("id") ?? "");
  if (!id) return;
  await deleteDocument(guard.companyId, id);
  revalidateAssistant();
}
