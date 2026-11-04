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
import { companyOrigin } from "../../src/features/tenant/urls";
import { getDb } from "../../src/lib/db/client";
import { saveIntegration, setIntegrationOn } from "../../src/lib/db/integrations";
import { GET as start } from "../../src/app/[company]/login/saml/route";
import { POST as acs } from "../../src/app/[company]/login/saml/acs/route";
import { GET as metadata } from "../../src/app/[company]/login/saml/metadata/route";
import { samlAcsUrl, samlEntityId } from "../../src/server/identity/saml";
import { makeTestIdp, readAuthnRequest, type ResponseOpts, type TestIdp } from "../fixtures/saml/idp";
import { createTestCompany, type TestCompany } from "./test-company";

const slug = `eid-saml-${Date.now().toString(36)}`;

describe("EID SAML", () => {
  let idp: TestIdp;
  let co: TestCompany;
  const db = getDb();
  const origin = companyOrigin(slug);
  const sp = { entityId: samlEntityId(origin, slug), acsUrl: samlAcsUrl(origin, slug) };
  const ctx = { params: Promise.resolve({ company: slug }) };

  /** Start a login, let the test IdP answer with `opts`, post it to the ACS. Returns the final path. */
  async function signIn(opts: Partial<ResponseOpts> = {}, query = ""): Promise<string> {
    const first = await start(new NextRequest(`http://localhost:3000/${slug}/login/saml${query}`), ctx);
    const location = first.headers.get("location")!;
    if (!location.startsWith(idp.ssoUrl)) return location;
    const req = readAuthnRequest(location);
    expect(req.issuer).toBe(sp.entityId);
    return post(idp.response({ requestId: req.id, sp, email: "bob@saml.test", ...opts }), req.relayState);
  }
  async function post(samlResponse: string, relayState: string): Promise<string> {
    const body = new URLSearchParams({ SAMLResponse: samlResponse, RelayState: relayState });
    const res = await acs(
      new NextRequest(`http://localhost:3000/${slug}/login/saml/acs`, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } }),
      ctx,
    );
    expect(res.status).toBe(303);
    const to = new URL(res.headers.get("location")!);
    return to.pathname + to.search;
  }
  const links = () => db.externalIdentity.findMany({ where: { companyId: co.companyId, provider: "saml" } });
  const refused = async (opts: Partial<ResponseOpts>) => {
    const before = (await links()).length;
    jar.clear();
    expect(await signIn(opts)).toBe(`/${slug}/login?sso_error=invalid_response`);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
    expect(await links()).toHaveLength(before);
  };

  beforeAll(async () => {
    process.env.CONNECTOR_VAULT_KEY = "ab".repeat(32);
    process.env.AUTH_SECRET = "eid-saml-test-secret-".repeat(3);
    idp = await makeTestIdp();
    co = await createTestCompany(slug, [
      { name: "Bob", email: "bob@saml.test", role: "member" },
      { name: "Ann", email: "ann@saml.test", role: "manager" },
    ]);
    await saveIntegration({
      companyId: co.companyId, system: "saml", updatedBy: null,
      settings: { buttonText: "Company SSO", idpEntityId: idp.entityId, ssoUrl: idp.ssoUrl, idpCerts: [idp.cert] },
    });
    await setIntegrationOn(co.companyId, "saml", true, null);
  });
  afterAll(async () => {
    await idp.stop();
    await db.company.deleteMany({ where: { id: co.companyId } });
  });
  beforeEach(() => jar.clear());

  it("signs a member in with a signed response and links the account", async () => {
    const to = await signIn();
    expect(to).not.toContain("sso_error");
    expect(jar.has(SESSION_COOKIE)).toBe(true);
    const l = await links();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ userId: co.people.Bob.id, issuer: idp.entityId, subject: "bob@saml.test" });
  });

  it("rejects an unsigned assertion", () => refused({ unsigned: true }));
  it("rejects a signature by another key", () => refused({ otherKey: true }));
  it("rejects a wrapped signature", () => refused({ wrapped: true, email: "ann@saml.test" }));
  it("rejects an expired assertion", () => refused({ expired: true }));
  it("rejects a wrong audience", () => refused({ audience: "https://elsewhere.test/metadata" }));
  it("rejects an unknown InResponseTo", () => refused({ inResponseTo: "_never-asked" }));
  it("rejects a wrong issuer", () => refused({ issuer: "https://evil.test/idp" }));
  it("rejects an encrypted assertion", () => refused({ encrypted: true }));

  it("rejects a replayed assertion", async () => {
    const assertionId = `_replay-${Date.now()}`;
    expect(await signIn({ assertionId, email: "ann@saml.test" })).not.toContain("sso_error");
    jar.clear();
    await refused({ assertionId, email: "ann@saml.test" });
  });

  it("rejects a response without a valid RelayState", async () => {
    const first = await start(new NextRequest(`http://localhost:3000/${slug}/login/saml`), ctx);
    const req = readAuthnRequest(first.headers.get("location")!);
    const to = await post(idp.response({ requestId: req.id, sp }), "forged");
    expect(to).toContain("sso_error=");
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("serves our metadata, also while off, and 404 without a SAML row", async () => {
    await setIntegrationOn(co.companyId, "saml", false, null);
    const off = await start(new NextRequest(`http://localhost:3000/${slug}/login/saml`), ctx);
    expect(off.headers.get("location")).toContain("sso_error=not_on");
    const res = await metadata(new NextRequest(`http://localhost:3000/${slug}/login/saml/metadata`), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/samlmetadata+xml");
    const xml = await res.text();
    expect(xml).toContain(sp.entityId);
    expect(xml).toContain(sp.acsUrl);
    await setIntegrationOn(co.companyId, "saml", true, null);

    await db.integration.deleteMany({ where: { companyId: co.companyId, system: "saml" } });
    const gone = await metadata(new NextRequest(`http://localhost:3000/${slug}/login/saml/metadata`), ctx);
    expect(gone.status).toBe(404);
  });
});
