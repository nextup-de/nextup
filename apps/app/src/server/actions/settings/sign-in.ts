"use server";
// /<company>/settings/sign-in (EID-P1, D7, D12, D14). Company admins only: each action starts with companyAdminOf
// and names the company from the guard, never one from the caller. A save and its audit row share one
// transaction. A secret (the OIDC client secret) is written to the audit row only as set, replaced or removed.
// OIDC, SAML and SCIM are refused for a demo company; the log export is allowed on every stage.
import { revalidatePath } from "next/cache";
import { holdsRealPeople } from "@/features/admin/stages";
import { auditChanges, type AuditAction } from "@/features/audit";
import { integrationContext, seal, vaultKey } from "@/features/connectors/vault";
import { SCIM_SCOPE } from "@/features/integrations";
import { fetchIdpMetadata, parseIdpMetadata, type IdpMetadata } from "@/features/identity/saml-metadata";
import {
  parseLogExportForm, parseOidcForm, parseSamlForm, samlSettingsFrom, type SamlForm,
} from "@/features/identity/sign-in-form";
import { parseOidcSettings, parseSamlSettings, parseScimSettings } from "@/features/identity/settings";
import { companyPrefix } from "@/features/tenant/urls";
import type { MessageKey } from "@/i18n";
import { getDb } from "@/lib/db/client";
import { startExportAt } from "@/lib/db/audit-export";
import { createToken, resolveToken, revokeToken } from "@/lib/db/tokens";
import { settingsActor, type AuditEntry } from "@/server/audit/record";
import { sendTestRecord } from "@/server/logsink";
import { audited, type Tx } from "./audited";
import { companyAdminOf } from "./guard";

export type SignInResult =
  | { ok: true; token?: string; test?: { ok: boolean; detail: string } }
  | { ok: false; error: MessageKey; errors?: string[] };

const FORBIDDEN: SignInResult = { ok: false, error: "settingsSignIn.forbidden" };
const AUDIT_FAILED: SignInResult = { ok: false, error: "settingsSignIn.auditFailed" };
const DEMO: SignInResult = { ok: false, error: "settingsSignIn.demo" };
const NO_KEY: SignInResult = { ok: false, error: "settingsSignIn.noVaultKey" };
const NOT_SAVED: SignInResult = { ok: false, error: "settingsSignIn.notSaved" };
const invalid = (errors: string[]): SignInResult => ({ ok: false, error: "settingsSignIn.invalid", errors });

type Admin = NonNullable<Awaited<ReturnType<typeof companyAdminOf>>>;
type System = "oidc" | "saml" | "scim" | "logsink";
type Row = { on: boolean; settings: unknown; secretSealed: string | null; account: unknown };

const where = (companyId: string, system: string) => ({ companyId_system: { companyId, system } });

function entry(admin: Admin, system: System, action: AuditAction, changes: ReturnType<typeof auditChanges>): AuditEntry {
  return { actor: settingsActor(admin), action, target: { kind: "connector", id: system }, changes, source: "settings" };
}

const rowOf = (tx: Tx, companyId: string, system: System): Promise<Row | null> =>
  tx.integration.findUnique({ where: where(companyId, system), select: { on: true, settings: true, secretSealed: true, account: true } });

const asRecord = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Demo companies hold no real people: the sign-in and provisioning cards stay off there. */
async function isDemo(companyId: string): Promise<boolean> {
  const c = await getDb().company.findUnique({ where: { id: companyId }, select: { stage: true } });
  return !c || !holdsRealPeople(c.stage);
}

function done(slug: string): void {
  revalidatePath(`${companyPrefix(slug)}/settings/sign-in`);
}

/** Writes the settings (and, when given, the secret) of a row. A new row starts off; saving clears lastError. */
async function writeRow(tx: Tx, p: { companyId: string; system: System; settings: unknown; secretSealed?: string; account?: unknown; updatedBy: string }): Promise<void> {
  const data = {
    settings: p.settings as object,
    ...(p.secretSealed !== undefined ? { secretSealed: p.secretSealed } : {}),
    ...(p.account !== undefined ? { account: p.account as object } : {}),
    updatedBy: p.updatedBy,
    lastError: null,
  };
  await tx.integration.upsert({
    where: where(p.companyId, p.system),
    create: { companyId: p.companyId, system: p.system, ...data },
    update: data,
  });
}

/** Saving different settings makes an older test result stale. */
const withoutTest = (account: unknown): object | undefined => {
  const a = asRecord(account);
  if (!("lastTest" in a)) return undefined;
  const { lastTest: _gone, ...rest } = a;
  void _gone;
  return rest;
};

// ── OIDC ────────────────────────────────────────────────────────────────────────────────────────

export async function saveOidcAction(slug: string, input: Record<string, unknown>): Promise<SignInResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return FORBIDDEN;
  if (await isDemo(admin.companyId)) return DEMO;
  const parsed = parseOidcForm(input);
  if (!parsed.ok) return invalid(parsed.errors);
  const { settings, clientSecret } = parsed.value;
  const key = vaultKey();
  if (clientSecret && !key) return NO_KEY;
  const sealed = clientSecret && key ? seal(clientSecret, key, integrationContext(admin.companyId, "oidc")) : undefined;

  const r = await audited(
    admin.companyId,
    (res: { missingSecret: boolean; changes: ReturnType<typeof auditChanges> } | null) =>
      res && !res.missingSecret && Object.keys(res.changes).length > 0 ? entry(admin, "oidc", "audit.connector.saved", res.changes) : null,
    async (tx) => {
      const before = await rowOf(tx, admin.companyId, "oidc");
      if (!before?.secretSealed && sealed === undefined) return { missingSecret: true, changes: {} };
      const had = before?.secretSealed ? "sealed" : null;
      const changes = auditChanges(
        before ? { ...asRecord(before.settings), clientSecret: had } : null,
        { ...settings, clientSecret: sealed !== undefined ? `new:${sealed}` : had },
        ["clientSecret"],
      );
      await writeRow(tx, { companyId: admin.companyId, system: "oidc", settings, secretSealed: sealed, account: withoutTest(before?.account), updatedBy: admin.userId });
      return { missingSecret: false, changes };
    },
  );
  if (!r.ok) return AUDIT_FAILED;
  if (r.value?.missingSecret) return invalid(["clientSecret: is required"]);
  done(slug);
  return { ok: true };
}

/** Switch a row on or off, with its audit row. `ready` says whether the saved row may be switched on. */
async function switchRow(slug: string, system: System, on: boolean, ready: (row: Row) => boolean, demoCheck: boolean): Promise<SignInResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return FORBIDDEN;
  if (demoCheck && (await isDemo(admin.companyId))) return DEMO;
  const r = await audited(
    admin.companyId,
    (res: "none" | "notReady" | "same" | "changed") =>
      res === "changed" ? entry(admin, system, on ? "audit.connector.on" : "audit.connector.off", { on: { before: !on, after: on } }) : null,
    async (tx) => {
      const row = await rowOf(tx, admin.companyId, system);
      if (!row) return "none" as const;
      if (row.on === on) return "same" as const;
      if (on && !ready(row)) return "notReady" as const;
      await tx.integration.update({
        where: where(admin.companyId, system),
        data: on ? { on: true, enabledAt: new Date(), lastError: null, leaseUntil: null, updatedBy: admin.userId } : { on: false, leaseUntil: null, updatedBy: admin.userId },
      });
      return "changed" as const;
    },
  );
  if (!r.ok) return AUDIT_FAILED;
  if (r.value === "none" || r.value === "notReady") return NOT_SAVED;
  if (r.value === "changed" && system === "logsink" && on) await startExportAt(admin.companyId, new Date());
  done(slug);
  return { ok: true };
}

export async function setOidcOnAction(slug: string, on: boolean): Promise<SignInResult> {
  return switchRow(slug, "oidc", on, (row) => row.secretSealed !== null && parseOidcSettings(row.settings).ok, true);
}

// ── SAML ────────────────────────────────────────────────────────────────────────────────────────

type IdpResult = { ok: true; idp: IdpMetadata; metadataUrl: string | null } | { ok: false; errors: string[] };

async function readMetadata(form: SamlForm, existing: Row | null): Promise<IdpResult> {
  const s = form.source;
  if (s.kind === "keep") {
    const old = existing ? parseSamlSettings(existing.settings) : null;
    if (!old?.ok) return { ok: false, errors: ["metadata: choose a URL or a file"] };
    const v = old.value;
    return { ok: true, idp: { entityId: v.idpEntityId, ssoUrl: v.ssoUrl, certs: v.idpCerts, certExpiresAt: v.certExpiresAt }, metadataUrl: v.metadataUrl };
  }
  let xml: string;
  if (s.kind === "url") {
    const got = await fetchIdpMetadata(s.url);
    if (!got.ok) return got;
    xml = got.value;
  } else {
    xml = s.xml;
  }
  const idp = parseIdpMetadata(xml);
  if (!idp.ok) return idp;
  return { ok: true, idp: idp.value, metadataUrl: s.kind === "url" ? s.url : null };
}

/** The metadata is read first (it may be a download), then the row and its audit row are written together. */
async function storeSaml(admin: Admin, form: SamlForm, slug: string): Promise<SignInResult> {
  const before = await getDb().integration.findUnique({ where: where(admin.companyId, "saml"), select: { on: true, settings: true, secretSealed: true, account: true } });
  const meta = await readMetadata(form, before);
  if (!meta.ok) return invalid(meta.errors);
  const settings = samlSettingsFrom(form, meta.idp, meta.metadataUrl);
  if (!settings.ok) return invalid(settings.errors);
  const next = settings.value;
  const r = await audited(
    admin.companyId,
    (changes: ReturnType<typeof auditChanges>) => (Object.keys(changes).length > 0 ? entry(admin, "saml", "audit.connector.saved", changes) : null),
    async (tx) => {
      const row = await rowOf(tx, admin.companyId, "saml");
      const old = row ? parseSamlSettings(row.settings) : null;
      // The certificates are public but long: the audit row says when they expire, not what they are.
      const view = (s: Record<string, unknown> | null) => {
        if (!s) return null;
        const { idpCerts: _certs, ...rest } = s;
        void _certs;
        return rest;
      };
      const changes = auditChanges(old?.ok ? view(old.value) : null, view(next));
      await writeRow(tx, { companyId: admin.companyId, system: "saml", settings: next, account: withoutTest(row?.account), updatedBy: admin.userId });
      return changes;
    },
  );
  if (!r.ok) return AUDIT_FAILED;
  done(slug);
  return { ok: true };
}

export async function saveSamlAction(slug: string, input: Record<string, unknown>): Promise<SignInResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return FORBIDDEN;
  if (await isDemo(admin.companyId)) return DEMO;
  const form = parseSamlForm(input);
  if (!form.ok) return invalid(form.errors);
  return storeSaml(admin, form.value, slug);
}

/** Download the metadata from the saved address again (a new signing certificate, a moved sign-on URL). */
export async function refreshSamlMetadataAction(slug: string): Promise<SignInResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return FORBIDDEN;
  if (await isDemo(admin.companyId)) return DEMO;
  const row = await getDb().integration.findUnique({ where: where(admin.companyId, "saml"), select: { settings: true } });
  const saved = row ? parseSamlSettings(row.settings) : null;
  const url = saved?.ok ? saved.value.metadataUrl : null;
  if (!saved?.ok || !url) return NOT_SAVED;
  const v = saved.value;
  return storeSaml(admin, {
    buttonText: v.buttonText, source: { kind: "url", url },
    emailAttribute: v.emailAttribute, nameAttribute: v.nameAttribute, departmentAttribute: v.departmentAttribute,
  }, slug);
}

export async function setSamlOnAction(slug: string, on: boolean): Promise<SignInResult> {
  return switchRow(slug, "saml", on, (row) => parseSamlSettings(row.settings).ok, true);
}

// ── SCIM ────────────────────────────────────────────────────────────────────────────────────────

export async function setScimOnAction(slug: string, on: boolean): Promise<SignInResult> {
  return switchRow(slug, "scim", on, (row) => parseScimSettings(row.settings).ok, true);
}

/**
 * A new token (scope scim only, no expiry), stored on the row; the old one is revoked at once. The token comes
 * back once and is nowhere else. The row is created off when there is none.
 */
export async function replaceScimTokenAction(slug: string): Promise<SignInResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return FORBIDDEN;
  if (await isDemo(admin.companyId)) return DEMO;
  const actor = settingsActor(admin);
  const raw = await createToken(admin.companyId, "SCIM", [SCIM_SCOPE], { createdBy: admin.userId, expiresAt: null, actor });
  const made = await resolveToken(raw);
  if (!made || made.companyId !== admin.companyId) return AUDIT_FAILED;

  const r = await audited(
    admin.companyId,
    (res: { oldId: string | null }) =>
      entry(admin, "scim", "audit.connector.saved", { token: { before: null, after: res.oldId ? "replaced" : "set" } }),
    async (tx) => {
      const row = await rowOf(tx, admin.companyId, "scim");
      const old = row ? parseScimSettings(row.settings) : null;
      await writeRow(tx, { companyId: admin.companyId, system: "scim", settings: { tokenId: made.id }, account: row?.account ?? undefined, updatedBy: admin.userId });
      return { oldId: old?.ok ? old.value.tokenId : null };
    },
  );
  if (!r.ok) {
    await revokeToken(admin.companyId, made.id, actor);
    return AUDIT_FAILED;
  }
  if (r.value.oldId) await revokeToken(admin.companyId, r.value.oldId, actor);
  done(slug);
  return { ok: true, token: raw };
}

// ── Audit log export ────────────────────────────────────────────────────────────────────────────

export async function saveLogExportAction(slug: string, input: Record<string, unknown>): Promise<SignInResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return FORBIDDEN;
  const parsed = parseLogExportForm(input);
  if (!parsed.ok) return invalid(parsed.errors);
  const settings = parsed.value;
  const r = await audited(
    admin.companyId,
    (changes: ReturnType<typeof auditChanges>) => (Object.keys(changes).length > 0 ? entry(admin, "logsink", "audit.connector.saved", changes) : null),
    async (tx) => {
      const row = await rowOf(tx, admin.companyId, "logsink");
      // The CA certificate is public; the audit row says only that one is set.
      const view = (s: Record<string, unknown> | null) => (s ? { ...s, caPem: s.caPem ? "set" : null } : null);
      const changes = auditChanges(row ? view(asRecord(row.settings)) : null, view({ ...settings }));
      await writeRow(tx, { companyId: admin.companyId, system: "logsink", settings, account: withoutTest(row?.account), updatedBy: admin.userId });
      return changes;
    },
  );
  if (!r.ok) return AUDIT_FAILED;
  done(slug);
  return { ok: true };
}

/** Switching the export on starts its cursor at now: the history stays in the CSV. */
export async function setLogExportOnAction(slug: string, on: boolean): Promise<SignInResult> {
  return switchRow(slug, "logsink", on, () => true, false);
}

export async function sendTestRecordAction(slug: string): Promise<SignInResult> {
  const admin = await companyAdminOf(slug);
  if (!admin) return FORBIDDEN;
  const row = await getDb().integration.findUnique({ where: where(admin.companyId, "logsink"), select: { id: true } });
  if (!row) return NOT_SAVED;
  const test = await sendTestRecord(admin.companyId);
  done(slug);
  return { ok: true, test };
}
