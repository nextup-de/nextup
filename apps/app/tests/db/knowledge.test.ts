// Company knowledge against a real Postgres: rows stay with their company, the guard covers the
// new tables, and loadSeed() serves the tables once a company has them.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED } from "@/features/demo/seed";
import { toSeedJson } from "@/features/demo/parse";
import { DEMO_GOALS } from "@/features/demo/structure";
import { rowsFromSeed } from "@/features/knowledge";
import { getDb, TenantScopeError } from "@/lib/db/client";
import { loadSeed } from "@/lib/db/companies";
import { loadKnowledge, replaceKnowledge } from "@/lib/db/knowledge";

const db = getDb();
// IDN-G1: loaded routes also carry the owner/deputy role and seat ids; the fixture has none.
const ID_KEYS = ["ownerRoleId", "ownerSeatId", "deputyRoleId", "deputySeatId"];
const withoutIds = (routes: readonly object[] | undefined) =>
  routes?.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !ID_KEYS.includes(k))));
const rows = () => rowsFromSeed(SEED, DEMO_GOALS, () => crypto.randomUUID());

let acme: { id: string };
let globex: { id: string };

beforeAll(async () => {
  await db.company.deleteMany({});
  // acme's blob has no org chart at all: whatever loadSeed returns for it came from the tables.
  acme = await db.company.create({ data: { slug: "acme", name: "Acme", seedJson: toSeedJson({ ...SEED, depts: [], people: [], routes: [] }) as object } });
  globex = await db.company.create({ data: { slug: "globex", name: "Globex", seedJson: toSeedJson(SEED) as object } });
  await replaceKnowledge(acme.id, rows(), "test");
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("company knowledge tables", () => {
  it("keeps one company's rows away from another", async () => {
    const theirs = await loadKnowledge(globex.id);
    expect(theirs.units).toHaveLength(0);
    expect(theirs.roles).toHaveLength(0);
    expect(theirs.goals).toHaveLength(0);
    expect((await loadKnowledge(acme.id)).rules).toHaveLength(SEED.routes.length);
  });

  it("refuses an unscoped read of the new tables", async () => {
    await expect(db.orgRole.findMany({})).rejects.toBeInstanceOf(TenantScopeError);
    await expect(db.goal.deleteMany({})).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("serves depts, people and routes from the tables once they exist", async () => {
    const seed = await loadSeed("acme");
    expect(seed?.depts).toEqual(SEED.depts);
    expect(seed?.people).toEqual(SEED.people);
    expect(withoutIds(seed?.routes)).toEqual(SEED.routes);
  });

  it("replaces rather than appends on a second save", async () => {
    await replaceKnowledge(acme.id, rows(), "test");
    expect((await loadKnowledge(acme.id)).roles).toHaveLength(SEED.people.length - 1);
  });

  it("gives a company without rows no structure, whatever its seedJson holds", async () => {
    const seed = await loadSeed("globex");
    expect([seed?.routes, seed?.people, seed?.depts]).toEqual([[], [], []]);
  });
});
