// Company rules against a real Postgres: per company, replace not append, cascade on delete.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_RULES } from "@/features/demo/structure";
import { DEFAULT_RULES, MOV_SINCE_KEY } from "@/features/knowledge/rules";
import { SEED } from "@/features/demo/seed";
import { toSeedJson } from "@/features/demo/parse";
import { companySeed } from "@/lib/db/companies";
import { getDb } from "@/lib/db/client";
import { loadCompanyRules, loadMovSinceDay, saveCompanyRules } from "@/lib/db/rules";

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
    // promise_days, outcome_days, deadline_handover, loop_steps and posting (decision Q1.7); no spend row for null.
    expect(await db.companyRule.count({ where: { companyId: a.id } })).toBe(5);
  });
  it("deletes the rules with the company", async () => {
    await saveCompanyRules(b.id, DEMO_RULES);
    await db.company.delete({ where: { id: b.id } });
    expect(await db.companyRule.count({ where: { companyId: b.id } })).toBe(0);
  });
});

describe("REG rule keys", () => {
  let sand: { id: string; seedJson: unknown };
  let plain: { id: string; seedJson: unknown };

  beforeAll(async () => {
    sand = await db.company.create({ data: { slug: "reg-sand", name: "Sandbox", stage: "sandbox", seedJson: toSeedJson(SEED) as object } });
    plain = await db.company.create({ data: { slug: "reg-plain", name: "Plain", stage: "sandbox", seedJson: toSeedJson(SEED) as object } });
  });

  it("loadMovSinceDay is null without the row and reads {day} from it", async () => {
    expect(await loadMovSinceDay(sand.id)).toBeNull();
    await db.companyRule.create({ data: { companyId: sand.id, key: "mov_since_day", value: { day: 40 } } });
    expect(await loadMovSinceDay(sand.id)).toBe(40);
    expect(await loadMovSinceDay(plain.id)).toBeNull();
  });

  it("saving the company rules keeps the row and stores the new keys that are set", async () => {
    await saveCompanyRules(sand.id, { ...DEFAULT_RULES, blockedDays: 4, appealDays: 12 }, "test");
    expect(await loadMovSinceDay(sand.id)).toBe(40);
    const rows = await db.companyRule.findMany({ where: { companyId: sand.id }, select: { key: true, value: true } });
    expect(rows.find((r) => r.key === MOV_SINCE_KEY)?.value).toEqual({ day: 40 });
    expect(rows.find((r) => r.key === "blocked_days")?.value).toEqual({ days: 4 });
    expect(rows.find((r) => r.key === "appeal_days")?.value).toEqual({ days: 12 });
    expect(rows.map((r) => r.key)).not.toContain("no_reason_min");
    expect(rows.map((r) => r.key)).not.toContain("question_days");
  });

  it("companySeed carries the five values into loop: the company's own, and 0 and the defaults without rows", async () => {
    const own = (await companySeed({ id: sand.id, seedJson: sand.seedJson, stage: "sandbox" })).loop;
    expect(own).toMatchObject({ movSinceDay: 40, blockedDays: 4, appealDays: 12, noReasonMin: 40, questionDays: 5 });
    const bare = (await companySeed({ id: plain.id, seedJson: plain.seedJson, stage: "sandbox" })).loop;
    expect(bare).toMatchObject({ movSinceDay: 0, blockedDays: 3, appealDays: 10, noReasonMin: 40, questionDays: 5 });
  });

  it("overload_at is stored once it is set and companySeed carries it into loop; without it the default stands (plan OVL, D17)", async () => {
    const at = { triage: 8, up: 15, overflow: 25, late: 2 };
    await saveCompanyRules(sand.id, { ...DEFAULT_RULES, overloadAt: at }, "test");
    const rows = await db.companyRule.findMany({ where: { companyId: sand.id }, select: { key: true, value: true } });
    expect(rows.find((r) => r.key === "overload_at")?.value).toEqual(at);
    expect(rows.find((r) => r.key === MOV_SINCE_KEY)?.value).toEqual({ day: 40 }); // the MOV row is still there
    expect((await companySeed({ id: sand.id, seedJson: sand.seedJson, stage: "sandbox" })).loop?.overloadAt).toEqual(at);
    expect((await companySeed({ id: plain.id, seedJson: plain.seedJson, stage: "sandbox" })).loop?.overloadAt).toBeUndefined();
    // Saving the rules without it removes the row: the default stands again.
    await saveCompanyRules(sand.id, { ...DEFAULT_RULES }, "test");
    expect((await db.companyRule.findMany({ where: { companyId: sand.id }, select: { key: true } })).map((r) => r.key)).not.toContain("overload_at");
  });
});
