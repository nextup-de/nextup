// Accounts created by Microsoft sign-in (IDN/D11, D12): the user row, its handle and, for a leader or
// manager whose department matches a unit, a seat in that unit's top role.
// Every query names the company at the top level, so the tenant guard sees it.
import type { User } from "@prisma/client";
import type { Role } from "@/config/roles";
import { jitSeatRole, type MicrosoftIdentity } from "@/features/auth/entra";
import { needsHandle, newHandle } from "@/features/auth/handle";
import { initialsOf } from "@/features/tenant/create";
import { getDb } from "./client";

export type SeatOutcome = "created" | "kept" | "none";
export type JitUser = { id: string; name: string; email: string; role: string };

/** Gives the user the top seat of their department unless they hold a seat already. */
export async function linkJitSeat(companyId: string, user: JitUser, department: string): Promise<SeatOutcome> {
  const db = getDb();
  if (await db.orgRoleHolder.findFirst({ where: { companyId, userId: user.id }, select: { id: true } })) return "kept";
  const [units, roles] = await Promise.all([
    db.orgUnit.findMany({ where: { companyId }, select: { id: true, key: true, name: true, sort: true } }),
    db.orgRole.findMany({ where: { companyId }, select: { id: true, orgUnitId: true, reportsToId: true, sort: true } }),
  ]);
  const roleId = jitSeatRole({ units, roles }, department, user.role as Role);
  if (!roleId) return "none";
  const last = await db.orgRoleHolder.aggregate({ where: { companyId }, _max: { sort: true } });
  // (roleId, name) is unique: a second person of the same name is told apart by the address.
  const sameName = await db.orgRoleHolder.findFirst({ where: { companyId, roleId, name: user.name }, select: { id: true } });
  await db.orgRoleHolder.create({
    data: {
      companyId,
      roleId,
      name: sameName ? `${user.name} (${user.email})` : user.name,
      userId: user.id,
      sort: (last._max.sort ?? -1) + 1,
    },
  });
  return "created";
}

/** The user a first Microsoft sign-in creates: a handle for a member, a seat for a leader or manager. */
export async function createMicrosoftUser(
  companyId: string,
  who: MicrosoftIdentity,
  role: Role,
): Promise<{ user: User; seat: SeatOutcome }> {
  const db = getDb();
  const display = who.name.trim() || who.email.split("@")[0];
  let handle: string | null = null;
  if (needsHandle(role)) {
    const taken = await db.user.findMany({ where: { companyId, handle: { not: null } }, select: { handle: true } });
    handle = newHandle(taken.flatMap((t) => (t.handle ? [t.handle] : [])));
  }
  const user = await db.user.create({
    data: { companyId, name: display, email: who.email, role, ini: initialsOf(display), entraOid: who.oid, ...(handle ? { handle } : {}) },
  });
  const seat = await linkJitSeat(companyId, user, who.department);
  return { user, seat };
}
