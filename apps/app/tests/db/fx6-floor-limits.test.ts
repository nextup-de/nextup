// FX6, PILOT_CHECK G10: an anonymous browser gets a new cookie for the asking, so a limit on the cookie alone stops
// nobody. Whether a forged header gets past the real proxy is K5, on the running stack: not something this test shows.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { saveArea } from "@/lib/db/floor";

let address = "198.51.100.1";
// No cookie is ever kept: every request looks like a browser nobody has seen.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ "x-forwarded-for": address }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { floorSignInAction } from "@/server/actions/floor";
import { floorStatusAction } from "@/server/actions/floor-status";
import { floorDeviceOf, raiseFromFloor } from "@/server/floor/raise";
import { RULES } from "@/server/throttle";

const db = getDb();
const SLUG = "fx6-co";
let companyId = "";
let n = 0;
const nonce = () => `fx6nonce${String(++n).padStart(8, "0")}`;

/** Asks `times` times; how many answers were "limited". */
async function limitedOf(times: number, ask: () => Promise<{ ok: boolean; reason?: string }>): Promise<number> {
  let limited = 0;
  for (let i = 0; i < times; i++) {
    const r = await ask();
    if (!r.ok && r.reason === "limited") limited++;
  }
  return limited;
}

beforeAll(async () => {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-0123456789";
  await db.company.deleteMany({});
  const c = await db.company.create({ data: { slug: SLUG, name: SLUG, seedJson: toSeedJson(SEED) as object } });
  companyId = c.id;
  const unit = await db.orgUnit.create({ data: { companyId, key: "OPS", name: "Montage", kind: "dept", sort: 0 } });
  const role = await db.orgRole.create({ data: { companyId, orgUnitId: unit.id, title: "Shift lead", decides: [], sort: 0 } });
  const user = await db.user.create({ data: { companyId, name: "Lena Lead", email: "lena@fx6.example", role: "leader" }, select: { id: true } });
  await db.orgRoleHolder.create({ data: { companyId, roleId: role.id, name: "Seat lena", userId: user.id, sort: 0 } });
  await saveArea(companyId, { key: "l3", name: "Line 3", unitId: unit.id, roleId: role.id, anonymous: true }, null);
  await saveArea(companyId, { key: "l4", name: "Line 4", unitId: unit.id, roleId: role.id, anonymous: true }, null);
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("FX6 floor codes", () => {
  it("100 guesses without a cookie end in a lock", async () => {
    address = "198.51.100.10";
    const limited = await limitedOf(100, () => floorSignInAction(SLUG, "000000"));
    expect(limited).toBe(100 - RULES.floorCodeAddress.limit);
  });

  it("someone at another address is not locked out by that", async () => {
    address = "198.51.100.11";
    expect(await floorSignInAction(SLUG, "000000")).toEqual({ ok: false, reason: "wrong" });
  });

  it("leaves room for a shift behind one address", () => {
    expect(RULES.floorCodeAddress.limit).toBeGreaterThanOrEqual(5 * RULES.floorCode.limit);
  });
});

describe("FX6 status lookups", () => {
  it("guessing references without a cookie ends in a lock", async () => {
    address = "198.51.100.20";
    const times = RULES.floorStatusAddress.limit + 5;
    expect(await limitedOf(times, () => floorStatusAction(SLUG, "FX6-0000"))).toBe(5);
  });
});

describe("FX6 reports", () => {
  const report = async (area: string) => {
    const device = await floorDeviceOf(SLUG, companyId, true);
    return raiseFromFloor(SLUG, { area, kind: "problem", title: "Coolant leak", body: "", nonce: nonce() }, "anonymous", device);
  };

  it("one address cannot use up an area's reports", async () => {
    address = "198.51.100.30";
    const times = RULES.floorRaiseAddress.limit + 3;
    expect(await limitedOf(times, () => report("l3"))).toBe(3);
    expect(RULES.floorRaiseAddress.limit).toBeLessThan(RULES.floorRaiseAll.limit);
  });

  it("another address and another area still report", async () => {
    address = "198.51.100.31";
    expect((await report("l3")).ok).toBe(true);
    address = "198.51.100.30";
    expect((await report("l4")).ok).toBe(true);
  });
});

describe("FX6 a paired device", () => {
  it("is not held to the address limit: its token cannot be made up", async () => {
    address = "198.51.100.40";
    const paired = { key: "d:fx6-paired", deviceId: null };
    const area = "l4";
    for (let i = 0; i < RULES.floorRaise.limit; i++) {
      const r = await raiseFromFloor(SLUG, { area, kind: "problem", title: "Coolant leak", body: "", nonce: nonce() }, "anonymous", paired);
      expect(r.ok).toBe(true);
    }
    const hits = await db.rateCounter.count({ where: { key: { contains: address } } });
    expect(hits).toBe(0);
  });
});
