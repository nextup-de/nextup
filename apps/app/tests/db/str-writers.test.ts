// The structure writers against a real Postgres: writeStructure and the backfill.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { DEMO_RULES } from "@/features/demo/structure";
import { getDb } from "@/lib/db/client";
import { loadKnowledge } from "@/lib/db/knowledge";
import { loadCompanyRules } from "@/lib/db/rules";
import { backfillStructure, writeStructure } from "@/lib/db/structure-writes";

const db = getDb();
const newId = () => crypto.randomUUID();

beforeAll(async () => {
  await db.company.deleteMany({});
});
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("STR writers", () => {
  it("writeStructure gives back the demo knowledge and rules, and null rules leave no row", async () => {
    const w = templateWrites("demo", newId);
    const a = await db.company.create({ data: { slug: "w-demo", name: "W", seedJson: {} } });
    await writeStructure(a.id, w, "test");
    expect(await loadKnowledge(a.id)).toEqual(w.knowledge);
    expect(await loadCompanyRules(a.id)).toEqual(DEMO_RULES);

    const b = await db.company.create({ data: { slug: "w-none", name: "W", seedJson: {} } });
    await writeStructure(b.id, { knowledge: templateWrites("demo", newId).knowledge, rules: null }, null);
    expect(await db.companyRule.count({ where: { companyId: b.id } })).toBe(0);
  });

  it("backfills only a company with depts and no rows, and a second run writes nothing", async () => {
    await db.company.deleteMany({});
    const old = await db.company.create({ data: { slug: "b-old", name: "O", seedJson: toSeedJson(SEED) as object } });
    const emptyOld = await db.company.create({
      data: { slug: "b-empty", name: "E", seedJson: toSeedJson({ ...SEED, depts: [], people: [] }) as object },
    });
    const has = await db.company.create({ data: { slug: "b-has", name: "H", seedJson: toSeedJson(SEED) as object } });
    await writeStructure(has.id, { knowledge: templateWrites("demo", newId).knowledge, rules: null }, null);
    const hasBefore = await loadKnowledge(has.id);

    const first = await backfillStructure();
    const line = (r: typeof first, slug: string) => r.find((x) => x.slug === slug)?.line;
    expect(line(first, "b-old")).toMatch(/^b-old: wrote \d+ units, \d+ roles, \d+ rules$/);
    expect(line(first, "b-empty")).toBe("b-empty: left as it is");
    expect(line(first, "b-has")).toBe("b-has: left as it is");

    const k = await loadKnowledge(old.id);
    expect(k.units.length).toBeGreaterThan(0);
    expect(k.roles.length).toBeGreaterThan(0);
    expect(k.rules).toHaveLength(SEED.routes.length);
    expect(k.goals).toEqual([]);
    expect(await db.companyRule.count({ where: { companyId: old.id } })).toBe(0);
    expect(await db.orgUnit.count({ where: { companyId: emptyOld.id } })).toBe(0);
    expect(await loadKnowledge(has.id)).toEqual(hasBefore);

    const second = await backfillStructure();
    expect(second.every((r) => r.line.endsWith("left as it is"))).toBe(true);
    expect(await loadKnowledge(old.id)).toEqual(k);
  });
});
