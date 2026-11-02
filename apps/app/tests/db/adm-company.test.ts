import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { companySeed } from "@/lib/db/companies";
import { loadCalendar } from "@/lib/db/calendar";
import { saveCalendarAction, saveCompanyAction, saveRulesAction } from "@/server/actions/settings/company";

const db = getDb();
const ids: Record<string, { companyId: string; userId: string }> = {};

const asViewer = (key: string, slug: string, role: Viewer["role"]): Viewer => ({
  userId: ids[key].userId, companyId: ids[key].companyId, companySlug: slug, name: key, handle: null, role, epoch: 0, issuedAt: 0,
});

const form = (o: Record<string, string | string[]>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};

const RULES = {
  slug: "adm-a", promiseDays: "4", outcomeDays: "20", spendLimitEur: "900", spendText: "Up to 900 euros",
  discussEveryDays: "5", discussMaxRounds: "2", fastLaneEur: "300", measureDays: "45", tolerancePct: "4", rewardRule: "fixed", rewardAmountEur: "150",
};

async function seedOf(slug: string) {
  const c = await db.company.findUniqueOrThrow({ where: { slug } });
  return companySeed({ id: c.id, seedJson: c.seedJson, stage: c.stage });
}

beforeAll(async () => {
  await db.company.deleteMany({});
  for (const slug of ["adm-a", "adm-b"]) {
    const c = await db.company.create({ data: { slug, name: `Name ${slug}`, mark: "M", seedJson: JSON.parse(JSON.stringify(SEED)), stage: "pilot" } });
    const mk = async (key: string, role: string) => {
      const u = await db.user.create({ data: { companyId: c.id, name: key, email: `${key}@x.example`, role, active: true } });
      ids[key] = { companyId: c.id, userId: u.id };
    };
    if (slug === "adm-a") {
      await mk("managerA", "manager");
      await mk("leaderA", "leader");
    } else {
      await mk("managerB", "manager");
    }
  }
});

beforeEach(() => { viewer = null; });

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("ADM company settings", () => {
  it("saves the company and its profile for the admin's company only", async () => {
    viewer = asViewer("managerA", "adm-a", "manager");
    const r = await saveCompanyAction({}, form({
      slug: "adm-a", name: "Alpha GmbH", mark: "AG", vision: "v", mission: "m", principles: "one\ntwo", businessModel: "b", complianceRules: "no names",
    }));
    expect(r).toEqual({ ok: true });
    const a = await db.company.findUniqueOrThrow({ where: { slug: "adm-a" } });
    expect(a).toMatchObject({ name: "Alpha GmbH", mark: "AG" });
    const p = await db.companyProfile.findUniqueOrThrow({ where: { companyId: ids.managerA.companyId } });
    expect(p).toMatchObject({ vision: "v", mission: "m", principles: ["one", "two"], businessModel: "b", complianceRules: "no names" });
    expect(await db.company.findUniqueOrThrow({ where: { slug: "adm-b" } })).toMatchObject({ name: "Name adm-b", mark: "M" });
    expect(await db.companyProfile.count({ where: { companyId: ids.managerB.companyId } })).toBe(0);
  });

  it("saves the rules and the loop rules, and the seed reads them back", async () => {
    viewer = asViewer("managerA", "adm-a", "manager");
    expect(await saveRulesAction({}, form(RULES))).toEqual({ ok: true });
    const seed = await seedOf("adm-a");
    expect(seed).toMatchObject({ promiseDays: 4, outcomeDays: 20, spend: { limitEur: 900, text: "Up to 900 euros" } });
    expect(seed.loop).toMatchObject({
      discussEveryDays: 5, discussMaxRounds: 2, fastLaneEur: 300, measureDays: [45], tolerancePct: 4,
      reward: { kind: "fixed", amount: 150 },
    });
    expect(await db.companyRule.count({ where: { companyId: ids.managerB.companyId } })).toBe(0);
    expect(await db.companyConfig.count({ where: { companyId: ids.managerB.companyId } })).toBe(0);
  });

  it("saves the calendar and loadCalendar reads it back", async () => {
    viewer = asViewer("managerA", "adm-a", "manager");
    const r = await saveCalendarAction({}, form({ slug: "adm-a", region: "DE-BY", workdays: ["1", "2", "3", "4"], extraHolidays: "2026-12-24", extraWorkdays: "" }));
    expect(r).toEqual({ ok: true });
    expect(await loadCalendar(ids.managerA.companyId)).toEqual({ region: "DE-BY", workdays: [1, 2, 3, 4], extraHolidays: ["2026-12-24"], extraWorkdays: [] });
    expect(await loadCalendar(ids.managerB.companyId)).toMatchObject({ region: "DE", workdays: [1, 2, 3, 4, 5] });
    expect((await seedOf("adm-a")).clock).toMatchObject({ mode: "workdays", calendar: { region: "DE-BY" } });
  });

  it("returns the message key and writes nothing for a bad value", async () => {
    viewer = asViewer("managerA", "adm-a", "manager");
    const r = await saveRulesAction({}, form({ ...RULES, promiseDays: "0" }));
    expect(r).toEqual({ error: "settingsCompany.errPromiseDays", field: "promiseDays" });
    expect((await seedOf("adm-a"))).toMatchObject({ promiseDays: 4 });
  });

  it("refuses a leader and writes nothing", async () => {
    viewer = asViewer("leaderA", "adm-a", "leader");
    const forbidden = { error: "settingsCompany.forbidden" };
    expect(await saveCompanyAction({}, form({ slug: "adm-a", name: "Hacked" }))).toEqual(forbidden);
    expect(await saveRulesAction({}, form({ ...RULES, promiseDays: "9" }))).toEqual(forbidden);
    expect(await saveCalendarAction({}, form({ slug: "adm-a", region: "DE-HH", workdays: ["1"] }))).toEqual(forbidden);
    expect((await db.company.findUniqueOrThrow({ where: { slug: "adm-a" } })).name).toBe("Alpha GmbH");
    expect((await seedOf("adm-a"))).toMatchObject({ promiseDays: 4 });
    expect((await loadCalendar(ids.managerA.companyId)).region).toBe("DE-BY");
  });

  it("does not let a manager of B write A's rows", async () => {
    viewer = asViewer("managerB", "adm-b", "manager");
    // The form names A's slug, but the guard answers for the viewer's own company only.
    const r = await saveCompanyAction({}, form({ slug: "adm-a", name: "Takeover" }));
    expect((await db.company.findUniqueOrThrow({ where: { slug: "adm-a" } })).name).toBe("Alpha GmbH");
    expect(r).toEqual({ error: "settingsCompany.forbidden" });
  });
});
