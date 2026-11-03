"use server";
// /<company>/settings/webhooks (API-D1, D11). Each action starts with companyAdminOf and names the company
// id from the guard, never one from the caller. A change and its audit row share one transaction. The audit
// row holds the host and event names, never a secret and never the full address (it may carry a token).
import { revalidatePath } from "next/cache";
import { auditChanges } from "@/features/audit";
import { checkWebhook, hostOf, newWebhookSecret, type WebhookInput } from "@/features/api/webhook-form";
import { seal, vaultKey } from "@/features/connectors/vault";
import { companyPrefix } from "@/features/tenant/urls";
import type { MessageKey } from "@/i18n";
import { webhookContext } from "@/lib/db/webhooks";
import { settingsActor, type AuditEntry } from "@/server/audit/record";
import { audited, type Tx } from "./audited";
import { companyAdminOf } from "./guard";

export type WebhookResult = { ok: true; id?: string; secret?: string } | { ok: false; error: MessageKey };

const FORBIDDEN: WebhookResult = { ok: false, error: "settingsCompany.forbidden" };
const AUDIT_FAILED: WebhookResult = { ok: false, error: "settingsCompany.auditFailed" };
const GONE: WebhookResult = { ok: false, error: "settingsWebhooks.gone" };
const NO_KEY: WebhookResult = { ok: false, error: "settingsWebhooks.noVaultKey" };

const fields = (w: WebhookInput) => ({ host: hostOf(w.url), events: w.events, on: w.on });

type Admin = NonNullable<Awaited<ReturnType<typeof companyAdminOf>>>;

function entry(admin: Admin, kind: string, id: string, changes: ReturnType<typeof auditChanges>): AuditEntry {
  return { actor: settingsActor(admin), action: "audit.settings.webhooks", target: { kind, id }, changes, source: "settings" };
}

/** Find the subscription of this company inside the transaction. */
const find = (tx: Tx, companyId: string, id: string) => tx.webhookSubscription.findFirst({ where: { id, companyId } });

function done(slug: string): void {
  revalidatePath(`${companyPrefix(slug)}/settings/webhooks`);
}

export async function createWebhookAction(slug: string, input: { url: unknown; events: unknown; on?: unknown }): Promise<WebhookResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return FORBIDDEN;
  const checked = checkWebhook(input);
  if (!checked.ok) return checked;
  const key = vaultKey();
  if (!key) return NO_KEY;
  const w = checked.value;
  const secret = newWebhookSecret();
  const r = await audited(
    admin.companyId,
    (id: string) => entry(admin, "webhook", id, { ...auditChanges(null, fields(w)), secret: { before: null, after: "set" } }),
    async (tx) =>
      (await tx.webhookSubscription.create({
        data: { companyId: admin.companyId, url: w.url, secrets: [seal(secret, key, webhookContext(admin.companyId))], events: w.events, on: w.on, updatedBy: admin.userId },
      })).id,
  );
  if (!r.ok) return AUDIT_FAILED;
  done(slug);
  return { ok: true, id: r.value, secret };
}

export async function updateWebhookAction(slug: string, input: { id: string; url: unknown; events: unknown; on?: unknown }): Promise<WebhookResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return FORBIDDEN;
  const checked = checkWebhook(input);
  if (!checked.ok) return checked;
  const w = checked.value;
  const r = await audited(
    admin.companyId,
    (before: WebhookInput | null) => (before ? entry(admin, "webhook", input.id, auditChanges(fields(before), fields(w))) : null),
    async (tx) => {
      const row = await find(tx, admin.companyId, input.id);
      if (!row) return null;
      await tx.webhookSubscription.update({ where: { id: row.id }, data: { url: w.url, events: w.events, on: w.on, updatedBy: admin.userId } });
      return { url: row.url, events: row.events, on: row.on };
    },
  );
  if (!r.ok) return AUDIT_FAILED;
  if (!r.value) return GONE;
  done(slug);
  return { ok: true, id: input.id };
}

/** Add a second secret; both sign until the old one is dropped. At most two at a time. */
export async function rotateSecretAction(slug: string, id: string): Promise<WebhookResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return FORBIDDEN;
  const key = vaultKey();
  if (!key) return NO_KEY;
  const secret = newWebhookSecret();
  const r = await audited(
    admin.companyId,
    (res: "gone" | "two" | "ok") => (res === "ok" ? entry(admin, "webhook", id, { secret: { before: null, after: "replaced" } }) : null),
    async (tx) => {
      const row = await find(tx, admin.companyId, id);
      if (!row) return "gone" as const;
      if (row.secrets.length >= 2) return "two" as const;
      await tx.webhookSubscription.update({
        where: { id }, data: { secrets: [...row.secrets, seal(secret, key, webhookContext(admin.companyId))], updatedBy: admin.userId },
      });
      return "ok" as const;
    },
  );
  if (!r.ok) return AUDIT_FAILED;
  if (r.value === "gone") return GONE;
  if (r.value === "two") return { ok: false, error: "settingsWebhooks.dropOldFirst" };
  done(slug);
  return { ok: true, id, secret };
}

/** Keep only the newest secret. */
export async function dropOldSecretAction(slug: string, id: string): Promise<WebhookResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return FORBIDDEN;
  const r = await audited(
    admin.companyId,
    (res: "gone" | "one" | "ok") => (res === "ok" ? entry(admin, "webhook", id, { secret: { before: null, after: "removed" } }) : null),
    async (tx) => {
      const row = await find(tx, admin.companyId, id);
      if (!row) return "gone" as const;
      if (row.secrets.length < 2) return "one" as const;
      await tx.webhookSubscription.update({ where: { id }, data: { secrets: row.secrets.slice(-1), updatedBy: admin.userId } });
      return "ok" as const;
    },
  );
  if (!r.ok) return AUDIT_FAILED;
  if (r.value === "gone") return GONE;
  if (r.value === "one") return { ok: false, error: "settingsWebhooks.noOldSecret" };
  done(slug);
  return { ok: true, id };
}

export async function deleteWebhookAction(slug: string, id: string): Promise<WebhookResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return FORBIDDEN;
  const r = await audited(
    admin.companyId,
    (before: WebhookInput | null) => (before ? entry(admin, "webhook", id, auditChanges(fields(before), null)) : null),
    async (tx) => {
      const row = await find(tx, admin.companyId, id);
      if (!row) return null;
      await tx.webhookSubscription.delete({ where: { id } });
      return { url: row.url, events: row.events, on: row.on };
    },
  );
  if (!r.ok) return AUDIT_FAILED;
  if (!r.value) return GONE;
  done(slug);
  return { ok: true, id };
}

/** CompanyConfig.n8n, the switch NTF's gate reads for the webhook channel. */
export async function setWebhooksSendingAction(slug: string, on: boolean): Promise<WebhookResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return FORBIDDEN;
  const r = await audited(
    admin.companyId,
    (was: boolean) => (was === on ? null : entry(admin, "company", admin.companyId, auditChanges({ sending: was }, { sending: on }))),
    async (tx) => {
      const row = await tx.companyConfig.findUnique({ where: { companyId: admin.companyId }, select: { n8n: true } });
      await tx.companyConfig.upsert({ where: { companyId: admin.companyId }, create: { companyId: admin.companyId, n8n: on }, update: { n8n: on } });
      return row?.n8n ?? false;
    },
  );
  if (!r.ok) return AUDIT_FAILED;
  done(slug);
  return { ok: true };
}

/** A failed webhook delivery of this company goes back to pending, first attempt, due now (what retryOutboxRow does, in the audit's transaction). */
export async function retryDeliveryAction(slug: string, id: string): Promise<WebhookResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return FORBIDDEN;
  const r = await audited(
    admin.companyId,
    (retried: boolean) => (retried ? entry(admin, "webhook_delivery", id, { status: { before: "failed", after: "pending" } }) : null),
    async (tx) => {
      const { count } = await tx.outboxMessage.updateMany({
        where: { id, companyId: admin.companyId, channel: "webhook", status: "failed" },
        data: { status: "pending", attempt: 0, nextAt: new Date() },
      });
      return count === 1;
    },
  );
  if (!r.ok) return AUDIT_FAILED;
  if (!r.value) return { ok: false, error: "settingsWebhooks.retryGone" };
  done(slug);
  return { ok: true, id };
}
