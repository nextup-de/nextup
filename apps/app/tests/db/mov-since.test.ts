// MOV-G1: the day MOV went live for a company is written once and kept (plan MOV, decision D17), against a real Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_RULES } from "@/features/demo/structure";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { DEFAULT_RULES, MOV_SINCE_KEY } from "@/features/knowledge/rules";
import { companySeed } from "@/lib/db/companies";
import { getDb } from "@/lib/db/client";
import { ensureMovSinceDay, loadMovSinceDay, saveCompanyRules } from "@/lib/db/rules";

const db = getDb();
let a: { id: string };
let b: { id: string };

beforeAll(async () => {
  await db.company.deleteMany({});
  a = await db.company.create({ data: { slug: "mov-a", name: "A", stage: "sandbox", seedJson: toSeedJson(SEED) as object } });
  b = await db.company.create({ data: { slug: "mov-b", name: "B", seedJson: {} } });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("MOV since day", () => {
  it("writes the day once and never changes it", async () => {
    expect(await loadMovSinceDay(a.id)).toBeNull();
    expect(await ensureMovSinceDay(a.id, 40)).toBe(40);
    expect(await ensureMovSinceDay(a.id, 55)).toBe(40);
    expect(await loadMovSinceDay(a.id)).toBe(40);
    expect(await db.companyRule.count({ where: { companyId: a.id, key: MOV_SINCE_KEY } })).toBe(1);
  });

  it("is per company", async () => {
    expect(await loadMovSinceDay(b.id)).toBeNull();
    expect(await ensureMovSinceDay(b.id, 0)).toBe(0);
    expect(await loadMovSinceDay(b.id)).toBe(0);
    expect(await loadMovSinceDay(a.id)).toBe(40);
  });

  it("is kept when the company rules are saved, whatever they are", async () => {
    await saveCompanyRules(a.id, DEMO_RULES, "test");
    expect(await loadMovSinceDay(a.id)).toBe(40);
    await saveCompanyRules(a.id, { ...DEFAULT_RULES }, "test");
    expect(await loadMovSinceDay(a.id)).toBe(40);
  });

  it("reaches the company seed's loop rules", async () => {
    const row = await db.company.findUniqueOrThrow({ where: { id: a.id } });
    const seed = await companySeed({ id: row.id, seedJson: row.seedJson, stage: "sandbox" });
    expect(seed.loop?.movSinceDay).toBe(40);
  });
});
