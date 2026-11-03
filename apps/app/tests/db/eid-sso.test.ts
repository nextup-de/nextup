import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../../src/lib/db/client";
import { findIdentity, identitiesOf, linkIdentity, saveOnce, takeOnce, touchIdentity, useOnce } from "../../src/lib/db/sso";
import { createTestCompany, type TestCompany } from "./test-company";

const slug = (n: string) => `eid-sso-${n}-${Date.now().toString(36)}`;
const ISSUER = "https://idp.example";

describe("EID sso store", () => {
  let a: TestCompany;
  let b: TestCompany;
  beforeAll(async () => {
    process.env.CONNECTOR_VAULT_KEY = "ab".repeat(32);
    a = await createTestCompany(slug("a"), [{ name: "Ann", email: "ann@a.test", role: "manager" }]);
    b = await createTestCompany(slug("b"), [{ name: "Bob", email: "bob@b.test", role: "manager" }]);
  });
  afterAll(async () => {
    const db = getDb();
    await db.ssoReplay.deleteMany({ where: { companyId: { in: [a.companyId, b.companyId] } } });
    await db.company.deleteMany({ where: { id: { in: [a.companyId, b.companyId] } } });
  });

  it("finds an identity by provider, issuer and subject, and only in its own company", async () => {
    const link = await linkIdentity({ companyId: a.companyId, userId: a.people.Ann.id, provider: "oidc", issuer: ISSUER, subject: "s1" });
    expect((await findIdentity(a.companyId, "oidc", ISSUER, "s1"))?.id).toBe(link.id);
    expect(await findIdentity(b.companyId, "oidc", ISSUER, "s1")).toBeNull();
    expect(await findIdentity(a.companyId, "saml", ISSUER, "s1")).toBeNull();
    expect(await findIdentity(a.companyId, "oidc", "https://other.example", "s1")).toBeNull();
    expect(await findIdentity(a.companyId, "oidc", ISSUER, "s2")).toBeNull();
    // once per company: the same account cannot be linked twice, but the other company may have it
    await expect(linkIdentity({ companyId: a.companyId, userId: a.people.Ann.id, provider: "oidc", issuer: ISSUER, subject: "s1" })).rejects.toThrow();
    await linkIdentity({ companyId: b.companyId, userId: b.people.Bob.id, provider: "oidc", issuer: ISSUER, subject: "s1" });
    expect((await findIdentity(b.companyId, "oidc", ISSUER, "s1"))?.userId).toBe(b.people.Bob.id);
    expect((await findIdentity(a.companyId, "oidc", ISSUER, "s1"))?.userId).toBe(a.people.Ann.id);
  });

  it("touches an identity and lists a person's links", async () => {
    const link = await findIdentity(a.companyId, "oidc", ISSUER, "s1");
    expect(link?.lastSeenAt).toBeNull();
    await touchIdentity(link!.id);
    expect((await identitiesOf(a.people.Ann.id))[0].lastSeenAt).toBeInstanceOf(Date);
  });

  it("accepts a replay key once, and again only after it expired", async () => {
    const later = new Date(Date.now() + 60_000);
    expect(await useOnce("assertion-1", a.companyId, later)).toBe(true);
    expect(await useOnce("assertion-1", a.companyId, later)).toBe(false);
    expect(await useOnce("assertion-2", a.companyId, new Date(Date.now() - 1000))).toBe(true); // already expired
    expect(await useOnce("assertion-2", a.companyId, later)).toBe(true); // the expired row is swept first
    expect(await useOnce("assertion-2", a.companyId, later)).toBe(false);
  });

  it("lets a stored request id be taken once", async () => {
    await saveOnce("req-1", a.companyId, new Date(Date.now() + 60_000));
    expect(await takeOnce("req-1")).toBe(true);
    expect(await takeOnce("req-1")).toBe(false);
    expect(await takeOnce("never-stored")).toBe(false);
    await saveOnce("req-2", a.companyId, new Date(Date.now() - 1000));
    expect(await takeOnce("req-2")).toBe(false); // expired
  });

  it("removes a person's links when the user is deleted", async () => {
    await getDb().user.delete({ where: { id: a.people.Ann.id, companyId: a.companyId } });
    expect(await identitiesOf(a.people.Ann.id)).toEqual([]);
    expect(await findIdentity(a.companyId, "oidc", ISSUER, "s1")).toBeNull();
    expect(await findIdentity(b.companyId, "oidc", ISSUER, "s1")).not.toBeNull();
  });
});
