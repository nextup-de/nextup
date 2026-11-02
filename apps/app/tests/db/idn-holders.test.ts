import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NO_KNOWLEDGE, type Knowledge } from "@/features/knowledge";
import { getDb } from "@/lib/db/client";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { loadHolderOf, loadSeats, loadUsersOfRole } from "@/lib/db/holders";
import { replaceKnowledge } from "@/lib/db/knowledge";

const db = getDb();
const id = () => crypto.randomUUID();
let a: { id: string };
let b: { id: string };
let userA = "";
let userA2 = "";
let userB = "";
const roleA = id();
const roleA2 = id();

const user = (companyId: string, name: string) =>
  db.user.create({ data: { companyId, name, email: name.toLowerCase() + "@idn.example", role: "member" }, select: { id: true } });

type H = { name: string; userId: string | null; second?: boolean };
const knowledge = (holders: H[], roles: [string, string]): Knowledge => {
  const unit = id();
  return {
    ...NO_KNOWLEDGE,
    units: [{ id: unit, key: "U", name: "Unit", kind: "dept", headcount: 3, parentId: null, sort: 0 }],
    roles: roles.map((r, i) => ({ id: r, orgUnitId: unit, title: "Role " + i, reportsToId: null, decides: [], spendLimitEur: null, skills: [], sort: i })),
    holders: holders.map((h, i) => ({ id: id(), roleId: roles[h.second ? 1 : 0], name: h.name, userId: h.userId, sort: i })),
  };
};

beforeAll(async () => {
  await db.company.deleteMany({});
  a = await db.company.create({ data: { slug: "idn-a", name: "A", seedJson: {} } });
  b = await db.company.create({ data: { slug: "idn-b", name: "B", seedJson: {} } });
  userA = (await user(a.id, "Ann")).id;
  userA2 = (await user(a.id, "Ben")).id;
  userB = (await user(b.id, "Bob")).id;
  await replaceKnowledge(a.id, knowledge([
    { name: "Second", userId: userA },
    { name: "First", userId: userA2, second: true },
    { name: "Third", userId: userA },
    { name: "Empty", userId: null },
  ], [roleA, roleA2]));
  await replaceKnowledge(b.id, knowledge([{ name: "Other", userId: userB }], [id(), id()]));
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("IDN holder helpers", () => {
  it("loadSeats gives only the company's holders", async () => {
    const seats = await loadSeats(a.id);
    expect(seats.map((s) => s.label)).toEqual(["Second", "First", "Third", "Empty"]);
    expect(seats.some((s) => s.userId === userB)).toBe(false);
  });

  it("loadHolderOf gives the user's first seat, and null for a user of another company", async () => {
    expect((await loadHolderOf(a.id, userA))?.label).toBe("Second");
    expect(await loadHolderOf(a.id, userB)).toBeNull();
  });

  it("loadUsersOfRole gives the role's distinct users", async () => {
    expect(await loadUsersOfRole(a.id, roleA)).toEqual([userA]);
    expect(await loadUsersOfRole(a.id, roleA2)).toEqual([userA2]);
  });

  it("loadLog returns each event's actorUserId", async () => {
    const r = await appendEventRow(a.id, { id: "idn-e1", day: 0, type: "case.read", actor: "Ann", targetId: "c1", payload: {} }, { actorUserId: userA });
    expect(r.ok).toBe(true);
    await appendEventRow(a.id, { id: "idn-e2", day: 0, type: "case.read", actor: "system:n8n", targetId: "c1", payload: {} });
    const log = await loadLog(a.id);
    expect(log.events.map((e) => e.actorUserId)).toEqual([userA, null]);
  });
});
