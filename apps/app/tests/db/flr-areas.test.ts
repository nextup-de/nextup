import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async () => viewer), getViewer: vi.fn(async () => null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

import AreaPosterPage from "@/app/[company]/(app)/settings/areas/[key]/poster/page";
import { removeAreaAction, saveAreaAction, setAreaOnAction } from "@/server/actions/settings/areas";

const db = getDb();
let co: { id: string; slug: string; admin: string; leader: string; unit: string; role: string; otherRole: string };

const asViewer = (userId: string, role: Viewer["role"]): Viewer => ({
  userId, companyId: co.id, companySlug: co.slug, name: "x", handle: null, role, epoch: 0, issuedAt: 0,
});
const audits = () => db.auditEvent.findMany({ where: { companyId: co.id, action: "audit.settings.areas" }, orderBy: { at: "asc" } });

beforeAll(async () => {
  await db.company.deleteMany({});
  const c = await db.company.create({ data: { slug: "flr-areas", name: "flr", seedJson: toSeedJson(SEED) as object } });
  const mk = (name: string, role: string) => db.user.create({ data: { companyId: c.id, name, email: `${name}@flr.example`, role }, select: { id: true } });
  const [admin, leader] = [await mk("admin", "manager"), await mk("leader", "leader")];
  const unit = await db.orgUnit.create({ data: { companyId: c.id, key: "MON", name: "Montage", kind: "dept", headcount: 2, sort: 0 } });
  const other = await db.orgUnit.create({ data: { companyId: c.id, key: "LOG", name: "Logistik", kind: "dept", headcount: 2, sort: 1 } });
  const role = await db.orgRole.create({ data: { companyId: c.id, orgUnitId: unit.id, title: "Schichtleitung", decides: [], sort: 0 } });
  const otherRole = await db.orgRole.create({ data: { companyId: c.id, orgUnitId: other.id, title: "Lager", decides: [], sort: 0 } });
  co = { id: c.id, slug: c.slug, admin: admin.id, leader: leader.id, unit: unit.id, role: role.id, otherRole: otherRole.id };
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("FLR areas page", () => {
  it("refuses a non-admin and writes nothing", async () => {
    viewer = asViewer(co.leader, "leader");
    const input = { key: "line-3", name: "Linie 3", unitId: co.unit, roleId: co.role, anonymous: true, on: true };
    expect(await saveAreaAction(co.slug, input)).toEqual({ ok: false, error: "settingsAreas.errForbidden" });
    expect(await db.floorArea.count({ where: { companyId: co.id } })).toBe(0);
  });

  it("an admin saves, edits, switches off and removes an area, each change audited", async () => {
    viewer = asViewer(co.admin, "manager");
    const input = { key: "line-3", name: "Linie 3", unitId: co.unit, roleId: co.role, anonymous: true, on: true };
    expect(await saveAreaAction(co.slug, input)).toEqual({ ok: true });
    const area = await db.floorArea.findFirstOrThrow({ where: { companyId: co.id, key: "line-3" } });
    expect(area).toMatchObject({ name: "Linie 3", anonymous: true, on: true });

    // A duplicate key and a role outside the unit are refused.
    expect(await saveAreaAction(co.slug, input)).toEqual({ ok: false, error: "settingsAreas.errKeyTaken" });
    expect(await saveAreaAction(co.slug, { ...input, key: "line-9", roleId: co.otherRole })).toEqual({ ok: false, error: "settingsAreas.errRole" });

    expect(await saveAreaAction(co.slug, { ...input, id: area.id, name: "Linie 3 Nord", anonymous: false })).toEqual({ ok: true });
    expect(await db.floorArea.findFirstOrThrow({ where: { id: area.id, companyId: co.id } })).toMatchObject({ name: "Linie 3 Nord", anonymous: false });

    expect(await setAreaOnAction(co.slug, area.id, false)).toEqual({ ok: true });
    expect((await db.floorArea.findFirstOrThrow({ where: { id: area.id, companyId: co.id } })).on).toBe(false);

    expect(await removeAreaAction(co.slug, area.id)).toEqual({ ok: true });
    expect(await db.floorArea.count({ where: { companyId: co.id } })).toBe(0);

    const rows = await audits();
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.targetKind === "area" && r.targetId === area.id && r.actorUserId === co.admin)).toBe(true);
  });

  it("the poster page renders the QR code and the name", async () => {
    viewer = asViewer(co.admin, "manager");
    await saveAreaAction(co.slug, { key: "we-sued", name: "Wareneingang", unitId: co.unit, roleId: co.role, anonymous: false, on: true });
    const el = await AreaPosterPage({
      params: Promise.resolve({ company: co.slug, key: "we-sued" }),
      searchParams: Promise.resolve({ size: "a5", lang: "both" }),
    });
    const html = renderToStaticMarkup(el);
    expect(html).toContain("<svg");
    expect(html).toContain("Wareneingang");
    expect(html).toContain("/floor/we-sued");
    expect(html).toContain('data-size="a5"');
  });
});
