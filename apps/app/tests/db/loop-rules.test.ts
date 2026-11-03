// LOOP-G1: the company rules reach Seed.loop through companySeed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED } from "@/features/demo/seed";
import { DEFAULT_RULES } from "@/features/knowledge/rules";
import { companySeed } from "@/lib/db/companies";
import { getDb } from "@/lib/db/client";
import { saveCompanyRules } from "@/lib/db/rules";

const db = getDb();
let a: { id: string; seedJson: unknown };
let b: { id: string; seedJson: unknown };

beforeAll(async () => {
  await db.company.deleteMany({});
  a = await db.company.create({ data: { slug: "lrl-a", name: "A", seedJson: JSON.parse(JSON.stringify(SEED)) } });
  b = await db.company.create({ data: { slug: "lrl-b", name: "B", seedJson: JSON.parse(JSON.stringify(SEED)) } });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("LOOP rules reach the seed", () => {
  it("takes hand-over, measure and recognition from the company rules", async () => {
    await saveCompanyRules(a.id, { ...DEFAULT_RULES, deadlineHandover: false, steps: { ...DEFAULT_RULES.steps, recognition: false } });
    const seed = await companySeed({ ...a, stage: "demo" });
    expect(seed.loop?.deadlineHandover).toBe(false);
    expect(seed.loop?.recognition).toBe(false);
    expect(seed.loop?.measure).toBe(true);
  });
  it("a company without rows gets all three on", async () => {
    const seed = await companySeed({ ...b, stage: "demo" });
    expect([seed.loop?.deadlineHandover, seed.loop?.measure, seed.loop?.recognition]).toEqual([true, true, true]);
  });
});
