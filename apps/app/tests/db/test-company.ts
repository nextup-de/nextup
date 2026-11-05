// A company with its people made straight in the database (never through /admin, which has no
// company creation any more - ITC/D5). Used by the console e2e (tests/e2e/db/itc-console.spec.ts).
// Not in setup.ts: that file is the db-tests guard (only *_test databases, run as a vitest setup
// file); the e2e job's database is named differently and the spec makes its own throwaway company.
import { generateLoginCode, hashLoginCode } from "../../src/features/auth/login-code";
import { generateTotpSecret, totpContext } from "../../src/features/auth/totp";
import { seal, vaultKey } from "../../src/features/connectors/vault";
import { getDb } from "../../src/lib/db/client";
import { EMPTY_SEED } from "../../src/features/demo";

export type TestPerson = { name: string; email: string; role: "manager" | "leader" | "member"; stackAdmin?: boolean };
export type TestCompany = { slug: string; companyId: string; people: Record<string, { id: string; code: string; totpSecret: string }> };

/** Creates the company and its people, each with a login code and an enrolled authenticator. Returns the codes. */
export async function createTestCompany(slug: string, people: TestPerson[]): Promise<TestCompany> {
  const key = vaultKey();
  if (!key) throw new Error("CONNECTOR_VAULT_KEY is not set");
  const db = getDb();
  const company = await db.company.upsert({
    where: { slug },
    create: { slug, name: `Test ${slug}`, seedJson: JSON.parse(JSON.stringify(EMPTY_SEED)), stage: "sandbox", openedAt: new Date() },
    update: {},
  });
  const out: TestCompany["people"] = {};
  for (const p of people) {
    const code = generateLoginCode(slug);
    const totpSecret = generateTotpSecret();
    const user = await db.user.create({
      data: {
        companyId: company.id, name: p.name, email: p.email, role: p.role, dept: "Management",
        loginCodeHash: hashLoginCode(code), loginCodeAt: new Date(), isStackAdmin: p.stackAdmin ?? false,
      },
    });
    await db.user.update({
      where: { id: user.id, companyId: company.id },
      data: { totpSecretSealed: seal(totpSecret, key, totpContext(company.id, user.id)), totpEnabledAt: new Date() },
    });
    out[p.name] = { id: user.id, code, totpSecret };
  }
  return { slug, companyId: company.id, people: out };
}

/** Removes the company and everything under it. Idempotent. */
export async function deleteTestCompany(slug: string): Promise<void> {
  const db = getDb();
  const company = await db.company.findUnique({ where: { slug }, select: { id: true } });
  if (!company) return;
  await db.supportGrant.deleteMany({ where: { companyId: company.id } });
  await db.user.deleteMany({ where: { companyId: company.id } });
  await db.company.delete({ where: { id: company.id } });
}

/** A user for every seat label nobody has yet, so bindDemoCompany can seat them: a deadline goes only to a seat with someone on it. */
export async function peopleForSeats(companyId: string, slug: string): Promise<void> {
  const db = getDb();
  const [holders, users] = await Promise.all([
    db.orgRoleHolder.findMany({ where: { companyId }, select: { name: true } }),
    db.user.findMany({ where: { companyId }, select: { name: true } }),
  ]);
  const have = new Set(users.map((u) => u.name));
  const missing = [...new Set(holders.map((h) => h.name))].filter((name) => !have.has(name));
  await db.user.createMany({ data: missing.map((name) => ({ companyId, name, email: name.replace(/\W+/g, "").toLowerCase() + `@${slug}.example`, role: "leader" })) });
}
