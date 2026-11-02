// The write functions of the org and routing editor (ADM D8). One statement or one transaction
// each. The company id comes from the caller (the guard's viewer), every row is addressed with it,
// `by` is the admin's display name. The pure rules in features/org-edit run first, in the action.
import type { RoleInput, RouteInput, UnitInput, UnitPatch } from "@/features/org-edit";
import { getDb } from "./client";

const clean = (xs: readonly string[]) => xs.map((x) => x.trim()).filter(Boolean);

export async function addUnit(companyId: string, by: string, u: UnitInput): Promise<string> {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const last = await tx.orgUnit.findFirst({ where: { companyId }, orderBy: { sort: "desc" }, select: { sort: true } });
    const row = await tx.orgUnit.create({
      data: { companyId, key: u.key, name: u.name.trim(), kind: u.kind, headcount: u.headcount, parentId: u.parentId, sort: (last?.sort ?? -1) + 1, updatedBy: by },
      select: { id: true },
    });
    return row.id;
  });
}

export async function updateUnit(companyId: string, by: string, id: string, u: UnitPatch): Promise<void> {
  await getDb().orgUnit.updateMany({
    where: { id, companyId },
    data: { name: u.name.trim(), kind: u.kind, headcount: u.headcount, parentId: u.parentId, updatedBy: by },
  });
}

export async function removeUnit(companyId: string, id: string): Promise<void> {
  await getDb().orgUnit.deleteMany({ where: { id, companyId } });
}

export async function addRole(companyId: string, by: string, r: RoleInput): Promise<string> {
  return getDb().$transaction(async (tx) => {
    const last = await tx.orgRole.findFirst({ where: { companyId }, orderBy: { sort: "desc" }, select: { sort: true } });
    const row = await tx.orgRole.create({
      data: {
        companyId, orgUnitId: r.orgUnitId, title: r.title.trim(), reportsToId: r.reportsToId,
        decides: clean(r.decides), spendLimitEur: r.spendLimitEur, sort: (last?.sort ?? -1) + 1, updatedBy: by,
      },
      select: { id: true },
    });
    return row.id;
  });
}

export async function updateRole(companyId: string, by: string, id: string, r: RoleInput): Promise<void> {
  await getDb().orgRole.updateMany({
    where: { id, companyId },
    data: { orgUnitId: r.orgUnitId, title: r.title.trim(), reportsToId: r.reportsToId, decides: clean(r.decides), spendLimitEur: r.spendLimitEur, updatedBy: by },
  });
}

export async function removeRole(companyId: string, id: string): Promise<void> {
  await getDb().orgRole.deleteMany({ where: { id, companyId } });
}

export async function addSeat(companyId: string, roleId: string, name: string, userId: string | null): Promise<string> {
  return getDb().$transaction(async (tx) => {
    const last = await tx.orgRoleHolder.findFirst({ where: { companyId }, orderBy: { sort: "desc" }, select: { sort: true } });
    const row = await tx.orgRoleHolder.create({
      data: { companyId, roleId, name: name.trim(), userId, sort: (last?.sort ?? -1) + 1 },
      select: { id: true },
    });
    return row.id;
  });
}

/** Link a seat to a member of this company, or unlink with null. False when the user is not an active member here. */
export async function linkSeat(companyId: string, seatId: string, userId: string | null): Promise<boolean> {
  const db = getDb();
  if (userId !== null) {
    const member = await db.user.findFirst({ where: { id: userId, companyId, active: true }, select: { id: true } });
    if (!member) return false;
  }
  await db.orgRoleHolder.updateMany({ where: { id: seatId, companyId }, data: { userId } });
  return true;
}

export async function removeSeat(companyId: string, seatId: string): Promise<void> {
  await getDb().orgRoleHolder.deleteMany({ where: { id: seatId, companyId } });
}

/** Insert the route by key, or update it when the key exists. */
export async function saveRoute(companyId: string, by: string, r: RouteInput & { ownerRoleId: string }): Promise<void> {
  const fields = {
    type: r.type.trim(), keywords: clean(r.keywords), ownerRoleId: r.ownerRoleId,
    deputyRoleId: r.deputyRoleId, buddyRoleId: r.buddyRoleId, wait: r.wait.trim(), updatedBy: by,
  };
  await getDb().$transaction(async (tx) => {
    const found = await tx.routingRule.updateMany({ where: { companyId, key: r.key }, data: fields });
    if (found.count > 0) return;
    const last = await tx.routingRule.findFirst({ where: { companyId }, orderBy: { sort: "desc" }, select: { sort: true } });
    await tx.routingRule.create({ data: { companyId, key: r.key, ...fields, sort: (last?.sort ?? -1) + 1 } });
  });
}

export async function removeRoute(companyId: string, id: string): Promise<void> {
  await getDb().routingRule.deleteMany({ where: { id, companyId } });
}

/** Swap a route's place with its neighbour. No-op at the ends. */
export async function moveRoute(companyId: string, by: string, id: string, dir: "up" | "down"): Promise<void> {
  await getDb().$transaction(async (tx) => {
    const rows = await tx.routingRule.findMany({ where: { companyId }, orderBy: [{ sort: "asc" }, { key: "asc" }], select: { id: true } });
    const i = rows.findIndex((r) => r.id === id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= rows.length) return;
    // Renumber the whole list so equal sorts cannot make a swap a no-op.
    const order = rows.map((r) => r.id);
    [order[i], order[j]] = [order[j], order[i]];
    for (const [n, rid] of order.entries()) await tx.routingRule.updateMany({ where: { id: rid, companyId }, data: { sort: n, updatedBy: by } });
  });
}
