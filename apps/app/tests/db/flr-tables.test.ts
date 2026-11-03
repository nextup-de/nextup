import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { SETTINGS_SECTIONS } from "@/features/settings/sections";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";
import { getDb } from "@/lib/db/client";
import {
  createDevice, deviceByToken, devicePairByCode, findArea, floorUserByCode, hashFloor, listAreas, pairDevice,
  referenceByHash, removeArea, removeDevice, saveArea, saveReference, setFloorCode, setPairCode,
} from "@/lib/db/floor";
import { RULES } from "@/server/throttle";

const db = getDb();
type Co = { id: string; unitId: string; roleId: string; userId: string };
const co: Record<"a" | "b", Co> = { a: null as never, b: null as never };

async function makeCompany(slug: string): Promise<Co> {
  const c = await db.company.create({ data: { slug, name: slug, seedJson: toSeedJson(SEED) as object } });
  const u = await db.orgUnit.create({ data: { companyId: c.id, key: "OPS", name: "Operations " + slug, kind: "dept", sort: 0 } });
  const r = await db.orgRole.create({ data: { companyId: c.id, orgUnitId: u.id, title: "Lead " + slug, decides: [], sort: 0 } });
  const user = await db.user.create({ data: { companyId: c.id, name: "holder", email: `holder@${slug}.example`, role: "leader" }, select: { id: true } });
  await db.orgRoleHolder.create({ data: { companyId: c.id, roleId: r.id, name: "holder", userId: user.id, sort: 0 } });
  return { id: c.id, unitId: u.id, roleId: r.id, userId: user.id };
}

const area = (c: Co, key: string) => ({ key, name: "Line " + key, unitId: c.unitId, roleId: c.roleId });

beforeAll(async () => {
  await db.company.deleteMany({});
  co.a = await makeCompany("flr-a");
  co.b = await makeCompany("flr-b");
});
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("FLR floor tables", () => {
  it("refuses an area key used twice in one company and allows it in two", async () => {
    await saveArea(co.a.id, area(co.a, "line-3"), null);
    await expect(saveArea(co.a.id, area(co.a, "line-3"), null)).rejects.toThrow();
    await saveArea(co.b.id, area(co.b, "line-3"), null);
    expect((await listAreas(co.a.id)).length).toBe(1);
  });

  it("updates an area by id and finds it with unit name and role title", async () => {
    const a = await findArea(co.a.id, "line-3");
    expect(a?.unit.name).toBe("Operations flr-a");
    expect(a?.role.title).toBe("Lead flr-a");
    const saved = await saveArea(co.a.id, { ...area(co.a, "line-3"), id: a!.id, name: "Renamed", on: false }, "kevin");
    expect(saved.name).toBe("Renamed");
    expect(saved.on).toBe(false);
    expect(saved.updatedBy).toBe("kevin");
  });

  it("findArea and removeArea see only their own company", async () => {
    const own = await findArea(co.b.id, "line-3");
    expect(own?.companyId).toBe(co.b.id);
    await removeArea(co.a.id, own!.id);
    expect(await findArea(co.b.id, "line-3")).not.toBeNull();
    expect(await findArea(co.a.id, "nope")).toBeNull();
  });

  it("refuses an area whose unit or role belongs to another company", async () => {
    await expect(saveArea(co.a.id, area(co.b, "x-1"), null)).rejects.toThrow();
  });

  it("finds a device by token and by pair code in its own company only, and not after the code expires", async () => {
    const now = new Date("2026-11-22T10:00:00Z");
    const dev = await createDevice(co.a.id, { label: "Tablet", areaIds: [] }, null);
    const code = hashFloor(co.a.id, "PAIR1");
    await setPairCode(co.a.id, dev.id, code, new Date(now.getTime() + 60_000));
    expect((await devicePairByCode(co.a.id, code, now))?.id).toBe(dev.id);
    expect(await devicePairByCode(co.b.id, code, now)).toBeNull();
    expect(await devicePairByCode(co.a.id, code, new Date(now.getTime() + 61_000))).toBeNull();

    const token = hashFloor(co.a.id, "TOKEN1");
    await pairDevice(co.a.id, dev.id, token, now);
    expect(await devicePairByCode(co.a.id, code, now)).toBeNull();
    expect((await deviceByToken(co.a.id, token))?.id).toBe(dev.id);
    expect(await deviceByToken(co.b.id, token)).toBeNull();
    await removeDevice(co.b.id, dev.id);
    expect(await deviceByToken(co.a.id, token)).not.toBeNull();
    await removeDevice(co.a.id, dev.id);
    expect(await deviceByToken(co.a.id, token)).toBeNull();
  });

  it("finds an active person by floor code in their own company only", async () => {
    const hash = hashFloor(co.a.id, "4711");
    await setFloorCode(co.a.id, co.a.userId, hash, null);
    expect((await floorUserByCode(co.a.id, hash))?.id).toBe(co.a.userId);
    expect(await floorUserByCode(co.b.id, hash)).toBeNull();
    await db.user.update({ where: { id: co.a.userId, companyId: co.a.id }, data: { active: false } });
    expect(await floorUserByCode(co.a.id, hash)).toBeNull();
  });

  it("finds a reference in its own company only and reports a clash", async () => {
    const hash = hashFloor(co.a.id, "K7M2");
    expect(await saveReference(co.a.id, { hash, caseId: "c1", areaId: null })).toBe(true);
    expect(await saveReference(co.a.id, { hash, caseId: "c2", areaId: null })).toBe(false);
    expect((await referenceByHash(co.a.id, hash))?.caseId).toBe("c1");
    expect(await referenceByHash(co.b.id, hash)).toBeNull();
  });

  it("removes the floor rows with the company", async () => {
    const c = await makeCompany("flr-gone");
    await saveArea(c.id, area(c, "gone-1"), null);
    await createDevice(c.id, { label: "T", areaIds: [] }, null);
    await setFloorCode(c.id, c.userId, hashFloor(c.id, "1"), null);
    await saveReference(c.id, { hash: hashFloor(c.id, "r"), caseId: "c", areaId: null });
    await db.company.delete({ where: { id: c.id } });
    const raw = await db.$queryRaw<{ n: bigint }[]>`SELECT (
      (SELECT count(*) FROM "FloorArea" WHERE "companyId" = ${c.id}) + (SELECT count(*) FROM "FloorDevice" WHERE "companyId" = ${c.id}) +
      (SELECT count(*) FROM "FloorCode" WHERE "companyId" = ${c.id}) + (SELECT count(*) FROM "FloorReference" WHERE "companyId" = ${c.id})) AS n`;
    expect(Number(raw[0].n)).toBe(0);
  });

  it("lists areas right after the API tokens section, labelled in both catalogs", () => {
    const keys = SETTINGS_SECTIONS.map((s) => s.key);
    expect(keys[keys.indexOf("apiTokens") + 2]).toBe("areas");
    expect(en.settingsAreas.navLabel).toBe("Areas");
    expect(de.settingsAreas.navLabel).toBe("Bereiche");
  });

  it("has the five floor rate rules", () => {
    expect(RULES.floorRaise).toEqual({ limit: 5, windowMs: 10 * 60_000 });
    expect(RULES.floorRaiseAll).toEqual({ limit: 60, windowMs: 60 * 60_000 });
    expect(RULES.floorCode).toEqual({ limit: 5, windowMs: 15 * 60_000 });
    expect(RULES.floorStatus).toEqual({ limit: 20, windowMs: 10 * 60_000 });
    expect(RULES.floorPair).toEqual({ limit: 5, windowMs: 15 * 60_000 });
  });
});
