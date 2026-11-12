// OVL-N1 (B2): a leaver who leaves a seat nobody else holds writes org.seat.vacant once, a retry writes nothing, a seat whose role has another active holder
// writes nothing, and leaving again after coming back writes again (plan OVL, D23, D30). Real Postgres, its own company. Flat tests (D32).
import { afterAll, beforeAll, expect, it } from "vitest";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { deactivateUser } from "@/lib/db/directory";
import { addRole, addSeat, addUnit } from "@/lib/db/org-edit";

const db = getDb();
const SLUG = "ovl-seat-vacant";
let companyId = "";
const ids: Record<string, string> = {};
const seat: Record<string, string> = {};
const role: Record<string, string> = {};
const vacant = () => db.caseEvent.findMany({ where: { companyId, type: "org.seat.vacant" }, orderBy: { seq: "asc" } });

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  const writes = templateWrites("empty", () => crypto.randomUUID());
  const person = (name: string) => ({ name, email: name.replace(/\W+/g, "").toLowerCase() + `@${SLUG}.example`, role: "leader", dept: "", ini: "XX", handle: null });
  const c = await db.company.create({
    data: { slug: SLUG, name: SLUG, stage: "sandbox", seedJson: toSeedJson(writes.seedJson) as object, config: { create: {} }, users: { create: ["A. Only", "B. One", "B. Two", "C. Head"].map(person) } },
  });
  companyId = c.id;
  for (const u of await db.user.findMany({ where: { companyId } })) ids[u.name] = u.id;
  const unit = await addUnit(companyId, "ovl-n1", { key: "OPS", name: "OPS", kind: "dept", headcount: 0, parentId: null });
  const make = (title: string, reportsToId: string | null) => addRole(companyId, "ovl-n1", { orgUnitId: unit, title, reportsToId, decides: [], spendLimitEur: null });
  role.head = await make("Head", null);
  role.only = await make("Only", role.head);
  role.pair = await make("Pair", role.head);
  seat.head = await addSeat(companyId, role.head, "C. Head", ids["C. Head"]);
  seat.only = await addSeat(companyId, role.only, "A. Only", ids["A. Only"]);
  seat.one = await addSeat(companyId, role.pair, "B. One", ids["B. One"]);
  seat.two = await addSeat(companyId, role.pair, "B. Two", ids["B. Two"]);
});

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

it("OVL seat vacant writes one org.seat.vacant for the only holder", async () => {
  const left = await deactivateUser(companyId, ids["A. Only"], new Date("2026-05-04T09:00:00Z"));
  expect(left).toMatchObject({ deactivated: 1 });
  const rows = await vacant();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ actor: "system:directory", actorUserId: null, source: "directory", targetId: seat.only, payload: { seatId: seat.only, roleId: role.only, userId: ids["A. Only"] } });
  expect(rows[0].idemKey).toBe(`dir:seat-vacant:${seat.only}:${ids["A. Only"]}:0`);
});

it("OVL seat vacant writes nothing on a retry", async () => {
  const before = await db.caseEvent.count({ where: { companyId } });
  expect(await deactivateUser(companyId, ids["A. Only"])).toMatchObject({ deactivated: 0, handed: 0 });
  expect(await db.caseEvent.count({ where: { companyId } })).toBe(before);
  expect(await vacant()).toHaveLength(1);
});

it("OVL seat vacant writes nothing when another holder is active", async () => {
  // One of two holders of a role leaves: the role is not empty. The other one leaving later empties it, and the event names that seat.
  await deactivateUser(companyId, ids["B. One"]);
  expect(await vacant()).toHaveLength(1);
  await deactivateUser(companyId, ids["B. Two"]);
  const rows = await vacant();
  expect(rows.map((r) => r.targetId)).toEqual([seat.only, seat.two]);
  expect(rows[1].payload).toMatchObject({ roleId: role.pair, userId: ids["B. Two"] });
  // Nobody else left, so no other seat wrote one.
  expect(rows.find((r) => r.targetId === seat.head)).toBeUndefined();
});

it("OVL seat vacant writes again for a later departure from the same seat", async () => {
  // A. Only comes back to the same seat and leaves again: a new departure, the next number in the key.
  await db.user.update({ where: { id: ids["A. Only"], companyId }, data: { active: true, deactivatedAt: null } });
  await db.orgRoleHolder.update({ where: { id: seat.only, companyId }, data: { userId: ids["A. Only"] } });
  expect(await deactivateUser(companyId, ids["A. Only"], new Date("2026-05-11T09:00:00Z"))).toMatchObject({ deactivated: 1 });
  const rows = (await vacant()).filter((r) => r.targetId === seat.only);
  expect(rows.map((r) => r.idemKey)).toEqual([`dir:seat-vacant:${seat.only}:${ids["A. Only"]}:0`, `dir:seat-vacant:${seat.only}:${ids["A. Only"]}:1`]);
  // And the retry of that second departure writes nothing.
  await deactivateUser(companyId, ids["A. Only"]);
  expect((await vacant()).filter((r) => r.targetId === seat.only)).toHaveLength(2);
});
