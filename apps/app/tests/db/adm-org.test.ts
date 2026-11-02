import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { meFor } from "@/features/auth/identity";
import { onDeskOf } from "@/features/cases/selectors";
import { reduce } from "@/features/cases/reducer";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { loadLog } from "@/lib/db/events";
import { loadKnowledge } from "@/lib/db/knowledge";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async () => viewer) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  addRoleAction, addSeatAction, addUnitAction, linkSeatAction, saveRouteAction,
} from "@/server/actions/settings/org";

const db = getDb();
type Co = { id: string; slug: string; admin: string; leader: string; member: string };
const co: Record<"a" | "b", Co> = { a: null as never, b: null as never };

const asViewer = (c: Co, userId: string, role: Viewer["role"]): Viewer => ({
  userId, companyId: c.id, companySlug: c.slug, name: "Admin " + c.slug, handle: null, role, epoch: 0, issuedAt: 0,
});

async function makeCompany(slug: string, withRows: boolean): Promise<Co> {
  const c = await db.company.create({ data: { slug, name: slug, seedJson: toSeedJson(SEED) as object } });
  const mk = (name: string, role: string) =>
    db.user.create({ data: { companyId: c.id, name, email: `${name}@${slug}.example`, role }, select: { id: true } });
  const [admin, leader, member] = [await mk("admin", "manager"), await mk("leader", "leader"), await mk("memberx", "member")];
  if (withRows) {
    const u = await db.orgUnit.create({ data: { companyId: c.id, key: "OPS", name: "Operations", kind: "dept", headcount: 2, sort: 0 } });
    const r = await db.orgRole.create({ data: { companyId: c.id, orgUnitId: u.id, title: "Ops lead", decides: [], sort: 0 } });
    await db.orgRoleHolder.create({ data: { companyId: c.id, roleId: r.id, name: "Ops seat", sort: 0 } });
    await db.routingRule.create({ data: { companyId: c.id, key: "r1", type: "Ops", keywords: ["ops"], ownerRoleId: r.id, wait: "1d", sort: 0 } });
  }
  return { id: c.id, slug, admin: admin.id, leader: leader.id, member: member.id };
}

const counts = async (companyId: string) => ({
  units: await db.orgUnit.findMany({ where: { companyId }, orderBy: { key: "asc" } }),
  roles: await db.orgRole.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
  seats: await db.orgRoleHolder.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
  rules: await db.routingRule.findMany({ where: { companyId }, orderBy: { id: "asc" } }),
});

beforeAll(async () => {
  await db.company.deleteMany({});
  co.a = await makeCompany("adm-org-a", false);
  co.b = await makeCompany("adm-org-b", true);
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("ADM org editor", () => {
  it("a leader's call writes nothing", async () => {
    viewer = asViewer(co.a, co.a.leader, "leader");
    const r = await addUnitAction(co.a.slug, { key: "ENG", name: "Engineering", kind: "dept", headcount: 3, parentId: null });
    expect(r).toEqual({ ok: false, error: "settingsOrg.errForbidden" });
    expect((await counts(co.a.id)).units).toHaveLength(0);
  });

  it("an admin adds a unit, a role with a linked seat and a route; the seed routes to that seat", async () => {
    const otherBefore = JSON.stringify(await counts(co.b.id));
    viewer = asViewer(co.a, co.a.admin, "manager");
    const slug = co.a.slug;

    expect(await addUnitAction(slug, { key: "ENG", name: "Engineering", kind: "dept", headcount: 3, parentId: null })).toEqual({ ok: true });
    const unit = (await loadKnowledge(co.a.id)).units[0];
    expect(unit).toMatchObject({ key: "ENG" });
    expect(await addUnitAction(slug, { key: "ENG", name: "Again", kind: "dept", headcount: 1, parentId: null })).toEqual({ ok: false, error: "settingsOrg.errKeyDuplicate" });

    expect(await addRoleAction(slug, { orgUnitId: unit.id, title: "Engineering lead", reportsToId: null, decides: ["tools"], spendLimitEur: 500 })).toEqual({ ok: true });
    const role = (await loadKnowledge(co.a.id)).roles[0];
    expect(await addSeatAction(slug, role.id, "Seat 1", null)).toEqual({ ok: true });
    const seat = (await loadKnowledge(co.a.id)).holders[0];

    // A user of another company cannot be linked; a member of this one can.
    expect(await linkSeatAction(slug, seat.id, co.b.member)).toEqual({ ok: false, error: "settingsOrg.errMember" });
    expect(await linkSeatAction(slug, seat.id, co.a.member)).toEqual({ ok: true });

    const route = { key: "r1", type: "Engineering request", keywords: ["tool", "build"], ownerRoleId: role.id, deputyRoleId: null, buddyRoleId: null, wait: "2d" };
    expect(await saveRouteAction(slug, { ...route, ownerRoleId: null })).toEqual({ ok: false, error: "settingsOrg.errRouteNoOwner" });
    expect(await saveRouteAction(slug, route)).toEqual({ ok: true });

    const row = await db.company.findUniqueOrThrow({ where: { id: co.a.id } });
    const seed = await companySeed(row);
    expect(seed.routes.find((r) => r.id === "r1")).toMatchObject({ ownerRoleId: role.id, ownerSeatId: seat.id });

    await db.caseEvent.create({
      data: { id: "adm-org-raise", companyId: co.a.id, day: 0, type: "case.raised", actor: "Anonymous #1", targetId: "adm-org-c1", payload: { kind: "idea", title: "Idea", body: "text", routeId: "r1" } },
    });
    const state = reduce(seed, await loadLog(co.a.id));
    const c = state.cases.find((x) => x.id === "adm-org-c1");
    expect(c).toBeTruthy();
    expect(onDeskOf(c!, meFor(co.a.member, seed.seats))).toBe(true);
    expect(onDeskOf(c!, meFor(co.a.admin, seed.seats))).toBe(false);

    expect(JSON.stringify(await counts(co.b.id))).toBe(otherBefore);
    expect((await db.orgUnit.findFirstOrThrow({ where: { companyId: co.a.id } })).updatedBy).toBe("Admin " + slug);
  });
});
