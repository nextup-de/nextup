import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";
import { saveArea } from "@/lib/db/floor";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { raiseFromFloor } from "@/server/floor/raise";
import { floorReply, floorStatus } from "@/server/floor/status";

const db = getDb();
let n = 0;
const nonce = () => `statusnonce${String(++n).padStart(6, "0")}`;
let deviceN = 0;
const devKey = () => `a:flr-status-device-${++deviceN}`;

async function company(slug: string) {
  const c = await db.company.create({ data: { openedAt: new Date(), slug, name: slug, seedJson: toSeedJson(SEED) as object } });
  const unit = await db.orgUnit.create({ data: { companyId: c.id, key: "OPS", name: "Montage", kind: "dept", sort: 0 } });
  const role = await db.orgRole.create({ data: { companyId: c.id, orgUnitId: unit.id, title: "Shift lead", decides: [], sort: 0 } });
  const user = await db.user.create({ data: { companyId: c.id, name: "Lena Lead", email: `lena@${slug}.example`, role: "leader" }, select: { id: true } });
  await db.orgRoleHolder.create({ data: { companyId: c.id, roleId: role.id, name: "Seat lena", userId: user.id, sort: 0 } });
  await saveArea(c.id, { key: "l3", name: "Line 3", unitId: unit.id, roleId: role.id, anonymous: true }, null);
  return c.id;
}

async function raise(slug: string): Promise<string> {
  const res = await raiseFromFloor(slug, { area: "l3", kind: "problem", title: "Coolant leak", body: "", nonce: nonce() }, "anonymous", { key: devKey(), deviceId: null });
  if (!res.ok || !res.reference) throw new Error("raise failed");
  return res.reference;
}

const desk = (companyId: string, caseId: string, type: "case.asked" | "case.decided", payload: Record<string, unknown>) =>
  appendEventRow(companyId, { id: `e_${type}_${++n}`, day: 0, type, actor: "Lena Lead", targetId: caseId, payload }, { actorUserId: null });

const caseOf = async (companyId: string) => (await db.caseEvent.findFirstOrThrow({ where: { companyId, type: "case.raised" } })).targetId as string;

let aId = "";

beforeAll(async () => {
  await db.company.deleteMany({});
  aId = await company("flr-status-a");
  await company("flr-status-b");
});
afterAll(async () => {
  await db.company.deleteMany({});
  await db.rateCounter.deleteMany({});
  await db.$disconnect();
});

describe("FLR status by reference", () => {
  it("shows the case, then its answer after the desk decides", async () => {
    const reference = await raise("flr-status-a");
    const before = await floorStatus("flr-status-a", reference, devKey());
    expect(before).toMatchObject({ ok: true, view: { title: "Coolant leak", area: "Line 3", step: "sent", roleTitle: "Shift lead", decision: null } });

    const caseId = await caseOf(aId);
    await desk(aId, caseId, "case.decided", { answer: "yes", reason: "Seal is changed on Monday" });
    const after = await floorStatus("flr-status-a", reference, devKey());
    expect(after).toMatchObject({ ok: true, view: { step: "decided", decision: { answer: "yes", reason: null } } }); // NOR D25: the floor shows the answer, never the desk's text
    expect(JSON.stringify(after)).not.toContain("Lena");
  });

  it("an unknown reference and another company's reference show nothing", async () => {
    const reference = await raise("flr-status-b");
    expect(await floorStatus("flr-status-a", "12345678", devKey())).toEqual({ ok: false, reason: "unknown" });
    expect(await floorStatus("flr-status-a", "not-a-number", devKey())).toEqual({ ok: false, reason: "unknown" });
    expect(await floorStatus("flr-status-a", reference, devKey())).toEqual({ ok: false, reason: "unknown" });
    expect(await floorStatus("flr-status-b", reference, devKey())).toMatchObject({ ok: true });
  });

  it("a reply to an open question appends one case.answered by system:floor, a second writes nothing", async () => {
    const reference = await raise("flr-status-a");
    const row = await db.floorReference.findFirstOrThrow({ where: { companyId: aId }, orderBy: { createdAt: "desc" } });
    await desk(aId, row.caseId, "case.asked", { text: "Which shift saw it?" });
    const key = devKey();

    const open = await floorStatus("flr-status-a", reference, key);
    expect(open).toMatchObject({ ok: true, view: { step: "asked", question: { text: "Which shift saw it?" } } });

    expect(await floorReply("flr-status-a", reference, "Nights", key)).toEqual({ ok: true, duplicate: false });
    const answers = () => db.caseEvent.findMany({ where: { companyId: aId, type: "case.answered", targetId: row.caseId } });
    const rows = await answers();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor: "system:floor", actorUserId: null, source: "floor" });
    expect(rows[0].payload).toMatchObject({ text: "Nights" });

    const second = await floorReply("flr-status-a", reference, "Nights again", key);
    expect(second.ok).toBe(false);
    expect(await answers()).toHaveLength(1);
    expect(await floorReply("flr-status-a", reference, "   ", key)).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses the 21st lookup from one device within 10 minutes", async () => {
    const key = devKey();
    for (let i = 0; i < 20; i++) expect((await floorStatus("flr-status-a", "12345678", key)).ok).toBe(false);
    const last = await floorStatus("flr-status-a", "12345678", key);
    expect(last).toMatchObject({ ok: false, reason: "limited" });
    expect(await floorStatus("flr-status-a", "12345678", devKey())).toEqual({ ok: false, reason: "unknown" });
  });
});
