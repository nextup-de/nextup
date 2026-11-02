// STR-A1: holders of a role, and the company seed read from the tables only (D5).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { DEMO_GOALS, DEMO_RULES } from "@/features/demo/structure";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { holdersOfRole, NO_KNOWLEDGE, rowsFromSeed, type Knowledge } from "@/features/knowledge";
import { getDb } from "@/lib/db/client";
import { loadSeed } from "@/lib/db/companies";
import { loadHoldersOfRole, loadKnowledge, replaceKnowledge } from "@/lib/db/knowledge";
import { saveCompanyRules } from "@/lib/db/rules";

const db = getDb();
// IDN-G1: loaded routes also carry the owner/deputy role and seat ids; the fixture has none.
const ID_KEYS = ["ownerRoleId", "ownerSeatId", "deputyRoleId", "deputySeatId"];
const withoutIds = (routes: readonly object[] | undefined) =>
  routes?.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !ID_KEYS.includes(k))));
const id = () => crypto.randomUUID();
let a: { id: string };
let b: { id: string };
let c: { id: string };
let roleA = "";
let roleB = "";

const tiny = (holders: string[]): Knowledge => {
  const unit = id(), role = id();
  return {
    ...NO_KNOWLEDGE,
    units: [{ id: unit, key: "U", name: "Unit", kind: "dept", headcount: 2, parentId: null, sort: 0 }],
    roles: [{ id: role, orgUnitId: unit, title: "Line 3", reportsToId: null, decides: [], spendLimitEur: null, skills: [], sort: 0 }],
    holders: holders.map((name, i) => ({ id: id(), roleId: role, name, userId: null, sort: i })),
  };
};

beforeAll(async () => {
  await db.company.deleteMany({});
  const blob = toSeedJson(SEED) as object;
  a = await db.company.create({ data: { slug: "str-a", name: "A", seedJson: blob } });
  b = await db.company.create({ data: { slug: "str-b", name: "B", seedJson: blob } });
  c = await db.company.create({ data: { slug: "str-c", name: "C", seedJson: blob } });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("STR holdersOfRole", () => {
  it("gives both holders in sort order, and nothing for another company's role", async () => {
    const ka = tiny(["Second", "First"]);
    ka.holders[0].sort = 1; ka.holders[1].sort = 0;
    await replaceKnowledge(a.id, ka);
    const kb = tiny(["Other"]);
    await replaceKnowledge(b.id, kb);
    roleA = ka.roles[0].id; roleB = kb.roles[0].id;

    const loaded = await loadKnowledge(a.id);
    expect(holdersOfRole(loaded, roleA).map((h) => h.name)).toEqual(["First", "Second"]);
    expect((await loadHoldersOfRole(a.id, roleA)).map((h) => h.name)).toEqual(["First", "Second"]);
    expect(holdersOfRole(loaded, "nope")).toEqual([]);
    expect(await loadHoldersOfRole(a.id, roleB)).toEqual([]);
  });
});

describe("STR company seed from the tables", () => {
  it("gives a company without rows no structure, even with acme's in its seedJson", async () => {
    const s = await loadSeed("str-c");
    expect([s?.routes, s?.people, s?.depts, s?.goals]).toEqual([[], [], [], []]);
    expect(s?.spend).toBeNull();
  });

  it("serves acme's structure, goals and spend once written, and still reduces", async () => {
    await replaceKnowledge(c.id, rowsFromSeed(SEED, DEMO_GOALS, id));
    await saveCompanyRules(c.id, DEMO_RULES);
    const s = await loadSeed("str-c");
    expect(withoutIds(s?.routes)).toEqual(SEED.routes);
    expect(s?.goals).toEqual(DEMO_GOALS);
    expect(s?.spend).toEqual(DEMO_RULES.spend);
    expect(reduce(s!, emptyLog()).cases.map((x) => x.id)).toEqual(reduce(SEED, emptyLog()).cases.map((x) => x.id));
  });

  it("gives a company with its own goal row exactly that goal", async () => {
    const k = tiny(["X"]);
    k.goals = [{ id: id(), orgUnitId: null, parentId: null, title: "Fewer forklift waits", kpi: "", target: "", period: "", keywords: ["forklift"], sort: 0 }];
    await replaceKnowledge(a.id, k);
    expect((await loadSeed("str-a"))?.goals).toEqual([{ goal: "Fewer forklift waits", keys: ["forklift"] }]);
  });

  it("follows a saved promise_days rule", async () => {
    await saveCompanyRules(a.id, { ...DEMO_RULES, promiseDays: 9 });
    expect((await loadSeed("str-a"))?.promiseDays).toBe(9);
  });
});
