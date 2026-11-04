import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// A cookie jar the tests can read back; next/headers has no request here.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string, o?: { maxAge?: number }) => void (o?.maxAge === 0 || value === "" ? jar.delete(name) : jar.set(name, value)),
    delete: (arg: string | { name: string }) => void jar.delete(typeof arg === "string" ? arg : arg.name),
  }),
  headers: async () => new Headers(),
}));

import { SESSION_COOKIE } from "../../src/features/auth/cookie";
import { integrationContext, seal, vaultKey } from "../../src/features/connectors/vault";
import { getDb } from "../../src/lib/db/client";
import { saveIntegration, setIntegrationOn } from "../../src/lib/db/integrations";
import { issueSession } from "../../src/server/issue-session";
import { GET as start } from "../../src/app/[company]/login/oidc/route";
import { GET as callback } from "../../src/app/[company]/login/oidc/callback/route";
import { startFakeIssuer, type FakeIssuer } from "../fixtures/oidc/fake-issuer";
import { createTestCompany, type TestCompany } from "./test-company";

const slug = `eid-oidc-${Date.now().toString(36)}`;
const FLOW = "nextup_oidc_flow";

describe("EID OIDC sign-in", () => {
  let idp: FakeIssuer;
  let co: TestCompany;
  const db = getDb();

  const ctx = { params: Promise.resolve({ company: slug }) };
  const req = (path: string) => new NextRequest(`http://localhost:3000${path}`);

  /** Start, follow the redirect to the fake issuer by hand, call the callback. Returns the final Location. */
  async function signIn(claims: Record<string, unknown>, query = ""): Promise<string> {
    idp.claims = claims;
    const first = await start(req(`/${slug}/login/oidc${query}`), ctx);
    const authorize = first.headers.get("location")!;
    if (!authorize.startsWith(idp.issuer)) return authorize;
    const hop = await fetch(authorize, { redirect: "manual" });
    const back = new URL(hop.headers.get("location")!);
    const done = await callback(req(`/${slug}/login/oidc/callback${back.search}`), ctx);
    const to = new URL(done.headers.get("location")!);
    return to.pathname + to.search;
  }

  const setOidc = async (on: boolean) => {
    await saveIntegration({
      companyId: co.companyId, system: "oidc", updatedBy: null,
      settings: { buttonText: "Company SSO", issuer: idp.issuer, clientId: idp.clientId },
      secretSealed: seal(idp.clientSecret, vaultKey()!, integrationContext(co.companyId, "oidc")),
    });
    await setIntegrationOn(co.companyId, "oidc", on, null);
  };
  const links = () => db.externalIdentity.findMany({ where: { companyId: co.companyId } });

  beforeAll(async () => {
    process.env.CONNECTOR_VAULT_KEY = "ab".repeat(32);
    process.env.AUTH_SECRET = "eid-oidc-test-secret-".repeat(3);
    idp = await startFakeIssuer();
    co = await createTestCompany(slug, [
      { name: "Ann", email: "ann@oidc.test", role: "manager" },
      { name: "Bob", email: "bob@oidc.test", role: "member" },
      { name: "Cy", email: "twin@oidc.test", role: "member" },
      { name: "Cyd", email: "TWIN@oidc.test", role: "member" },
      { name: "Dan", email: "dan@oidc.test", role: "member" },
    ]);
    await db.user.update({ where: { id: co.people.Dan.id, companyId: co.companyId }, data: { active: false } });
    await setOidc(true);
  });
  afterAll(async () => {
    await idp.stop();
    await db.company.deleteMany({ where: { id: co.companyId } });
  });
  beforeEach(() => {
    jar.clear();
    idp.attack = null;
  });

  it("signs a member in, links the account and keeps the session", async () => {
    const to = await signIn({ sub: "bob-sub", email: "Bob@OIDC.test" });
    expect(to).not.toContain("sso_error");
    expect(jar.has(SESSION_COOKIE)).toBe(true);
    expect(jar.has(FLOW)).toBe(false); // the flow cookie is used up
    const l = await links();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ userId: co.people.Bob.id, provider: "oidc", issuer: idp.issuer, subject: "bob-sub" });
    expect(idp.seen.verifierOk.every(Boolean)).toBe(true);
  });

  it("uses the link on the second sign-in even after the email changed", async () => {
    jar.clear();
    const to = await signIn({ sub: "bob-sub", email: "someone-else@oidc.test" });
    expect(to).not.toContain("sso_error");
    expect(jar.has(SESSION_COOKIE)).toBe(true);
    const l = await links();
    expect(l).toHaveLength(1);
    expect(l[0].lastSeenAt).toBeInstanceOf(Date);
  });

  it("refuses an unknown email, two members with the email and an inactive member", async () => {
    for (const [sub, email, code] of [
      ["x-1", "nobody@oidc.test", "unknown_user"],
      ["x-2", "twin@oidc.test", "ambiguous"],
      ["x-3", "dan@oidc.test", "inactive"],
    ] as const) {
      const to = await signIn({ sub, email });
      expect(to).toBe(`/${slug}/login?sso_error=${code}`);
      expect(jar.has(SESSION_COOKIE)).toBe(false);
    }
    expect(await links()).toHaveLength(1);
  });

  it("refuses a bad token and an unverified email", async () => {
    idp.attack = "wrong_nonce";
    expect(await signIn({ sub: "ann-sub", email: "ann@oidc.test" })).toBe(`/${slug}/login?sso_error=invalid_response`);
    idp.attack = "hs256";
    expect(await signIn({ sub: "ann-sub", email: "ann@oidc.test" })).toBe(`/${slug}/login?sso_error=invalid_response`);
    idp.attack = null;
    expect(await signIn({ sub: "ann-sub", email: "ann@oidc.test", email_verified: false })).toBe(`/${slug}/login?sso_error=email_unverified`);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
    expect(await links()).toHaveLength(1);
  });

  it("refuses a callback without the flow cookie", async () => {
    const res = await callback(req(`/${slug}/login/oidc/callback?code=x&state=y`), ctx);
    expect(res.headers.get("location")).toContain("sso_error=state");
    const err = await callback(req(`/${slug}/login/oidc/callback?error=access_denied`), ctx);
    expect(err.headers.get("location")).toContain("sso_error=");
  });

  it("ignores ?test=1 without an admin session", async () => {
    const to = await signIn({ sub: "ann-sub", email: "ann@oidc.test" }, "?test=1");
    expect(to).not.toContain("tested=");
    expect(jar.has(SESSION_COOKIE)).toBe(true);
    expect((await links()).some((l) => l.userId === co.people.Ann.id)).toBe(true);
  });

  it("stores a test sign-in without a session and without a link", async () => {
    await db.externalIdentity.deleteMany({ where: { companyId: co.companyId, userId: co.people.Ann.id } });
    jar.clear();
    await issueSession(co.companyId, slug, { id: co.people.Ann.id, name: "Ann", handle: null, role: "manager" });
    const before = jar.get(SESSION_COOKIE);
    const to = await signIn({ sub: "ann-test", email: "ann@oidc.test" }, "?test=1");
    expect(to).toBe(`/${slug}/settings/sign-in?tested=oidc`);
    expect(jar.get(SESSION_COOKIE)).toBe(before);
    expect(await db.externalIdentity.count({ where: { companyId: co.companyId, userId: co.people.Ann.id } })).toBe(0);
    const row = await db.integration.findUnique({ where: { companyId_system: { companyId: co.companyId, system: "oidc" } } });
    const last = (row!.account as { lastTest: { at: string; ok: boolean; detail: string } }).lastTest;
    expect(last).toMatchObject({ ok: true, detail: `matched ${co.people.Ann.id}` });

    // a failing test is stored too, with the code
    const failed = await signIn({ sub: "ann-test", email: "ghost@oidc.test" }, "?test=1");
    expect(failed).toBe(`/${slug}/settings/sign-in?tested=oidc`);
    const row2 = await db.integration.findUnique({ where: { companyId_system: { companyId: co.companyId, system: "oidc" } } });
    expect((row2!.account as { lastTest: { ok: boolean; detail: string } }).lastTest).toMatchObject({ ok: false, detail: "unknown_user" });
    expect(JSON.stringify(row2!.account)).not.toContain("token");
  });

  it("refuses to start with the row off, and on a demo company", async () => {
    await setIntegrationOn(co.companyId, "oidc", false, null);
    const off = await start(req(`/${slug}/login/oidc`), ctx);
    expect(off.headers.get("location")).toContain(`/login?sso_error=not_on`);
    expect(jar.has(FLOW)).toBe(false);
    await setIntegrationOn(co.companyId, "oidc", true, null);

    await db.company.update({ where: { id: co.companyId }, data: { stage: "demo" } });
    const demo = await start(req(`/${slug}/login/oidc`), ctx);
    expect(demo.headers.get("location")).toContain(`sso_error=demo_company`);
    await db.company.update({ where: { id: co.companyId }, data: { stage: "sandbox" } });
  });
});
