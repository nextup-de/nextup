// A small company for the OVL database tests: three roles (the seat above S, a desk B with two holders, a desk T), their people, and one admin without a seat.
// Shared by tests/db/ovl-away.test.ts and tests/db/ovl-share.test.ts. Everything is made straight in the database; the sandbox stage counts working days.
import type { Viewer } from "@/features/auth/session";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";

export type OvlCompany = {
  id: string;
  slug: string;
  /** user ids */
  admin: string; above: string; b1: string; b2: string; t: string; member: string; raiser: string;
  /** seat ids */
  seatAbove: string; seatB1: string; seatB2: string; seatT: string;
  /** role ids */
  roleAbove: string; roleB: string; roleT: string;
};

export async function ovlCompany(slug: string): Promise<OvlCompany> {
  const db = getDb();
  await db.company.deleteMany({ where: { slug } });
  const c = await db.company.create({ data: { openedAt: new Date(), slug, name: `Co ${slug}`, stage: "sandbox", seedJson: toSeedJson(SEED) as object } });
  const user = async (name: string, role: string) =>
    (await db.user.create({ data: { companyId: c.id, name, email: `${name.toLowerCase().replace(/ /g, ".")}@${slug}.example`, role, active: true }, select: { id: true } })).id;
  const [admin, above, b1, b2, t, member, raiser] = [
    await user("Admin", "manager"), await user("Seat Above", "member"), await user("Holder One", "leader"), await user("Holder Two", "leader"),
    await user("Cover Holder", "leader"), await user("Plain Member", "member"), await user("Raiser", "member"),
  ];
  const unit = await db.orgUnit.create({ data: { companyId: c.id, key: "OPS", name: "Operations", kind: "dept", headcount: 5, sort: 0 } });
  const role = async (title: string, reportsToId: string | null, sort: number) =>
    (await db.orgRole.create({ data: { companyId: c.id, orgUnitId: unit.id, title, reportsToId, decides: [], sort } })).id;
  const roleAbove = await role("Head of operations", null, 0);
  const roleB = await role("Desk B", roleAbove, 1);
  const roleT = await role("Desk T", roleAbove, 2);
  const seat = async (roleId: string, name: string, userId: string, sort: number) =>
    (await db.orgRoleHolder.create({ data: { companyId: c.id, roleId, name, userId, sort }, select: { id: true } })).id;
  return {
    id: c.id, slug, admin, above, b1, b2, t, member, raiser, roleAbove, roleB, roleT,
    seatAbove: await seat(roleAbove, "Seat Above", above, 0), seatB1: await seat(roleB, "Holder One", b1, 1), seatB2: await seat(roleB, "Holder Two", b2, 2), seatT: await seat(roleT, "Cover Holder", t, 3),
  };
}

export const viewerOf = (co: Pick<OvlCompany, "id" | "slug">, userId: string, name: string, role: Viewer["role"]): Viewer =>
  ({ userId, companyId: co.id, companySlug: co.slug, name, handle: null, role, epoch: 0, issuedAt: 0 });
