import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { DEFAULT_RULES } from "@/features/knowledge/rules";
import type { Baseline } from "@/features/metrics/types";
import { getDb } from "@/lib/db/client";
import { loadBaseline, saveBaseline } from "@/lib/db/baseline";
import { loadCompanyRules, saveCompanyRules } from "@/lib/db/rules";
import { recordAudit } from "@/server/audit/record";

const db = getDb();
const co: Record<"a" | "b", { id: string; admin: string }> = { a: null as never, b: null as never };

async function makeCompany(slug: string) {
  const c = await db.company.create({ data: { slug, name: slug, seedJson: toSeedJson(SEED) as object } });
  const u = await db.user.create({ data: { companyId: c.id, name: "admin", email: `admin@${slug}.example`, role: "manager" }, select: { id: true } });
  return { id: c.id, admin: u.id };
}

const base = (fromDay: number): Baseline => ({ fromDay, toDay: fromDay + 30, fromDate: null, toDate: null, imported: {} });

beforeAll(async () => {
  await db.company.deleteMany({});
  co.a = await makeCompany("met-baseline-a");
  co.b = await makeCompany("met-baseline-b");
});
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("MET baseline row", () => {
  it("saveBaseline then loadBaseline gives the same value, with an audit row", async () => {
    expect(await loadBaseline(co.a.id)).toBeNull();
    await saveBaseline(co.a.id, base(10), co.a.admin, recordAudit);
    expect(await loadBaseline(co.a.id)).toEqual(base(10));
    const rows = await db.auditEvent.findMany({ where: { companyId: co.a.id, action: "audit.settings.metrics_baseline" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].changes).toMatchObject({ baseline: { before: null, after: base(10) } });
  });

  it("saveCompanyRules keeps the baseline and leaves the other company alone", async () => {
    await saveBaseline(co.b.id, base(99), co.b.admin, recordAudit);
    await saveCompanyRules(co.b.id, DEFAULT_RULES);
    await saveCompanyRules(co.a.id, { ...DEFAULT_RULES, promiseDays: 7 });
    expect(await loadBaseline(co.a.id)).toEqual(base(10));
    expect((await loadCompanyRules(co.a.id)).promiseDays).toBe(7);
    expect(await loadBaseline(co.b.id)).toEqual(base(99));
    expect((await loadCompanyRules(co.b.id)).promiseDays).toBe(DEFAULT_RULES.promiseDays);
  });
});
