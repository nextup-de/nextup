// EID acceptance (EID-Z1): one company, all four switches turned on through the actions of the Sign-in page.
// A person provisioned through SCIM signs in through the fake OIDC issuer and the test SAML IdP to the same
// user id; a SCIM deactivation stops the next SSO sign-in; the audit rows reach the syslog receiver in order;
// with everything off the code sign-in is unchanged and SCIM answers 403 (D15).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// A cookie jar the test can read back; next/headers has no request here.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string, o?: { maxAge?: number }) => void (o?.maxAge === 0 || value === "" ? jar.delete(name) : jar.set(name, value)),
    delete: (arg: string | { name: string }) => void jar.delete(typeof arg === "string" ? arg : arg.name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.77" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
}));
vi.mock("@/i18n/server", () => ({ getT: async () => (k: string) => k }));

import type { Viewer } from "@/features/auth/session";
import { SESSION_COOKIE, verifySession } from "@/features/auth/cookie";
import { toSeedJson } from "@/features/demo/parse";
import { templateWrites } from "@/features/demo/content";
import { SCIM_ENTERPRISE } from "@/features/scim";
import { companyOrigin } from "@/features/tenant/urls";
import { loadExportRun } from "@/lib/db/audit-export";
import { writeStructure } from "@/lib/db/structure-writes";
import { getDb } from "@/lib/db/client";
import { ssoButtonsFor } from "@/lib/db/sso-buttons";
import { samlAcsUrl, samlEntityId } from "@/server/identity/saml";
import { runLogExportOnce } from "@/server/scheduler/log-export";
import { GET as oidcStart } from "@/app/[company]/login/oidc/route";
import { GET as oidcCallback } from "@/app/[company]/login/oidc/callback/route";
import { GET as samlStart } from "@/app/[company]/login/saml/route";
import { POST as samlAcs } from "@/app/[company]/login/saml/acs/route";
import { POST as scimPost } from "@/app/api/scim/[company]/v2/Users/route";
import { GET as scimList } from "@/app/api/scim/[company]/v2/Users/route";
import { PATCH as scimPatch } from "@/app/api/scim/[company]/v2/Users/[id]/route";
import { startFakeIssuer, type FakeIssuer } from "../fixtures/oidc/fake-issuer";
import { makeTestIdp, readAuthnRequest, type TestIdp } from "../fixtures/saml/idp";
import { startReceiver, type Receiver } from "../fixtures/syslog/receiver";
import { createTestCompany, type TestCompany } from "./test-company";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));

const {
  replaceScimTokenAction, saveLogExportAction, saveOidcAction, saveSamlAction,
  setLogExportOnAction, setOidcOnAction, setSamlOnAction, setScimOnAction,
} = await import("@/server/actions/settings/sign-in");
const { codeLogin } = await import("@/server/actions/auth");

const db = getDb();
const slug = `eid-z1-${Date.now().toString(36)}`;
const EMAIL = "pia@eid-z1.example";
type J = Record<string, unknown>;

describe("EID acceptance: OIDC, SAML, SCIM and syslog export", () => {
  let co: TestCompany;
  let idp: FakeIssuer;
  let saml: TestIdp;
  let rx: Receiver;
  let scimToken = "";
  let piaId = "";
  let cursorAt: Date;
  const ctx = { params: Promise.resolve({ company: slug }) };
  const origin = companyOrigin(slug);
  const sp = { entityId: samlEntityId(origin, slug), acsUrl: samlAcsUrl(origin, slug) };

  const scim = async (fn: (r: Request, c: never) => Promise<Response>, path: string, init: { method?: string; body?: unknown } = {}, id?: string) => {
    const res = await fn(
      new Request(`http://localhost/api/scim/${slug}/v2${path}`, {
        method: init.method ?? "GET",
        headers: { authorization: `Bearer ${scimToken}`, "content-type": "application/scim+json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      }),
      { params: Promise.resolve({ company: slug, id }) } as never,
    );
    const text = await res.text();
    return { status: res.status, json: (text ? JSON.parse(text) : null) as J | null };
  };
  const sessionUser = () => verifySession(jar.get(SESSION_COOKIE), process.env.AUTH_SECRET ?? "")?.uid;

  async function oidcSignIn(claims: Record<string, unknown>): Promise<string> {
    idp.claims = claims;
    const first = await oidcStart(new NextRequest(`http://localhost:3000/${slug}/login/oidc`), ctx);
    const hop = await fetch(first.headers.get("location")!, { redirect: "manual" });
    const back = new URL(hop.headers.get("location")!);
    const done = await oidcCallback(new NextRequest(`http://localhost:3000/${slug}/login/oidc/callback${back.search}`), ctx);
    const to = new URL(done.headers.get("location")!);
    return to.pathname + to.search;
  }
  async function samlSignIn(): Promise<string> {
    const first = await samlStart(new NextRequest(`http://localhost:3000/${slug}/login/saml`), ctx);
    const req = readAuthnRequest(first.headers.get("location")!);
    const body = new URLSearchParams({ SAMLResponse: saml.response({ requestId: req.id, sp, email: EMAIL }), RelayState: req.relayState });
    const res = await samlAcs(
      new NextRequest(`http://localhost:3000/${slug}/login/saml/acs`, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } }),
      ctx,
    );
    const to = new URL(res.headers.get("location")!);
    return to.pathname + to.search;
  }

  beforeAll(async () => {
    process.env.CONNECTOR_VAULT_KEY = "ab".repeat(32);
    process.env.AUTH_SECRET = "eid-z1-test-secret-".repeat(3);
    idp = await startFakeIssuer();
    saml = await makeTestIdp();
    rx = await startReceiver({ udp: true });
    co = await createTestCompany(slug, [
      { name: "Admin", email: "admin@eid-z1.example", role: "manager" },
      { name: "Mia", email: "mia@eid-z1.example", role: "member" },
    ]);
    const writes = templateWrites("demo", () => crypto.randomUUID());
    await db.company.update({ where: { id: co.companyId }, data: { seedJson: toSeedJson(writes.seedJson) as object } });
    await writeStructure(co.companyId, writes, "test");
    viewer = {
      userId: co.people.Admin.id, companyId: co.companyId, companySlug: slug, name: "Admin", handle: null,
      role: "manager", epoch: 0, issuedAt: 0,
    };
  });
  afterAll(async () => {
    await idp.stop();
    await saml.stop();
    await rx.stop();
    await db.auditExportRun.deleteMany({ where: { companyId: co.companyId } });
    await db.company.deleteMany({ where: { id: co.companyId } });
  });

  it("switches the four on, provisions through SCIM, signs in through OIDC and SAML as one user, then SCIM deactivates", async () => {
    // Log export first, so its cursor sits before everything below.
    expect(await saveLogExportAction(slug, { target: "syslog", host: "127.0.0.1", port: String(rx.ports.udp), transport: "udp" })).toEqual({ ok: true });
    expect(await setLogExportOnAction(slug, true)).toEqual({ ok: true });
    cursorAt = (await loadExportRun(co.companyId))!.cursorAt!;

    const token = await replaceScimTokenAction(slug);
    if (!token.ok || !token.token) throw new Error("no SCIM token");
    scimToken = token.token;
    expect(await setScimOnAction(slug, true)).toEqual({ ok: true });
    expect(await saveOidcAction(slug, { buttonText: "OIDC", issuer: idp.issuer, clientId: idp.clientId, clientSecret: idp.clientSecret })).toEqual({ ok: true });
    expect(await setOidcOnAction(slug, true)).toEqual({ ok: true });
    expect(await saveSamlAction(slug, { buttonText: "SAML", source: "file", metadataXml: saml.metadataXml })).toEqual({ ok: true });
    expect(await setSamlOnAction(slug, true)).toEqual({ ok: true });
    expect((await ssoButtonsFor(co.companyId)).map((b) => b.provider)).toEqual(["oidc", "saml"]);

    // The manager first, then the person with department and manager.
    const boss = await scim(scimPost, "/Users", { method: "POST", body: {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User", SCIM_ENTERPRISE], externalId: "ext-boss", userName: "boss@eid-z1.example",
      displayName: "Boss", active: true, emails: [{ type: "work", value: "boss@eid-z1.example", primary: true }],
      [SCIM_ENTERPRISE]: { department: "Engineering" },
    } });
    expect(boss.status).toBe(201);
    const made = await scim(scimPost, "/Users", { method: "POST", body: {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User", SCIM_ENTERPRISE], externalId: "ext-pia", userName: EMAIL,
      displayName: "Pia", active: true, emails: [{ type: "work", value: EMAIL, primary: true }],
      [SCIM_ENTERPRISE]: { department: "Engineering", manager: { value: boss.json!.id } },
    } });
    expect(made.status).toBe(201);
    piaId = made.json!.id as string;
    expect(await db.user.findFirstOrThrow({ where: { id: piaId, companyId: co.companyId } })).toMatchObject({ dept: "ENG", managerId: boss.json!.id, active: true });

    // OIDC: lands on that user id.
    const viaOidc = await oidcSignIn({ sub: "pia-oidc", email: EMAIL });
    expect(viaOidc).not.toContain("sso_error");
    expect(sessionUser()).toBe(piaId);

    // SAML: the same user id.
    jar.clear();
    const viaSaml = await samlSignIn();
    expect(viaSaml).not.toContain("sso_error");
    expect(sessionUser()).toBe(piaId);

    const links = await db.externalIdentity.findMany({ where: { companyId: co.companyId, userId: piaId }, orderBy: { provider: "asc" } });
    expect(links.map((l) => l.provider)).toEqual(["oidc", "saml", "scim"]);

    // SCIM deactivation: the next OIDC sign-in is refused.
    const off = await scim(scimPatch, `/Users/${piaId}`, { method: "PATCH", body: { schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], Operations: [{ op: "replace", value: { active: "False" } }] } }, piaId);
    expect(off.status).toBe(200);
    jar.clear();
    expect(await oidcSignIn({ sub: "pia-oidc", email: EMAIL })).toBe(`/${slug}/login?sso_error=inactive`);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("delivers the audit rows to the syslog receiver in order", async () => {
    const rows = await db.auditEvent.findMany({ where: { companyId: co.companyId, at: { gt: cursorAt } }, orderBy: [{ at: "asc" }, { id: "asc" }] });
    const actions = rows.map((r) => r.action);
    expect(actions.some((a) => a.startsWith("audit.connector."))).toBe(true);
    expect(actions).toContain("audit.directory.scim");

    await runLogExportOnce(new Date());
    await rx.waitFor(rows.length);
    const received = rx.messages.map((m) => /id="([^"]+)"/.exec(m)?.[1]);
    expect(received).toEqual(rows.map((r) => r.id));
    const types = rx.messages.map((m) => m.split(" ")[5]);
    expect(types.filter((t) => t === "audit.directory.scim").length).toBeGreaterThanOrEqual(3);
    expect(rx.messages.join("\n")).not.toMatch(/P-\d|pia@|idp\.clientSecret/);
  });

  it("with all four off, the code sign-in is unchanged, SCIM answers 403 and the exporter sends nothing", async () => {
    expect(await setOidcOnAction(slug, false)).toEqual({ ok: true });
    expect(await setSamlOnAction(slug, false)).toEqual({ ok: true });
    expect(await setScimOnAction(slug, false)).toEqual({ ok: true });
    expect(await setLogExportOnAction(slug, false)).toEqual({ ok: true });
    expect(await ssoButtonsFor(co.companyId)).toEqual([]);

    jar.clear();
    expect((await oidcStart(new NextRequest(`http://localhost:3000/${slug}/login/oidc`), ctx)).headers.get("location")).toContain("sso_error=not_on");
    expect((await samlStart(new NextRequest(`http://localhost:3000/${slug}/login/saml`), ctx)).headers.get("location")).toContain("sso_error=not_on");

    const usersBefore = await db.user.count({ where: { companyId: co.companyId } });
    expect((await scim(scimList, "/Users")).status).toBe(403);
    expect((await scim(scimPost, "/Users", { method: "POST", body: { externalId: "x", userName: "x@eid-z1.example", active: true } })).status).toBe(403);
    expect(await db.user.count({ where: { companyId: co.companyId } })).toBe(usersBefore);

    // The login code still works.
    const f = new FormData();
    f.set("slug", slug);
    f.set("code", co.people.Mia.code);
    await expect(codeLogin({}, f)).rejects.toThrow(`REDIRECT /${slug}`);
    expect(sessionUser()).toBe(co.people.Mia.id);

    const sent = rx.messages.length;
    await runLogExportOnce(new Date());
    await new Promise((r) => setTimeout(r, 200));
    expect(rx.messages.length).toBe(sent);
  });
});
