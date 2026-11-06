import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { meFor } from "@/features/auth/identity";
import { onDeskOf } from "@/features/cases/selectors";
import { reduce } from "@/features/cases/reducer";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { FLOOR_SENT_COOKIE, FLOOR_USER_COOKIE, signFloorCookie, verifyFloorCookie } from "@/features/floor/cookies";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { loadLog } from "@/lib/db/events";
import { hashFloor, referenceByHash, saveArea } from "@/lib/db/floor";

// A cookie jar the tests can read back; next/headers has no request here.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (arg: string | { name: string }) => void jar.delete(typeof arg === "string" ? arg : arg.name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { floorRaiseAction } from "@/server/actions/floor";
import { raiseFromFloor } from "@/server/floor/raise";

const db = getDb();
const SECRET = "flr-raise-test-secret";
const device = { key: "a:flr-device-1", deviceId: null };
let n = 0;
const nonce = () => `nonce${String(++n).padStart(8, "0")}`;
const input = (area: string, over: Partial<{ title: string; kind: string; nonce: string }> = {}) => ({
  area, kind: "problem", title: "Oil on the floor", body: "Near the press", nonce: nonce(), ...over,
});

let companyId = "";
let unitId = "";
let roleId = "";
let userId = "";
let vacantRoleId = "";

const events = () => db.caseEvent.findMany({ where: { companyId, type: "case.raised" }, orderBy: { seq: "asc" } });

beforeAll(async () => {
  process.env.AUTH_SECRET = SECRET;
  await db.company.deleteMany({});
  const c = await db.company.create({ data: { openedAt: new Date(), slug: "flr-raise", name: "Raise Co", seedJson: toSeedJson(SEED) as object } });
  companyId = c.id;
  const unit = await db.orgUnit.create({ data: { companyId, key: "OPS", name: "Montage", kind: "dept", sort: 0 } });
  unitId = unit.id;
  const role = await db.orgRole.create({ data: { companyId, orgUnitId: unitId, title: "Shift lead", decides: [], sort: 0 } });
  roleId = role.id;
  const vacant = await db.orgRole.create({ data: { companyId, orgUnitId: unitId, title: "Empty role", decides: [], sort: 1 } });
  vacantRoleId = vacant.id;
  const gone = await db.user.create({ data: { companyId, name: "Gone", email: "gone@flr.example", role: "leader", active: false }, select: { id: true } });
  const lead = await db.user.create({ data: { companyId, name: "Lena Lead", email: "lena@flr.example", role: "leader" }, select: { id: true } });
  userId = lead.id;
  // The first seat's user is deactivated: the case must land on the second seat.
  await db.orgRoleHolder.create({ data: { companyId, roleId, name: "Seat gone", userId: gone.id, sort: 0 } });
  await db.orgRoleHolder.create({ data: { companyId, roleId, name: "Seat lena", userId: lead.id, sort: 1 } });
  const area = (key: string, extra: { anonymous?: boolean; on?: boolean; roleId?: string } = {}) =>
    saveArea(companyId, { key, name: "Line " + key, unitId, roleId: extra.roleId ?? roleId, anonymous: extra.anonymous, on: extra.on }, null);
  await area("open", { anonymous: true });
  await area("closed", { anonymous: false });
  await area("paused", { anonymous: true, on: false });
  await area("empty", { anonymous: true, roleId: vacantRoleId });
  await area("busy", { anonymous: true });
});
beforeEach(() => jar.clear());
afterAll(async () => {
  await db.company.deleteMany({});
  await db.rateCounter.deleteMany({});
  await db.$disconnect();
});

describe("FLR raise from an area", () => {
  it("an anonymous raise appends one case.raised by system:floor on a seat of the role, with a reference", async () => {
    const res = await raiseFromFloor("flr-raise", input("open"), "anonymous", device);
    expect(res).toMatchObject({ ok: true, duplicate: false, roleTitle: "Shift lead" });
    if (!res.ok || !res.reference) throw new Error("no reference");
    expect(res.reference).toMatch(/^\d{8}$/);

    const rows = await events();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor: "system:floor", actorUserId: null, source: "floor" });
    // The area's unit has one active person: next to an unnamed raiser its name is not stored (features/cases/stamp.ts).
    expect(rows[0].payload).toMatchObject({
      title: "Oil on the floor", body: "Near the press", kind: "problem", routeId: null, assignee: "Seat lena", fromDept: "", visibility: "everyone",
    });
    const seat = await db.orgRoleHolder.findFirstOrThrow({ where: { companyId, name: "Seat lena" } });
    expect((rows[0].payload as { assigneeRoleHolderId: string }).assigneeRoleHolderId).toBe(seat.id);

    const ref = await referenceByHash(companyId, hashFloor(companyId, res.reference));
    expect(ref).toMatchObject({ caseId: rows[0].targetId });

    // The case reduces onto the chosen seat.
    const seed = await companySeed(await db.company.findUniqueOrThrow({ where: { id: companyId } }));
    const c = reduce(seed, await loadLog(companyId)).cases.find((x) => x.id === rows[0].targetId);
    expect(c).toBeTruthy();
    expect(onDeskOf(c!, meFor(userId, seed.seats))).toBe(true);
  });

  it("a double tap with the same nonce writes one case", async () => {
    const before = (await events()).length;
    const same = input("open", { nonce: "doubletap0001" });
    const first = await raiseFromFloor("flr-raise", same, "anonymous", device);
    const second = await raiseFromFloor("flr-raise", same, "anonymous", device);
    expect(first).toMatchObject({ ok: true, duplicate: false });
    expect(second).toMatchObject({ ok: true, duplicate: true, reference: null });
    expect((await events()).length).toBe(before + 1);
  });

  it("an area without anonymous raise refuses it and writes nothing", async () => {
    const before = (await events()).length;
    expect(await raiseFromFloor("flr-raise", input("closed"), "anonymous", device)).toEqual({ ok: false, reason: "anonymousOff" });
    expect((await events()).length).toBe(before);
  });

  it("a signed-in floor user raises as themselves and is signed out after the send", async () => {
    const before = (await events()).length;
    const exp = Math.floor(Date.now() / 1000) + 120;
    jar.set(FLOOR_USER_COOKIE, signFloorCookie({ cid: companyId, uid: userId, exp }, SECRET));

    await expect(floorRaiseAction("flr-raise", input("closed"))).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });

    const rows = await events();
    expect(rows).toHaveLength(before + 1);
    expect(rows[rows.length - 1]).toMatchObject({ actor: "Lena Lead", actorUserId: userId, source: "floor" });
    expect(rows[rows.length - 1].payload).toMatchObject({ fromDept: "Montage" }); // by name: the unit stays, however small
    expect(jar.has(FLOOR_USER_COOKIE)).toBe(false);
    const sent = verifyFloorCookie(jar.get(FLOOR_SENT_COOKIE), SECRET);
    expect(sent).toMatchObject({ named: true, role: "Shift lead" });
    expect(sent?.ref).toMatch(/^\d{8}$/);
  });

  it("a vacant role or a switched-off area writes nothing", async () => {
    const before = (await events()).length;
    expect(await raiseFromFloor("flr-raise", input("empty"), "anonymous", device)).toEqual({ ok: false, reason: "vacant" });
    expect(await raiseFromFloor("flr-raise", input("paused"), "anonymous", device)).toEqual({ ok: false, reason: "paused" });
    expect(await raiseFromFloor("flr-raise", input("nowhere"), "anonymous", device)).toEqual({ ok: false, reason: "unknown" });
    expect((await events()).length).toBe(before);
  });

  it("the sixth raise from one device in an area within 10 minutes is refused", async () => {
    const busy = { key: "a:flr-device-busy", deviceId: null };
    const before = (await events()).length;
    for (let i = 0; i < 5; i++) expect(await raiseFromFloor("flr-raise", input("busy"), "anonymous", busy)).toMatchObject({ ok: true });
    const sixth = await raiseFromFloor("flr-raise", input("busy"), "anonymous", busy);
    expect(sixth).toMatchObject({ ok: false, reason: "limited" });
    expect((await events()).length).toBe(before + 5);
    // Another device in the same area is not held up by it.
    expect(await raiseFromFloor("flr-raise", input("busy"), "anonymous", { key: "a:flr-device-other", deviceId: null })).toMatchObject({ ok: true });
  });

  it("an unnamed raise names the area's unit once the unit has five active people, and a handle counts as unnamed", async () => {
    const fresh = (key: string) => ({ key: "a:flr-device-" + key, deviceId: null });
    const last = async () => (await events()).at(-1)!;
    const member = await db.user.create({ data: { companyId, name: "Mia Member", email: "mia@flr.example", role: "member", dept: "OPS", handle: "Anonymous #7001" }, select: { id: true } });
    for (const n of [1, 2]) await db.user.create({ data: { companyId, name: `Worker ${n}`, email: `w${n}@flr.example`, role: "member", dept: "Montage" } });
    // Four active people now (the lead on the seat and three by department).
    expect(await raiseFromFloor("flr-raise", input("open"), { userId: member.id }, fresh("four"))).toMatchObject({ ok: true });
    expect(await last()).toMatchObject({ actor: "Anonymous #7001", actorUserId: member.id, payload: { fromDept: "" } });

    await db.user.create({ data: { companyId, name: "Worker 3", email: "w3@flr.example", role: "member", dept: "OPS" } });
    expect(await raiseFromFloor("flr-raise", input("open"), "anonymous", fresh("five"))).toMatchObject({ ok: true });
    expect(await last()).toMatchObject({ actor: "system:floor", payload: { fromDept: "Montage" } });
    expect(await raiseFromFloor("flr-raise", input("open"), { userId: member.id }, fresh("five-b"))).toMatchObject({ ok: true });
    expect(await last()).toMatchObject({ actor: "Anonymous #7001", payload: { fromDept: "Montage" } });
  });
});
