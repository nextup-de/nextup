import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NO_KNOWLEDGE, type Knowledge } from "@/features/knowledge";
import { getDb } from "@/lib/db/client";
import { replaceKnowledge } from "@/lib/db/knowledge";
import { personCandidates, personLinksFor, personPage } from "@/lib/db/people";

const db = getDb();
const id = () => crypto.randomUUID();
let a: { id: string };
let b: { id: string };
const ids: Record<string, string> = {};

const user = (companyId: string, name: string, extra: { handle?: string; active?: boolean } = {}) =>
  db.user.create({ data: { companyId, name, email: id() + "@met.example", role: "leader", ...extra }, select: { id: true } });

const knowledge = (seats: { userId: string; name: string }[]): Knowledge => {
  const parent = id();
  const child = id();
  const role = id();
  return {
    ...NO_KNOWLEDGE,
    units: [
      { id: parent, key: "PRD", name: "Production", kind: "dept", headcount: 3, parentId: null, sort: 0 },
      { id: child, key: "L3", name: "Line 3", kind: "team", headcount: 3, parentId: parent, sort: 1 },
    ],
    roles: [{ id: role, orgUnitId: child, title: "Team leader", reportsToId: null, decides: ["shift plan"], spendLimitEur: null, skills: [], sort: 0 }],
    holders: seats.map((s, i) => ({ id: id(), roleId: role, name: s.name, userId: s.userId, sort: i })),
  };
};

beforeAll(async () => {
  await db.company.deleteMany({});
  a = await db.company.create({ data: { slug: "met-a", name: "A", seedJson: {} } });
  b = await db.company.create({ data: { slug: "met-b", name: "B", seedJson: {} } });
  ids.leader = (await user(a.id, "Lena Leader")).id;
  ids.twin1 = (await user(a.id, "Sam Twin")).id;
  ids.twin2 = (await user(a.id, "Sam Twin")).id;
  ids.anon = (await user(a.id, "Anna Anon", { handle: "Anonymous #1" })).id;
  ids.gone = (await user(a.id, "Gina Gone", { active: false })).id;
  ids.other = (await user(b.id, "Otto Other")).id;
  await replaceKnowledge(a.id, knowledge([
    { userId: ids.leader, name: "Lena Leader" }, { userId: ids.twin1, name: "Sam Twin (seat 1)" }, { userId: ids.twin2, name: "Sam Twin (seat 2)" },
    { userId: ids.anon, name: "Anna Anon" }, { userId: ids.gone, name: "Gina Gone" },
  ]));
  await replaceKnowledge(b.id, knowledge([{ userId: ids.other, name: "Otto Other" }]));
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("MET person page", () => {
  it("gives an active leader only the display name, role and unit path", async () => {
    const page = await personPage(a.id, ids.leader);
    expect(page).toEqual({ name: "Lena Leader", role: "Team leader", unitPath: ["Production", "Line 3"] });
    expect(Object.keys(page!).sort()).toEqual(["name", "role", "unitPath"]);
    expect(JSON.stringify(page)).not.toMatch(/@|shift plan|Sam Twin/);
  });

  it("gives null for a member with a handle, a deactivated user and a user of another company", async () => {
    expect(await personPage(a.id, ids.anon)).toBeNull();
    expect(await personPage(a.id, ids.gone)).toBeNull();
    expect(await personPage(a.id, ids.other)).toBeNull();
    expect(await personPage(b.id, ids.leader)).toBeNull();
    expect(await personPage(a.id, "Lena Leader")).toBeNull();
  });

  it("personCandidates only sees ids of this company", async () => {
    expect((await personCandidates(a.id, ids.leader)).map((c) => c.id)).toEqual([ids.leader]);
    expect(await personCandidates(a.id, ids.other)).toEqual([]);
    expect(await personCandidates(a.id, "Lena Leader")).toEqual([]);
  });

  it("personLinksFor holds the leader, not the handle member, and both users sharing a name", async () => {
    const links = await personLinksFor(a.id);
    expect(links[ids.leader]).toBe("Lena Leader");
    expect(ids.anon in links).toBe(false);
    expect(ids.gone in links).toBe(false);
    expect(ids.other in links).toBe(false);
    expect(links[ids.twin1]).toBe("Sam Twin");
    expect(links[ids.twin2]).toBe("Sam Twin");
    expect(Object.keys(links)).toHaveLength(3);
  });
});
