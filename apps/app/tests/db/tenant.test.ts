// The read path: a company in Postgres comes back as the same Tenant + Seed shape the pages have
// always been handed, and reduces to the same state as the built-in seed.
//
// This is what makes "add a company from /admin" real - the app stops caring where a tenant
// came from.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { findCompanyByEmailDomain, findCompanyBySlug, companySlugs, loadSeed } from "@/lib/db/companies";
import { seedTemplate } from "@/features/demo";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";

const db = getDb();

beforeAll(async () => {
  await db.company.deleteMany({});
  const acme = await db.company.create({
    data: {
      slug: "acme",
      name: "Acme Maschinenbau GmbH",
      mark: "A",
      anonymousHandles: true,
      accessCodeHash: "scrypt$aa$bb",
      seedJson: toSeedJson(seedTemplate("demo")) as object,
    },
  });
  await db.user.create({
    data: {
      companyId: acme.id,
      name: "T. Vogel",
      email: "t.vogel@acme.example",
      role: "leader",
      dept: "Production",
    },
  });
  // A second company with a different email domain and an EMPTY seed - the "new customer" case.
  const globex = await db.company.create({
    data: {
      slug: "globex",
      name: "Globex AG",
      mark: "G",
      accessCodeHash: "scrypt$cc$dd",
      seedJson: toSeedJson(seedTemplate("empty")) as object,
    },
  });
  await db.user.create({
    data: { companyId: globex.id, name: "A. Other", email: "a@globex.test", role: "manager" },
  });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("findCompanyBySlug", () => {
  it("returns the tenant shape the layouts expect", async () => {
    const t = await findCompanyBySlug("acme");
    expect(t).not.toBeNull();
    expect(t?.slug).toBe("acme");
    expect(t?.name).toBe("Acme Maschinenbau GmbH");
    expect(t?.mark).toBe("A");
    expect(t?.anonymousHandles).toBe(true);
    expect(t?.users.map((u) => u.email)).toEqual(["t.vogel@acme.example"]);
    expect(t?.users[0].role).toBe("leader");
  });

  it("is null for a slug nobody registered - the 404 path", async () => {
    await expect(findCompanyBySlug("does-not-exist")).resolves.toBeNull();
  });
});

describe("findCompanyByEmailDomain", () => {
  it("finds the company that owns a work-email domain (login step 1)", async () => {
    await expect(findCompanyByEmailDomain("anyone@acme.example")).resolves.toMatchObject({ slug: "acme" });
    await expect(findCompanyByEmailDomain("someone@globex.test")).resolves.toMatchObject({ slug: "globex" });
  });

  it("does not match a domain nobody uses, or a malformed address", async () => {
    await expect(findCompanyByEmailDomain("a@nowhere.test")).resolves.toBeNull();
    await expect(findCompanyByEmailDomain("not-an-email")).resolves.toBeNull();
  });
});

describe("loadSeed", () => {
  it("round-trips through Postgres JSON and reduces identically to the built-in seed", async () => {
    const seed = await loadSeed("acme");
    expect(seed).not.toBeNull();

    const fromDb = reduce(seed!, emptyLog());
    const fromSeed = reduce(SEED, emptyLog());
    expect(fromDb.cases.map((c) => c.id)).toEqual(fromSeed.cases.map((c) => c.id));
    expect(fromDb.cases.map((c) => c.assignee)).toEqual(fromSeed.cases.map((c) => c.assignee));
    expect(fromDb.ledger).toEqual(fromSeed.ledger);
  });

  it("gives a new company a genuinely empty install", async () => {
    const seed = await loadSeed("globex");
    expect(seed?.cases).toEqual([]);
    expect(seed?.people).toEqual([]);
    // ...but it keeps the rules, not just the rows.
    expect(seed?.promiseDays).toBe(SEED.promiseDays);
  });
});

describe("companySlugs", () => {
  it("lists every tenant, for /admin and the TLS check", async () => {
    await expect(companySlugs()).resolves.toEqual(["acme", "globex"]);
  });
});
