// People's Microsoft 365 connections against a real Postgres: one per person, scoped by company,
// gone with the person, and the company switch defaults to off.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED } from "@/features/demo/seed";
import { toSeedJson } from "@/features/demo/parse";
import { getDb, TenantScopeError } from "@/lib/db/client";
import {
  connectionStatus,
  countConnections,
  deleteAllConnections,
  deleteConnection,
  m365SearchOn,
  saveConnection,
  setM365Search,
} from "@/lib/db/connections";

const db = getDb();
let acme: { id: string };
let globex: { id: string };
let ann: { id: string };
let bob: { id: string };
let gus: { id: string };

const person = (companyId: string, name: string) =>
  db.user.create({ data: { companyId, name, email: name.toLowerCase() + "@x.example", role: "member" }, select: { id: true } });

beforeAll(async () => {
  await db.company.deleteMany({});
  acme = await db.company.create({ data: { slug: "acme", name: "Acme", seedJson: toSeedJson(SEED) as object } });
  globex = await db.company.create({ data: { slug: "globex", name: "Globex", seedJson: toSeedJson(SEED) as object } });
  ann = await person(acme.id, "Ann");
  bob = await person(acme.id, "Bob");
  gus = await person(globex.id, "Gus");
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("company switch", () => {
  it("is off until an admin turns it on", async () => {
    expect(await m365SearchOn(acme.id)).toBe(false);
    await setM365Search(acme.id, true);
    expect(await m365SearchOn(acme.id)).toBe(true);
    expect(await m365SearchOn(globex.id)).toBe(false);
  });
});

describe("connections", () => {
  it("keeps one per person, replacing it on reconnect and clearing an old error", async () => {
    await saveConnection({ companyId: acme.id, userId: ann.id, scopes: ["Files.Read.All", "offline_access"], refreshTokenSealed: "v1.a" });
    await db.connection.updateMany({ where: { companyId: acme.id, userId: ann.id }, data: { lastError: "invalid_grant" } });
    await saveConnection({ companyId: acme.id, userId: ann.id, scopes: ["Files.Read.All", "offline_access"], refreshTokenSealed: "v1.b" });
    const rows = await db.connection.findMany({ where: { companyId: acme.id, userId: ann.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].refreshTokenSealed).toBe("v1.b");
    expect((await connectionStatus(acme.id, ann.id))?.lastError).toBeNull();
  });

  it("is invisible from another company", async () => {
    await saveConnection({ companyId: globex.id, userId: gus.id, scopes: [], refreshTokenSealed: "v1.g" });
    expect(await connectionStatus(globex.id, ann.id)).toBeNull();
    expect(await deleteConnection(globex.id, ann.id)).toBe(false);
    expect(await countConnections(acme.id)).toBe(1);
    expect(await countConnections(globex.id)).toBe(1);
  });

  it("is a tenant table: an unscoped query is refused", async () => {
    await expect(db.connection.findMany({})).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("goes when the person goes", async () => {
    await saveConnection({ companyId: acme.id, userId: bob.id, scopes: [], refreshTokenSealed: "v1.c" });
    await db.user.delete({ where: { id: bob.id, companyId: acme.id } });
    expect(await connectionStatus(acme.id, bob.id)).toBeNull();
  });

  it("disconnects one person, or everyone in one company only", async () => {
    expect(await deleteConnection(acme.id, ann.id)).toBe(true);
    await saveConnection({ companyId: acme.id, userId: ann.id, scopes: [], refreshTokenSealed: "v1.d" });
    expect(await deleteAllConnections(acme.id)).toBe(1);
    expect(await countConnections(acme.id)).toBe(0);
    expect(await countConnections(globex.id)).toBe(1);
  });
});
