import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";

let viewer: Viewer | null = null;
const jar = new Map<string, { value: string; options: Record<string, unknown> }>();
let forwardedFor = "10.0.0.1";
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => void jar.set(name, { value, options }),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": forwardedFor }),
}));

import { FLOOR_DEVICE_COOKIE, readSignedValue, hashDeviceToken } from "@/features/floor/codes";
import { getDb } from "@/lib/db/client";
import { hashFloor } from "@/lib/db/floor";
import { pairDeviceAction } from "@/server/actions/floor-pair";
import { createDeviceAction, issueFloorCodeAction, newPairCodeAction, removeDeviceAction } from "@/server/actions/settings/floor-devices";

const db = getDb();
const SLUG = "flr-dev-a";
const OTHER = "flr-dev-b";
const SECRET = "test-secret-for-floor-devices-0123456789abcdef";
type Co = { id: string; slug: string; admin: string; member: string };
const co: Record<"a" | "b", Co> = { a: null as never, b: null as never };

const as = (c: Co, userId: string, role: Viewer["role"]): Viewer => ({
  userId, companyId: c.id, companySlug: c.slug, name: "Shown Name", handle: null, role, epoch: 0, issuedAt: 0,
});

async function makeCompany(slug: string): Promise<Co> {
  const c = await db.company.create({ data: { slug, name: `Co ${slug}`, seedJson: toSeedJson(SEED) as object } });
  const mk = (name: string, role: string) =>
    db.user.create({ data: { companyId: c.id, name, email: `${name.toLowerCase().replace(/\W/g, "")}@${slug}.example`, role }, select: { id: true } });
  const admin = await mk("Wilhelmina Adminton", "manager");
  const member = await mk("Cornelius Floorman", "member");
  return { id: c.id, slug, admin: admin.id, member: member.id };
}

const audits = (companyId: string) => db.auditEvent.findMany({ where: { companyId, action: "audit.settings.areas" }, orderBy: { at: "asc" } });
const okCreate = async (label = "Line 2 tablet") => {
  viewer = as(co.a, co.a.admin, "manager");
  const r = await createDeviceAction(SLUG, { label, areaIds: [] });
  if (!r.ok) throw new Error("create failed: " + r.error);
  return r;
};

beforeAll(async () => {
  vi.stubEnv("AUTH_SECRET", SECRET);
  await db.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  co.a = await makeCompany(SLUG);
  co.b = await makeCompany(OTHER);
});
beforeEach(async () => {
  viewer = null;
  jar.clear();
  forwardedFor = "10.0.0." + Math.floor(Math.random() * 200 + 1);
  await db.rateCounter.deleteMany({});
});
afterEach(() => vi.useRealTimers());
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  await db.$disconnect();
});

describe("FLR devices and codes", () => {
  it("an admin creates a device and gets a pairing code once; only its hash is stored and the audit row holds no secret", async () => {
    const r = await okCreate();
    expect(r.pairCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    const row = await db.floorDevice.findFirstOrThrow({ where: { id: r.deviceId, companyId: co.a.id } });
    expect(row.pairCodeHash).toBe(hashFloor(co.a.id, r.pairCode));
    expect(row.tokenHash).toBeNull();
    const a = (await audits(co.a.id)).at(-1)!;
    expect(a.targetId).toBe(r.deviceId);
    expect(JSON.stringify(a.changes)).not.toContain(r.pairCode);
    expect(JSON.stringify(a.changes)).toContain("set");
  });

  it("the code pairs one browser within 30 minutes and then never again", async () => {
    const r = await okCreate("Pair once");
    const first = await pairDeviceAction(SLUG, r.pairCode.toLowerCase());
    expect(first).toEqual({ ok: true, label: "Pair once" });
    const cookie = jar.get(FLOOR_DEVICE_COOKIE)!;
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: `/${SLUG}/floor`, maxAge: 400 * 24 * 60 * 60 });
    const token = readSignedValue(cookie.value, SECRET)!;
    const row = await db.floorDevice.findFirstOrThrow({ where: { id: r.deviceId, companyId: co.a.id } });
    expect(row.tokenHash).toBe(hashDeviceToken(token));
    expect(row.pairedAt).not.toBeNull();
    expect(row.pairCodeHash).toBeNull();

    jar.clear();
    const again = await pairDeviceAction(SLUG, r.pairCode);
    expect(again).toMatchObject({ ok: false, error: "floorDevices.pairWrong" });
    expect(jar.has(FLOOR_DEVICE_COOKIE)).toBe(false);
  });

  it("an expired code fails and a code of another company fails", async () => {
    const r = await okCreate("Late");
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 31 * 60_000 });
    expect(await pairDeviceAction(SLUG, r.pairCode)).toMatchObject({ ok: false, error: "floorDevices.pairWrong" });
    vi.useRealTimers();
    expect(await pairDeviceAction(OTHER, r.pairCode)).toMatchObject({ ok: false, error: "floorDevices.pairWrong" });
    expect(jar.has(FLOOR_DEVICE_COOKIE)).toBe(false);
    // still unpaired and the code still works inside its window
    expect(await pairDeviceAction(SLUG, r.pairCode)).toMatchObject({ ok: true });
  });

  it("a new pairing code replaces the old one", async () => {
    const r = await okCreate("Renewed");
    viewer = as(co.a, co.a.admin, "manager");
    const n = await newPairCodeAction(SLUG, r.deviceId);
    if (!n.ok) throw new Error("no code");
    expect(await pairDeviceAction(SLUG, r.pairCode)).toMatchObject({ ok: false });
    expect(await pairDeviceAction(SLUG, n.pairCode)).toMatchObject({ ok: true });
  });

  it("pairing is rate-limited and a limited try writes nothing", async () => {
    const r = await okCreate("Limited");
    for (let i = 0; i < 5; i++) expect(await pairDeviceAction(SLUG, "AAAAAA")).toMatchObject({ ok: false, error: "floorDevices.pairWrong" });
    const blocked = await pairDeviceAction(SLUG, r.pairCode);
    expect(blocked.ok).toBe(false);
    expect(blocked).toHaveProperty("message");
    expect(jar.has(FLOOR_DEVICE_COOKIE)).toBe(false);
    expect((await db.floorDevice.findFirstOrThrow({ where: { id: r.deviceId, companyId: co.a.id } })).tokenHash).toBeNull();
  });

  it("a new floor code for a member replaces the old one and is audited without the code", async () => {
    viewer = as(co.a, co.a.admin, "manager");
    const one = await issueFloorCodeAction(SLUG, co.a.member);
    const two = await issueFloorCodeAction(SLUG, co.a.member);
    if (!one.ok || !two.ok) throw new Error("no code");
    expect(one.code).toMatch(/^\d{6}$/);
    const rows = await db.floorCode.findMany({ where: { companyId: co.a.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].codeHash).toBe(hashFloor(co.a.id, two.code));
    expect(rows[0].codeHash).not.toBe(hashFloor(co.a.id, one.code));
    const log = (await audits(co.a.id)).filter((a) => a.targetId === co.a.member);
    expect(log).toHaveLength(2);
    expect(JSON.stringify(log[1].changes)).toContain("replaced");
    for (const a of log) for (const c of [one.code, two.code]) expect(JSON.stringify(a)).not.toContain(c);
  });

  it("a person of another company or a deactivated person gets no floor code", async () => {
    viewer = as(co.a, co.a.admin, "manager");
    expect(await issueFloorCodeAction(SLUG, co.b.member)).toEqual({ ok: false, error: "floorDevices.errMember" });
    await db.user.update({ where: { id: co.a.member, companyId: co.a.id }, data: { active: false } });
    expect(await issueFloorCodeAction(SLUG, co.a.member)).toEqual({ ok: false, error: "floorDevices.errMember" });
    await db.user.update({ where: { id: co.a.member, companyId: co.a.id }, data: { active: true } });
  });

  it("an admin removes a device, audited; another company's device is not found", async () => {
    const r = await okCreate("Doomed");
    viewer = as(co.b, co.b.admin, "manager");
    expect(await removeDeviceAction(OTHER, r.deviceId)).toEqual({ ok: false, error: "floorDevices.errDevice" });
    viewer = as(co.a, co.a.admin, "manager");
    expect(await removeDeviceAction(SLUG, r.deviceId)).toEqual({ ok: true });
    expect(await db.floorDevice.count({ where: { id: r.deviceId, companyId: co.a.id } })).toBe(0);
    expect((await audits(co.a.id)).at(-1)!.targetId).toBe(r.deviceId);
  });

  it("a non-admin is refused and nothing is written", async () => {
    const before = { devices: await db.floorDevice.count({ where: { companyId: co.a.id } }), codes: await db.floorCode.count({ where: { companyId: co.a.id } }), audits: (await audits(co.a.id)).length };
    for (const v of [null, as(co.a, co.a.member, "member"), as(co.a, co.a.member, "leader")]) {
      viewer = v;
      const forbidden = { ok: false, error: "settingsCompany.forbidden" };
      expect(await createDeviceAction(SLUG, { label: "x", areaIds: [] })).toEqual(forbidden);
      expect(await newPairCodeAction(SLUG, "any")).toEqual(forbidden);
      expect(await removeDeviceAction(SLUG, "any")).toEqual(forbidden);
      expect(await issueFloorCodeAction(SLUG, co.a.member)).toEqual(forbidden);
    }
    expect({ devices: await db.floorDevice.count({ where: { companyId: co.a.id } }), codes: await db.floorCode.count({ where: { companyId: co.a.id } }), audits: (await audits(co.a.id)).length }).toEqual(before);
  });

  it("a device with an area of another company is refused", async () => {
    viewer = as(co.a, co.a.admin, "manager");
    expect(await createDeviceAction(SLUG, { label: "Bad", areaIds: ["nope"] })).toEqual({ ok: false, error: "floorDevices.errAreas" });
    expect(await createDeviceAction(SLUG, { label: "  ", areaIds: [] })).toEqual({ ok: false, error: "floorDevices.errLabel" });
  });
});
