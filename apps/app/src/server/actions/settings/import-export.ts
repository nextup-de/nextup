"use server";
// Settings -> Import and export (API D13): check the uploaded files, then apply them all or nothing.
// companyAdminOf first; the company is the guard's. The apply checks again against the structure as it is
// now, writes in one transaction with its audit row, and refuses a set with any error.
import { revalidatePath } from "next/cache";
import { checkStructureCsv, KINDS, MAX_BYTES, type CheckResult, type CsvError, type FileKind, type StructureFiles } from "@/features/api/structure-csv";
import { companyPrefix } from "@/features/tenant/urls";
import type { MessageKey } from "@/i18n";
import { getDb } from "@/lib/db/client";
import { applyStructureCsv, loadCurrent, type Applied } from "@/lib/db/structure-csv";
import { recordAudit, settingsActor } from "@/server/audit/record";
import { companyAdminOf } from "./guard";

type Failure = Extract<MessageKey, `settingsImport.err${string}`>;
export type CheckOutcome = { ok: true; result: CheckResult } | { ok: false; error: Failure };
export type ApplyOutcome = { ok: true; applied: Applied } | { ok: false; error: Failure; errors?: CsvError[] };

/** The files of the form, by kind. A kind that was not chosen is absent; one over 5 MB is refused. */
async function readFiles(form: FormData): Promise<StructureFiles | Failure> {
  const files: StructureFiles = {};
  for (const kind of KINDS) {
    const v = form.get(kind);
    if (v === null || typeof v === "string" || v.size === 0) continue;
    if (v.size > MAX_BYTES) return "settingsImport.errTooBig";
    files[kind] = await v.text();
  }
  return Object.keys(files).length ? files : "settingsImport.errNoFiles";
}

export async function checkImportAction(slug: string, form: FormData): Promise<CheckOutcome> {
  const admin = await companyAdminOf(slug);
  if (!admin) return { ok: false, error: "settingsImport.errForbidden" };
  const files = await readFiles(form);
  if (typeof files === "string") return { ok: false, error: files };
  return { ok: true, result: checkStructureCsv(files, await loadCurrent(admin.companyId)) };
}

class AuditFailed extends Error {}

export async function applyImportAction(slug: string, form: FormData): Promise<ApplyOutcome> {
  const admin = await companyAdminOf(slug);
  if (!admin) return { ok: false, error: "settingsImport.errForbidden" };
  const files = await readFiles(form);
  if (typeof files === "string") return { ok: false, error: files };
  const { ok, errors, plan } = checkStructureCsv(files, await loadCurrent(admin.companyId));
  if (!ok) return { ok: false, error: "settingsImport.errNotClean", errors };
  try {
    const applied = await getDb().$transaction(
      async (tx) => {
        const done = await applyStructureCsv(admin.companyId, plan, admin.name, tx);
        const changes: Record<string, { before: null; after: { added: number; changed: number } }> = {};
        for (const k of KINDS as readonly FileKind[]) if (done[k].added || done[k].changed) changes[k] = { before: null, after: done[k] };
        if (Object.keys(changes).length) {
          try {
            await recordAudit(admin.companyId, { actor: settingsActor(admin), action: "audit.settings.import", target: { kind: "company", id: admin.companyId }, changes, source: "settings" }, tx);
          } catch (err) {
            console.error(`[audit] audit.settings.import not written: ${err instanceof Error ? err.message : String(err)}`);
            throw new AuditFailed();
          }
        }
        return done;
      },
      { timeout: 300_000, maxWait: 10_000 },
    );
    for (const part of ["org", "routing", "members"]) revalidatePath(`${companyPrefix(slug)}/settings/${part}`);
    return { ok: true, applied };
  } catch (err) {
    if (err instanceof AuditFailed) return { ok: false, error: "settingsImport.errAudit" };
    if (err instanceof Error && err.message.startsWith("import:")) return { ok: false, error: "settingsImport.errChanged" };
    throw err;
  }
}
