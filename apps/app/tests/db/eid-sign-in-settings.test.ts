// The Sign-in settings page's actions against a real Postgres (EID-P1): who may change what, one audit row
// each with no secret in it, the SCIM token swap, the export cursor, demo companies, the login buttons.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactNode } from "react";
import type { Viewer } from "@/features/auth/session";
import { SEED } from "@/features/demo/seed";
import { toSeedJson } from "@/features/demo/parse";
import { integrationContext, open, vaultKey } from "@/features/connectors/vault";
import { getDb } from "@/lib/db/client";
import { loadExportRun } from "@/lib/db/audit-export";
import { getIntegration } from "@/lib/db/integrations";
import { ssoButtonsFor } from "@/lib/db/sso-buttons";
import { resolveToken } from "@/lib/db/tokens";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/i18n/server", () => ({ getT: async () => (k: string) => k }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

import {
  refreshSamlMetadataAction, replaceScimTokenAction, saveLogExportAction, saveOidcAction, saveSamlAction,
  sendTestRecordAction, setLogExportOnAction, setOidcOnAction, setSamlOnAction, setScimOnAction,
} from "@/server/actions/settings/sign-in";
import SignInSettingsPage from "@/app/[company]/(app)/settings/sign-in/page";

const db = getDb();
const ids: Record<string, { companyId: string; userId: string }> = {};
const asViewer = (key: string, slug: string, role: Viewer["role"]): Viewer => ({
  userId: ids[key].userId, companyId: ids[key].companyId, companySlug: slug, name: key, handle: null, role, epoch: 0, issuedAt: 0,
});
const A = "sis-a";
const DEMO = "sis-demo";
const oidcForm = { buttonText: "Acme login", issuer: "https://login.acme.test/realms/acme", clientId: "nextup", clientSecret: "TOP-SECRET-VALUE" };
const metadataXml = readFileSync(join(__dirname, "../fixtures/saml/okta-metadata.xml"), "utf8");
const connectorRows = (companyId: string) => db.auditEvent.findMany({ where: { companyId, action: { startsWith: "audit.connector." } }, orderBy: [{ at: "asc" }, { id: "asc" }] });

let metaServer: Server;
let metaUrl = "";
let exportDir = "";

/** The `view` prop the page hands to the SignInSettings component. */
async function pageView(slug = A): Promise<Record<string, Record<string, unknown>>> {
  const tree = await SignInSettingsPage({ params: Promise.resolve({ company: slug }), searchParams: Promise.resolve({}) });
  let found: Record<string, Record<string, unknown>> | null = null;
  const walk = (n: ReactNode): void => {
    Children.forEach(n, (c) => {
      if (!isValidElement(c)) return;
      const p = c.props as Record<string, unknown>;
      if ("view" in p) found = p.view as Record<string, Record<string, unknown>>;
      walk(p.children as ReactNode);
    });
  };
  walk(tree);
  if (!found) throw new Error("no view");
  return found;
}

beforeAll(async () => {
  process.env.CONNECTOR_VAULT_KEY = "ab".repeat(32);
  process.env.AUTH_SECRET ||= "test-secret-for-the-sign-in-page";
  exportDir = mkdtempSync(join(tmpdir(), "nextup-sis-"));
  process.env.LOG_EXPORT_DIR = exportDir;
  metaServer = createServer((_req, res) => { res.setHeader("content-type", "application/xml"); res.end(metadataXml); });
  await new Promise<void>((r) => metaServer.listen(0, "127.0.0.1", r));
  metaUrl = `http://127.0.0.1:${(metaServer.address() as AddressInfo).port}/metadata`;

  await db.company.deleteMany({});
  for (const [slug, stage] of [[A, "sandbox"], [DEMO, "demo"]] as const) {
    const c = await db.company.create({ data: { slug, name: slug, stage, seedJson: toSeedJson(SEED) as object } });
    const mk = async (key: string, role: string) => {
      const u = await db.user.create({ data: { companyId: c.id, name: key, email: `${key}@x.example`, role, active: true } });
      ids[key] = { companyId: c.id, userId: u.id };
    };
    await mk(`admin-${slug}`, "manager");
    if (slug === A) await mk("leader", "leader");
  }
});

beforeEach(() => { viewer = asViewer(`admin-${A}`, A, "manager"); });

afterAll(async () => {
  await new Promise<void>((r) => metaServer.close(() => r()));
  rmSync(exportDir, { recursive: true, force: true });
  await db.auditExportRun.deleteMany({});
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("EID sign-in settings", () => {
  it("refuses everyone but a company admin, and writes nothing", async () => {
    const leader = asViewer("leader", A, "leader");
    viewer = leader;
    expect(await saveOidcAction(A, oidcForm)).toMatchObject({ ok: false, error: "settingsSignIn.forbidden" });
    expect(await saveSamlAction(A, { buttonText: "S", source: "url", metadataUrl: metaUrl })).toMatchObject({ ok: false });
    expect(await replaceScimTokenAction(A)).toMatchObject({ ok: false });
    expect(await saveLogExportAction(A, { target: "file" })).toMatchObject({ ok: false });
    expect(await setLogExportOnAction(A, true)).toMatchObject({ ok: false });
    viewer = null;
    expect(await setOidcOnAction(A, true)).toMatchObject({ ok: false });
    expect(await db.integration.count({ where: { companyId: ids["admin-sis-a"].companyId } })).toBe(0);
    expect(await db.apiToken.count({ where: { companyId: ids["admin-sis-a"].companyId } })).toBe(0);
    expect(await connectorRows(ids["admin-sis-a"].companyId)).toHaveLength(0);
  });

  it("saves OIDC with the secret sealed, one audit row and no secret in it; switching on is its own row", async () => {
    const companyId = ids["admin-sis-a"].companyId;
    expect(await saveOidcAction(A, { ...oidcForm, clientSecret: "" })).toMatchObject({ ok: false, error: "settingsSignIn.invalid" });
    expect(await saveOidcAction(A, { ...oidcForm, issuer: "http://insecure.test" })).toMatchObject({ ok: false });
    expect(await getIntegration(companyId, "oidc")).toBeNull();

    expect(await saveOidcAction(A, oidcForm)).toEqual({ ok: true });
    const row = await getIntegration(companyId, "oidc");
    expect(row).toMatchObject({ on: false, hasSecret: true });
    const sealed = (await db.integration.findUniqueOrThrow({ where: { companyId_system: { companyId, system: "oidc" } } })).secretSealed;
    expect(sealed).not.toContain("TOP-SECRET-VALUE");
    expect(open(sealed ?? "", vaultKey() as Buffer, integrationContext(companyId, "oidc"))).toBe("TOP-SECRET-VALUE");
    expect(JSON.stringify(row?.settings)).not.toContain("TOP-SECRET-VALUE");

    let audit = await connectorRows(companyId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "audit.connector.saved", targetKind: "connector", targetId: "oidc", actorKind: "admin", actorUserId: ids["admin-sis-a"].userId });
    expect(JSON.stringify(audit[0].changes)).not.toContain("TOP-SECRET-VALUE");
    expect(audit[0].changes).toMatchObject({ clientSecret: { before: null, after: "set" } });

    // Saving again without a new secret keeps the old one and does not mention it.
    expect(await saveOidcAction(A, { ...oidcForm, clientSecret: "", buttonText: "Acme SSO" })).toEqual({ ok: true });
    expect(open((await db.integration.findUniqueOrThrow({ where: { companyId_system: { companyId, system: "oidc" } } })).secretSealed ?? "", vaultKey() as Buffer, integrationContext(companyId, "oidc"))).toBe("TOP-SECRET-VALUE");
    audit = await connectorRows(companyId);
    expect(audit).toHaveLength(2);
    expect(audit[1].changes).not.toHaveProperty("clientSecret");

    // Replacing it shows only "replaced".
    expect(await saveOidcAction(A, { ...oidcForm, clientSecret: "SECOND-SECRET" })).toEqual({ ok: true });
    audit = await connectorRows(companyId);
    expect(audit[2].changes).toMatchObject({ clientSecret: { before: null, after: "replaced" } });
    expect(JSON.stringify(audit)).not.toContain("SECOND-SECRET");

    expect(await ssoButtonsFor(companyId)).toEqual([]); // saved, not on
    expect(await setOidcOnAction(A, true)).toEqual({ ok: true });
    audit = await connectorRows(companyId);
    expect(audit).toHaveLength(4);
    expect(audit[3]).toMatchObject({ action: "audit.connector.on", targetId: "oidc" });
    expect(await setOidcOnAction(A, true)).toEqual({ ok: true }); // no change, no second row
    expect(await connectorRows(companyId)).toHaveLength(4);
    expect(await ssoButtonsFor(companyId)).toEqual([{ provider: "oidc", text: "Acme login" }]);
  });

  it("saves SAML from a metadata URL and from an uploaded file, and refreshes from the saved URL", async () => {
    const companyId = ids["admin-sis-a"].companyId;
    const before = (await connectorRows(companyId)).length;
    expect(await saveSamlAction(A, { buttonText: "Acme SSO", source: "url", metadataUrl: "http://not-local.test/m" })).toMatchObject({ ok: false });
    expect(await saveSamlAction(A, { buttonText: "Acme SSO", source: "file", metadataXml: "<nope/>" })).toMatchObject({ ok: false });
    expect(await setSamlOnAction(A, true)).toMatchObject({ ok: false, error: "settingsSignIn.notSaved" });

    expect(await saveSamlAction(A, { buttonText: "Acme SSO", source: "file", metadataXml })).toEqual({ ok: true });
    let saml = await getIntegration(companyId, "saml");
    expect(saml?.settings).toMatchObject({ buttonText: "Acme SSO", metadataUrl: null, ssoUrl: "https://example.okta.test/app/sample/exk0sample/sso/saml" });
    expect(await refreshSamlMetadataAction(A)).toMatchObject({ ok: false }); // a file has no address to refresh from

    expect(await saveSamlAction(A, { buttonText: "Acme SSO", source: "url", metadataUrl: metaUrl })).toEqual({ ok: true });
    saml = await getIntegration(companyId, "saml");
    expect(saml?.settings).toMatchObject({ metadataUrl: metaUrl });
    expect(await refreshSamlMetadataAction(A)).toEqual({ ok: true });

    // Keeping the metadata and changing only the button text.
    expect(await saveSamlAction(A, { buttonText: "Acme Entra", source: "keep" })).toEqual({ ok: true });
    expect((await getIntegration(companyId, "saml"))?.settings).toMatchObject({ buttonText: "Acme Entra", metadataUrl: metaUrl });

    const audit = (await connectorRows(companyId)).slice(before);
    expect(audit.every((r) => r.action === "audit.connector.saved" && r.targetId === "saml")).toBe(true);
    expect(audit.length).toBeGreaterThanOrEqual(3); // file, url, button text (the refresh may change nothing)
    expect(JSON.stringify(audit)).not.toContain("BEGIN CERTIFICATE");

    expect(await setSamlOnAction(A, true)).toEqual({ ok: true });
    expect(await ssoButtonsFor(companyId)).toEqual([{ provider: "oidc", text: "Acme login" }, { provider: "saml", text: "Acme Entra" }]);
  });

  it("replacing the SCIM token revokes the old one at once and returns the new one once", async () => {
    const companyId = ids["admin-sis-a"].companyId;
    expect(await setScimOnAction(A, true)).toMatchObject({ ok: false, error: "settingsSignIn.notSaved" });
    const first = await replaceScimTokenAction(A);
    if (!first.ok || !first.token) throw new Error("no token");
    const tokenRow = await db.apiToken.findFirstOrThrow({ where: { companyId, revokedAt: null } });
    expect(tokenRow).toMatchObject({ scopes: ["scim"], expiresAt: null, createdBy: ids["admin-sis-a"].userId });
    expect((await getIntegration(companyId, "scim"))).toMatchObject({ on: false, settings: { tokenId: tokenRow.id } });
    expect(await resolveToken(first.token)).toMatchObject({ id: tokenRow.id });

    expect(await setScimOnAction(A, true)).toEqual({ ok: true });
    const second = await replaceScimTokenAction(A);
    if (!second.ok || !second.token) throw new Error("no token");
    expect(second.token).not.toBe(first.token);
    expect(await resolveToken(first.token)).toBeNull();
    expect(await resolveToken(second.token)).not.toBeNull();
    expect(await db.apiToken.count({ where: { companyId, revokedAt: null } })).toBe(1);
    expect((await getIntegration(companyId, "scim"))?.on).toBe(true); // replacing does not switch it off

    const audit = await db.auditEvent.findMany({ where: { companyId, targetId: "scim" }, orderBy: [{ at: "asc" }, { id: "asc" }] });
    expect(audit.map((r) => r.action)).toEqual(["audit.connector.saved", "audit.connector.on", "audit.connector.saved"]);
    expect(JSON.stringify(audit)).not.toContain(first.token);
    expect(JSON.stringify(audit)).not.toContain(second.token);
    const tokenAudit = await db.auditEvent.findMany({ where: { companyId, action: { startsWith: "audit.token." } } });
    expect(tokenAudit.map((r) => r.action).sort()).toEqual(["audit.token.created", "audit.token.created", "audit.token.revoked"]);
  });

  it("saves the log export, starts its cursor at now when switched on, and sends a test record", async () => {
    const companyId = ids["admin-sis-a"].companyId;
    expect(await saveLogExportAction(A, { target: "syslog", host: "siem.test", port: "70000" })).toMatchObject({ ok: false });
    expect(await saveLogExportAction(A, { target: "file", host: "ignored" })).toEqual({ ok: true });
    expect((await getIntegration(companyId, "logsink"))?.settings).toMatchObject({ target: "file", host: null, port: null });
    expect(await loadExportRun(companyId)).toBeNull();

    const t0 = Date.now();
    expect(await setLogExportOnAction(A, true)).toEqual({ ok: true });
    const run = await loadExportRun(companyId);
    expect(run?.cursorAt?.getTime()).toBeGreaterThanOrEqual(t0 - 1000);
    expect(run?.cursorAt?.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(run?.cursorId).toBeNull();

    const sent = await sendTestRecordAction(A);
    expect(sent).toMatchObject({ ok: true, test: { ok: true } });
    expect(readdirSync(exportDir).some((f) => /^audit-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))).toBe(true);
    expect((await getIntegration(companyId, "logsink"))?.account).toMatchObject({ lastTest: { ok: true } });

    const audit = (await connectorRows(companyId)).filter((r) => r.targetId === "logsink");
    expect(audit.map((r) => r.action)).toEqual(["audit.connector.saved", "audit.connector.on"]);
    expect(await setLogExportOnAction(A, false)).toEqual({ ok: true });
    expect((await getIntegration(companyId, "logsink"))?.on).toBe(false);
  });

  it("shows the cards' states from the rows", async () => {
    const view = await pageView();
    expect(view.demo).toBe(false);
    expect(view.oidc).toMatchObject({ on: true, hasSecret: true, state: "on" });
    expect(view.scim).toMatchObject({ on: true, endpoint: expect.stringMatching(/\/api\/scim\/sis-a\/v2$/) });
    expect(view.logsink).toMatchObject({ on: false, state: "off", target: "file" });
    expect(JSON.stringify(view)).not.toContain("SECOND-SECRET");
    expect(JSON.stringify(view)).not.toMatch(/nxt_[0-9a-f]{20}/);
  });

  it("switches OIDC and SAML off again and the login buttons follow", async () => {
    const companyId = ids["admin-sis-a"].companyId;
    expect(await setSamlOnAction(A, false)).toEqual({ ok: true });
    expect((await ssoButtonsFor(companyId)).map((b) => b.provider)).toEqual(["oidc"]);
    expect(await setOidcOnAction(A, false)).toEqual({ ok: true });
    expect(await ssoButtonsFor(companyId)).toEqual([]);
    expect(await ssoButtonsFor(ids["admin-sis-demo"].companyId)).toEqual([]);
  });

  it("refuses OIDC, SAML and SCIM for a demo company and still allows the log export", async () => {
    viewer = asViewer(`admin-${DEMO}`, DEMO, "manager");
    const companyId = ids["admin-sis-demo"].companyId;
    expect(await saveOidcAction(DEMO, oidcForm)).toMatchObject({ ok: false, error: "settingsSignIn.demo" });
    expect(await saveSamlAction(DEMO, { buttonText: "S", source: "file", metadataXml })).toMatchObject({ ok: false, error: "settingsSignIn.demo" });
    expect(await refreshSamlMetadataAction(DEMO)).toMatchObject({ ok: false, error: "settingsSignIn.demo" });
    expect(await setOidcOnAction(DEMO, true)).toMatchObject({ ok: false, error: "settingsSignIn.demo" });
    expect(await setSamlOnAction(DEMO, true)).toMatchObject({ ok: false, error: "settingsSignIn.demo" });
    expect(await setScimOnAction(DEMO, true)).toMatchObject({ ok: false, error: "settingsSignIn.demo" });
    expect(await replaceScimTokenAction(DEMO)).toMatchObject({ ok: false, error: "settingsSignIn.demo" });
    expect(await db.integration.count({ where: { companyId } })).toBe(0);
    expect(await db.apiToken.count({ where: { companyId } })).toBe(0);

    expect(await saveLogExportAction(DEMO, { target: "file" })).toEqual({ ok: true });
    expect(await setLogExportOnAction(DEMO, true)).toEqual({ ok: true });
    expect((await pageView(DEMO)).oidc.state).toBe("demo");
  });

  it("writes the export file with what was sent", () => {
    const file = readdirSync(exportDir).find((f) => f.endsWith(".jsonl"));
    expect(file).toBeDefined();
    const line = readFileSync(join(exportDir, file ?? ""), "utf8").trim().split("\n")[0];
    expect(JSON.parse(line)).toMatchObject({ type: "audit.test" });
  });
});
