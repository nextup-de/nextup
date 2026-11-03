"use server";

// Requesting and listing data exports (GDP D14). Company admins only. The ready file, its audit row and, for
// a copy to the person, the mail commit in one transaction: nothing is reported ready without its audit row.
import { gateOf, prefOf } from "@/features/notify/gate";
import {
  EXPORT_TTL_DAYS, addDays, buildCompanyExport, buildPersonExport, composeExportMail, hasVerifiedEmail, serializeExport,
} from "@/features/privacy/export";
import { createT, DEFAULT_LOCALE } from "@/i18n";
import { localeForUser } from "@/i18n/server";
import { getDb } from "@/lib/db/client";
import type { OutboxDraft } from "@/lib/db/outbox";
import {
  companyExportRows, createExport, enqueueIn, listExports, markFailed, markReady, personExportRows,
} from "@/lib/db/privacy-export";
import { recordAudit, settingsActor } from "@/server/audit/record";
import { companyBaseUrl } from "@/server/case-notice";
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
};

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
  return (await listExports(admin.companyId)).map((e) => ({
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
  }));
}
