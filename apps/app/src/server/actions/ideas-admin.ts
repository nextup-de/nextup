"use server";
// /admin/company-data, idea studio card: the score an idea needs before it can be published
// (docs/IDEAS.md). Asks consoleCompany() first and writes the guard's company id; a support session
// changes nothing (ITC/D4).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditChanges } from "@/features/audit";
import { adminBase } from "@/features/admin/nav";
import { getDb, hasDatabase } from "@/lib/db/client";
import { consoleActor, recordAudit } from "@/server/audit/record";
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
  const actor = await consoleActor();
  await getDb().$transaction(async (tx) => {
    const old = await tx.companyConfig.findUnique({ where: { companyId }, select: { publishThreshold: true } });
    await tx.companyConfig.upsert({ where: { companyId }, create: { companyId, publishThreshold }, update: { publishThreshold } });
    await recordAudit(companyId, { actor, action: "audit.assistant.ideas", target: { kind: "assistant", id: "ideas" }, changes: auditChanges({ publishThreshold: old?.publishThreshold ?? null }, { publishThreshold }), source: "console" }, tx);
  });
  revalidatePath(adminBase() + "/company-data");
  return { ok: true };
}
