// The minimal company directory behind the person page (MET D15): name, role and unit path of an
// active person who has a seat and no anonymous handle. Nothing else is selected.
import { adminBase } from "@/features/admin/nav";
import { singleCompany } from "@/features/tenant/urls";
import type { PersonCandidate } from "@/features/people/resolve";
import { getDb } from "./client";

export type PersonPage = { name: string; role: string; unitPath: string[] };

/** The user a URL segment names, if that segment is the id of a user of this company: [] otherwise. */
export async function personCandidates(companyId: string, param: string): Promise<PersonCandidate[]> {
  const row = await getDb().user.findFirst({ where: { companyId, id: param }, select: { id: true, handle: true, active: true } });
  return row ? [row] : [];
}

/** One active, handle-free user of this company with their first seat; null otherwise. */
export async function personPage(companyId: string, userId: string): Promise<PersonPage | null> {
  const db = getDb();
  const user = await db.user.findFirst({ where: { companyId, id: userId, active: true, handle: null }, select: { name: true } });
  if (!user) return null;
  const seat = await db.orgRoleHolder.findFirst({
    where: { companyId, userId },
    orderBy: { sort: "asc" },
    select: { role: { select: { title: true, orgUnitId: true } } },
  });
  if (!seat) return null;
  const units = await db.orgUnit.findMany({ where: { companyId }, select: { id: true, name: true, parentId: true } });
  const byId = new Map(units.map((u) => [u.id, u]));
  const unitPath: string[] = [];
  const seen = new Set<string>();
  for (let u = byId.get(seat.role.orgUnitId); u && !seen.has(u.id); u = u.parentId ? byId.get(u.parentId) : undefined) {
    seen.add(u.id);
    unitPath.unshift(u.name);
  }
  return { name: user.name, role: seat.role.title, unitPath };
}

/** user id -> display name for every active, handle-free user of the company who holds a seat. */
/**
 * Where this person's account menu leads to the IT console, or null. Only an active console admin
 * (`isStackAdmin`) of a one-company stack: elsewhere there is no console. Someone whose console access
 * comes from the Entra role is not known here, because that role is read only when they open /admin.
 */
export async function consoleHrefFor(companyId: string, userId: string): Promise<string | null> {
  if (singleCompany() === null) return null;
  const user = await getDb().user.findFirst({ where: { id: userId, companyId, active: true, isStackAdmin: true }, select: { id: true } });
  return user ? adminBase() : null;
}

export async function personLinksFor(companyId: string): Promise<Record<string, string>> {
  const db = getDb();
  const seats = await db.orgRoleHolder.findMany({ where: { companyId, userId: { not: null } }, select: { userId: true } });
  const ids = [...new Set(seats.flatMap((s) => (s.userId === null ? [] : [s.userId])))];
  if (ids.length === 0) return {};
  const users = await db.user.findMany({ where: { companyId, id: { in: ids }, active: true, handle: null }, select: { id: true, name: true } });
  return Object.fromEntries(users.map((u) => [u.id, u.name]));
}
