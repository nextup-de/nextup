// Company rules against a real Postgres: per company, replace not append, cascade on delete.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_RULES } from "@/features/demo/structure";
import { DEFAULT_RULES } from "@/features/knowledge/rules";
import { getDb } from "@/lib/db/client";
import { loadCompanyRules, saveCompanyRules } from "@/lib/db/rules";

const db = getDb();
let a: { id: string };
let b: { id: string };

beforeAll(async () => {
  await db.company.deleteMany({});
  a = await db.company.create({ data: { slug: "str-a", name: "A", seedJson: {} } });
  b = await db.company.create({ data: { slug: "str-b", name: "B", seedJson: {} } });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("STR company rules", () => {
  it("reads the defaults for a company with no rows", async () => {
    expect(await loadCompanyRules(a.id)).toEqual(DEFAULT_RULES);
  });
  it("saves and loads, and company B never sees A's rules", async () => {
    await saveCompanyRules(a.id, DEMO_RULES, "test");
    expect(await loadCompanyRules(a.id)).toEqual(DEMO_RULES);
    expect(await loadCompanyRules(b.id)).toEqual(DEFAULT_RULES);
  });
  it("replaces on a second save", async () => {
    await saveCompanyRules(a.id, { ...DEFAULT_RULES, promiseDays: 3, outcomeDays: 30 });
    expect(await loadCompanyRules(a.id)).toEqual({ ...DEFAULT_RULES, promiseDays: 3, outcomeDays: 30 });
    expect(await db.companyRule.count({ where: { companyId: a.id } })).toBe(4);
  });
  it("deletes the rules with the company", async () => {
    await saveCompanyRules(b.id, DEMO_RULES);
    await db.company.delete({ where: { id: b.id } });
    expect(await db.companyRule.count({ where: { companyId: b.id } })).toBe(0);
  });
});
