"use server";

// Requesting and listing data exports (GDP D14). Company admins only. The ready file, its audit row and, for
// a copy to the person, the mail commit in one transaction: nothing is reported ready without its audit row.
// An admin-only copy the company handed over itself is marked as delivered here (Q10.13).
import { revalidatePath } from "next/cache";
import { gateOf, prefOf } from "@/features/notify/gate";
import {
  EXPORT_TTL_DAYS, addDays, buildCompanyExport, buildPersonExport, canMarkDelivered, cleanDeliveryNote, composeExportMail,
  hasVerifiedEmail, serializeExport,
} from "@/features/privacy/export";
import { companyPrefix } from "@/features/tenant/urls";
import { createT, DEFAULT_LOCALE } from "@/i18n";
import { localeForUser } from "@/i18n/server";
import { getDb } from "@/lib/db/client";
import type { OutboxDraft } from "@/lib/db/outbox";
import {
  companyExportRows, createExport, downloadedExportIds, enqueueIn, getExport, listExports, markDelivered, markFailed, markReady,
  personExportRows,
} from "@/lib/db/privacy-export";
import { recordAudit, settingsActor } from "@/server/audit/record";
import { companyBaseUrl } from "@/server/case-notice";
import { audited } from "@/server/actions/settings/audited";
import { companyAdminOf } from "@/server/actions/settings/guard";

export type ExportInput = {
  kind: "company" | "person";
  subjectUserId?: string;
  deliverTo: "person" | "admin";
  /** For an inactive person's copy held by the admin only: why. Required then; recorded in the audit row. */
  adminOnlyReason?: string;
};

export type RequestExportResult = { ok: true; id: string } | { ok: false; error: string };

/** One row of the exports list: ids and dates only, never a name, never the file. */
export type ExportListItem = {
  id: string;
  kind: "company" | "person";
  subjectUserId: string | null;
  requestedByUserId: string;
  deliverTo: "person" | "admin";
  status: string;
  sizeBytes: number | null;
  error: string | null;
  expiresAt: string;
  createdAt: string;
  /** The signed-in admin can download it here: an admin copy they asked for, ready and not expired. */
  downloadable: boolean;
  /** Handed over by the company through its own channel (Q10.13): when, which admin marked it, the channel note. */
  delivered: { at: string; byUserId: string | null; note: string | null } | null;
  /** A company admin can mark it as handed over now: an admin-only person copy, downloaded, not marked yet. */
  markable: boolean;
};

export type MarkDeliveredResult = { ok: true } | { ok: false; error: string };

const MAX_REASON = 300;

export async function requestExport(slug: string, input: ExportInput): Promise<RequestExportResult> {
  let t = createT(DEFAULT_LOCALE);
  const fail = (error: string): RequestExportResult => ({ ok: false, error });
  const admin = await companyAdminOf(slug);
  if (!admin) return fail(t("privacyExport.errorForbidden"));
  const companyId = admin.companyId;
  t = createT(await localeForUser(companyId, admin.userId)); // the admin's own language, not the request's cookie

  const kind = input?.kind;
  const deliverTo = input?.deliverTo;
  if ((kind !== "company" && kind !== "person") || (deliverTo !== "person" && deliverTo !== "admin")) return fail(t("privacyExport.errorForbidden"));
  if (kind === "company" && deliverTo !== "admin") return fail(t("privacyExport.errorCompanyAdminOnly"));

  const db = getDb();
  let subject: { id: string; name: string; email: string; active: boolean; entraOid: string | null; directorySyncedAt: Date | null } | null = null;
  let reason: string | null = null;
  if (kind === "person") {
    subject = await db.user.findFirst({
      where: { id: String(input.subjectUserId ?? ""), companyId },
      select: { id: true, name: true, email: true, active: true, entraOid: true, directorySyncedAt: true },
    });
    if (!subject) return fail(t("privacyExport.errorNoPerson"));
    if (deliverTo === "person") {
      if (!subject.active) return fail(t("privacyExport.errorInactiveDelivery"));
      if (!hasVerifiedEmail(subject)) return fail(t("privacyExport.errorNoVerifiedEmail"));
    } else if (!subject.active) {
      reason = (input.adminOnlyReason ?? "").trim().slice(0, MAX_REASON);
      if (!reason) return fail(t("privacyExport.errorReasonNeeded"));
    }
  }

  const now = new Date();
  const expiresAt = addDays(now, EXPORT_TTL_DAYS);
  const row = await createExport(companyId, { kind, subjectUserId: subject?.id ?? null, requestedByUserId: admin.userId, deliverTo, expiresAt });

  try {
    const rows = subject ? await personExportRows(companyId, subject.id) : await companyExportRows(companyId);
    const file = serializeExport(subject ? buildPersonExport(rows, { userId: subject.id, toPerson: deliverTo === "person" }) : buildCompanyExport(rows));

    const mail = await mailDraft();
    async function mailDraft(): Promise<OutboxDraft | null> {
      if (!subject || deliverTo !== "person") return null;
      const [company, locale, prefRows] = await Promise.all([
        db.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, stage: true, config: { select: { notifications: true, n8n: true } } } }),
        localeForUser(companyId, subject.id),
        db.notifyPreference.findMany({ where: { companyId, userId: subject.id, template: { in: ["privacy.export", "*"] } } }),
      ]);
      const gate = gateOf(
        { stage: company.stage, notifications: company.config?.notifications ?? false, n8n: company.config?.n8n ?? false },
        "mail", "privacy.export", prefOf(prefRows, subject.id, "privacy.export"),
      );
      const url = `${companyBaseUrl(slug)}/exports/${row.id}`;
      const m = composeExportMail({ name: subject.name, companyName: company.name, sizeBytes: file.length, expiresAt, url, locale });
      return {
        channel: "mail", key: `export:${row.id}`, recipientUserId: subject.id, address: subject.email, template: "privacy.export",
        locale, subject: m.subject, text: m.text, link: url, data: { exportId: row.id },
        status: gate.send ? "pending" : "skipped", lastError: gate.send ? null : gate.reason,
      };
    }

    await db.$transaction(async (tx) => {
      await markReady(row.id, file, file.length, expiresAt, tx);
      await recordAudit(companyId, {
        actor: settingsActor(admin),
        action: "audit.privacy.exported",
        target: subject ? { kind: "user", id: subject.id } : { kind: "company", id: companyId },
        changes: {
          exportId: { before: null, after: row.id },
          kind: { before: null, after: kind },
          deliverTo: { before: null, after: deliverTo },
          sizeBytes: { before: null, after: file.length },
          ...(subject ? { deliveredToSubject: { before: null, after: deliverTo === "person" } } : {}),
          ...(reason ? { adminOnlyReason: { before: null, after: reason } } : {}),
        },
        source: "settings",
      }, tx);
      if (mail) await enqueueIn(tx, companyId, [mail]);
    });
    return { ok: true, id: row.id };
  } catch (err) {
    console.error(`[privacy-export] ${row.id} failed: ${err instanceof Error ? err.message : String(err)}`);
    await markFailed(row.id, err instanceof Error ? err.message : "failed").catch(() => undefined);
    return fail(t("privacyExport.errorFailed", { reason: err instanceof Error ? err.message.slice(0, 120) : "failed" }));
  }
}

export async function listExportsAction(slug: string): Promise<ExportListItem[] | null> {
  const admin = await companyAdminOf(slug);
  if (!admin) return null;
  const now = Date.now();
  const list = await listExports(admin.companyId);
  const open = list.filter((e) => e.kind === "person" && e.deliverTo === "admin" && !e.deliveredAt).map((e) => e.id);
  const downloaded = await downloadedExportIds(admin.companyId, open);
  return list.map((e) => ({
    id: e.id,
    kind: e.kind === "person" ? "person" : "company",
    subjectUserId: e.subjectUserId,
    requestedByUserId: e.requestedByUserId,
    deliverTo: e.deliverTo === "person" ? "person" : "admin",
    status: e.status === "ready" && e.expiresAt.getTime() <= now ? "expired" : e.status,
    sizeBytes: e.sizeBytes,
    error: e.error,
    expiresAt: e.expiresAt.toISOString(),
    createdAt: e.createdAt.toISOString(),
    downloadable: e.deliverTo === "admin" && e.requestedByUserId === admin.userId && e.status === "ready" && e.expiresAt.getTime() > now,
    delivered: e.deliveredAt ? { at: e.deliveredAt.toISOString(), byUserId: e.deliveredByUserId, note: e.deliveryNote } : null,
    markable: canMarkDelivered({ ...e, downloaded: downloaded.has(e.id) }),
  }));
}

/**
 * Marks an admin-only copy of one person's data as handed over by the company (DPO, HR), with an optional note of
 * the channel (Q10.13). Company admins only; once per export; the mark and its audit row commit together.
 */
export async function markExportDelivered(slug: string, exportId: string, note?: string): Promise<MarkDeliveredResult> {
  let t = createT(DEFAULT_LOCALE);
  const fail = (error: string): MarkDeliveredResult => ({ ok: false, error });
  const admin = await companyAdminOf(slug);
  if (!admin) return fail(t("settingsPrivacy.errorForbidden"));
  const { companyId } = admin;
  t = createT(await localeForUser(companyId, admin.userId));

  const row = typeof exportId === "string" ? await getExport(companyId, exportId) : null;
  if (!row) return fail(t("settingsPrivacy.errorDeliveredRefused"));
  if (row.deliveredAt) return fail(t("settingsPrivacy.errorDeliveredAlready"));
  const downloaded = (await downloadedExportIds(companyId, [row.id])).has(row.id);
  const subjectId = row.subjectUserId;
  if (!subjectId || !canMarkDelivered({ ...row, downloaded })) return fail(t("settingsPrivacy.errorDeliveredRefused"));

  const clean = cleanDeliveryNote(note);
  const at = new Date();
  const saved = await audited<number>(
    companyId,
    (n) => (n === 0 ? null : {
      actor: settingsActor(admin),
      action: "audit.privacy.delivered",
      target: { kind: "user", id: subjectId },
      changes: {
        exportId: { before: null, after: row.id },
        deliveredAt: { before: null, after: at.toISOString() },
        ...(clean ? { note: { before: null, after: clean } } : {}),
      },
      source: "settings",
    }),
    (tx) => markDelivered(tx, companyId, row.id, { byUserId: admin.userId, note: clean, at }),
  );
  if (!saved.ok) return fail(t("settingsPrivacy.errorAuditFailed"));
  if (saved.value === 0) return fail(t("settingsPrivacy.errorDeliveredAlready"));
  revalidatePath(`${companyPrefix(slug)}/settings/privacy`);
  return { ok: true };
}
