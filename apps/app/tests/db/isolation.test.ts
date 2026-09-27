// Tenant isolation against a real Postgres. docs/INTEGRATIONS.md: "One unit test seeds two
// companies and asserts that no list, count, or detail leaks across."
//
// Not in tests/unit/ on purpose - it needs a database, and `npm test` has to stay DB-free for CI.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, TenantScopeError } from "@/lib/db/client";

const db = getDb();

let acme: { id: string };
let globex: { id: string };

const event = (companyId: string, id: string, idemKey: string | null = null) => ({
  id,
  companyId,
  day: 0,
  type: "case.raised",
  actor: "T. Vogel",
  payload: {},
  idemKey,
});

beforeAll(async () => {
  // Company cascades to everything else, so this is enough to start clean.
  await db.company.deleteMany({});
  acme = await db.company.create({
    data: { slug: "acme", name: "Acme", accessCodeHash: "x", seedJson: {} },
  });
  globex = await db.company.create({
    data: { slug: "globex", name: "Globex", accessCodeHash: "x", seedJson: {} },
  });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("the guard refuses unscoped queries", () => {
  it("blocks a read that names no company", async () => {
    await expect(db.caseEvent.findMany({})).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("blocks the delete that would wipe every company", async () => {
    await expect(db.caseEvent.deleteMany({})).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("blocks a write that does not say whose row it is", async () => {
    // @ts-expect-error - deliberately omitting companyId is the thing under test
    await expect(db.caseEvent.create({ data: { id: "e_x", day: 0, type: "t", actor: "a", payload: {} } })).rejects.toBeInstanceOf(Error);
  });
});

describe("no list or count leaks across companies", () => {
  beforeAll(async () => {
    await db.caseEvent.create({ data: event(acme.id, "e_a1") });
    await db.caseEvent.create({ data: event(acme.id, "e_a2") });
    await db.caseEvent.create({ data: event(globex.id, "e_b1") });
    await db.user.create({
      data: { companyId: acme.id, name: "T. Vogel", email: "t@acme.test", role: "leader" },
    });
    await db.user.create({
      data: { companyId: globex.id, name: "A. Other", email: "a@globex.test", role: "leader" },
    });
  });

  it("lists only its own events", async () => {
    const a = await db.caseEvent.findMany({ where: { companyId: acme.id } });
    const b = await db.caseEvent.findMany({ where: { companyId: globex.id } });
    expect(a.map((e) => e.id).sort()).toEqual(["e_a1", "e_a2"]);
    expect(b.map((e) => e.id)).toEqual(["e_b1"]);
  });

  it("counts only its own events", async () => {
    await expect(db.caseEvent.count({ where: { companyId: acme.id } })).resolves.toBe(2);
    await expect(db.caseEvent.count({ where: { companyId: globex.id } })).resolves.toBe(1);
  });

  it("cannot fetch another company's event by id alone", async () => {
    const stolen = await db.caseEvent.findFirst({ where: { companyId: globex.id, id: "e_a1" } });
    expect(stolen).toBeNull();
  });

  it("scopes users too - the same email could exist in both companies", async () => {
    const users = await db.user.findMany({ where: { companyId: acme.id } });
    expect(users.map((u) => u.name)).toEqual(["T. Vogel"]);
  });
});

describe("the CaseEvent contract the API depends on", () => {
  it("allows many rows with no idempotency key", async () => {
    // The @@unique([companyId, idemKey]) must not collide on NULLs, or ordinary app events
    // (which carry no key) would fail after the first one.
    const rows = await db.caseEvent.findMany({ where: { companyId: acme.id, idemKey: null } });
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects a replayed idempotency key within a company", async () => {
    await db.caseEvent.create({ data: event(acme.id, "e_a3", "n8n:exec:1") });
    await expect(
      db.caseEvent.create({ data: event(acme.id, "e_a4", "n8n:exec:1") }),
    ).rejects.toThrow();
  });

  it("allows the same key in a different company", async () => {
    const row = await db.caseEvent.create({ data: event(globex.id, "e_b2", "n8n:exec:1") });
    expect(row.id).toBe("e_b2");
  });

  it("issues a monotonic seq - the GET ?since= cursor depends on it", async () => {
    const seqs = (
      await db.caseEvent.findMany({ where: { companyId: acme.id }, orderBy: { seq: "asc" } })
    ).map((e) => e.seq);
    expect(seqs.length).toBeGreaterThan(1);
    expect(seqs.every((s, i) => i === 0 || s > seqs[i - 1])).toBe(true);
  });
});
