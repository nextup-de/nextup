import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "@/features/knowledge/rules";
import { flagsFor, invalidateFlags } from "@/features/flags";
import { getDb } from "@/lib/db/client";
import { replaceFlagOverrides } from "@/lib/db/flags";
import { saveCompanyRules } from "@/lib/db/rules";

const db = getDb();
const SLUG = "loop-s1";
let companyId: string;

const steps = (discussion: boolean, projects: boolean) => ({ ...DEFAULT_RULES, steps: { ...DEFAULT_RULES.steps, discussion, projects } });

beforeAll(async () => {
  await db.company.deleteMany({});
  companyId = (await db.company.create({ data: { slug: SLUG, name: "Loop S1", stage: "sandbox", seedJson: {} } })).id;
});

beforeEach(async () => {
  await replaceFlagOverrides(companyId, []);
  invalidateFlags(SLUG);
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("LOOP company switches", () => {
  it("steps off in loop_steps: discussion and projects are off; saved on and invalidated: both on", async () => {
    await saveCompanyRules(companyId, steps(false, false));
    invalidateFlags(SLUG);
    expect(await flagsFor(SLUG)).toMatchObject({ discussion: false, projects: false });

    await saveCompanyRules(companyId, steps(true, true));
    invalidateFlags(SLUG);
    expect(await flagsFor(SLUG)).toMatchObject({ discussion: true, projects: true });
  });
  it("an admin override that is off wins although the rule is on", async () => {
    await saveCompanyRules(companyId, steps(true, true));
    await replaceFlagOverrides(companyId, [{ key: "projects", enabled: false, updatedAt: new Date("2026-11-01T00:00:00Z") }]);
    invalidateFlags(SLUG);
    expect(await flagsFor(SLUG)).toMatchObject({ projects: false, discussion: true });
  });
});
