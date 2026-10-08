// Feature flags against a real Postgres (lib/db/flags.ts): admin's list is the whole truth, one
// company's settings never reach another, and the tenant guard covers the table.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FlagDef } from "@/config/flags";
import { resolveFlags } from "@/features/flags/resolve";
import { getDb, TenantScopeError } from "@/lib/db/client";
import { companyForFlags, flagOverrides, replaceFlagOverrides } from "@/lib/db/flags";

const db = getDb();
let acme: { id: string };
let globex: { id: string };
const at = new Date("2026-10-08T12:00:00Z");

const registry = {
  shiftRota: {
    description: "The shift rota page",
    owner: "Sam",
    defaults: { demo: true, sandbox: false, pilot: false, live: false },
    added: "2026-10-08",
    removeBy: "2026-12-01",
  },
} satisfies Record<string, FlagDef>;

beforeAll(async () => {
  await db.company.deleteMany({});
  acme = await db.company.create({ data: { slug: "acme", name: "Acme", stage: "pilot", seedJson: {} } });
  globex = await db.company.create({ data: { slug: "globex", name: "Globex", stage: "pilot", seedJson: {} } });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("replaceFlagOverrides", () => {
  it("writes admin's list, and a key it drops goes back to its default", async () => {
    await replaceFlagOverrides(acme.id, [
      { key: "shiftRota", enabled: true, updatedAt: at },
      { key: "newInbox", enabled: false, updatedAt: at },
    ]);
    expect(await flagOverrides(acme.id)).toEqual({ shiftRota: true, newInbox: false });

    await replaceFlagOverrides(acme.id, [{ key: "newInbox", enabled: true, updatedAt: at }]);
    expect(await flagOverrides(acme.id)).toEqual({ newInbox: true });

    await replaceFlagOverrides(acme.id, []);
    expect(await flagOverrides(acme.id)).toEqual({});
  });

  it("decides a flag together with the company's stage", async () => {
    const company = await companyForFlags("acme");
    expect(company).toMatchObject({ id: acme.id, stage: "pilot" });
    expect(resolveFlags(registry, company!.stage, await flagOverrides(acme.id))).toEqual({ shiftRota: false });
    await replaceFlagOverrides(acme.id, [{ key: "shiftRota", enabled: true, updatedAt: at }]);
    expect(resolveFlags(registry, company!.stage, await flagOverrides(acme.id))).toEqual({ shiftRota: true });
  });
});

describe("one company's flags stay its own", () => {
  it("never shows acme's settings to globex, and replacing globex's leaves acme's alone", async () => {
    await replaceFlagOverrides(acme.id, [{ key: "shiftRota", enabled: true, updatedAt: at }]);
    await replaceFlagOverrides(globex.id, []);
    expect(await flagOverrides(globex.id)).toEqual({});
    expect(await flagOverrides(acme.id)).toEqual({ shiftRota: true });
  });

  it("refuses to read or wipe the table without naming a company", async () => {
    await expect(db.featureFlag.findMany({})).rejects.toBeInstanceOf(TenantScopeError);
    await expect(db.featureFlag.deleteMany({})).rejects.toBeInstanceOf(TenantScopeError);
  });
});
