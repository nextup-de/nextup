// Seats (OrgRoleHolder rows) as the identity helpers read them (features/auth/identity.ts).
// Every query names the company at the top level, so the tenant guard sees it.
import type { SeatRow } from "@/features/auth/identity";
import { getDb } from "./client";

const seat = { id: true, roleId: true, name: true, userId: true, sort: true } as const;

type HolderRow = { id: string; roleId: string; name: string; userId: string | null; sort: number };
const toSeat = (h: HolderRow): SeatRow => ({ id: h.id, roleId: h.roleId, label: h.name, userId: h.userId, sort: h.sort });

/** Every seat of one company, by sort. */
export async function loadSeats(companyId: string): Promise<SeatRow[]> {
  const rows = await getDb().orgRoleHolder.findMany({ where: { companyId }, orderBy: { sort: "asc" }, select: seat });
  return rows.map(toSeat);
}

/** A user's first seat in this company, or null. */
export async function loadHolderOf(companyId: string, userId: string): Promise<SeatRow | null> {
  const row = await getDb().orgRoleHolder.findFirst({ where: { companyId, userId }, orderBy: { sort: "asc" }, select: seat });
  return row ? toSeat(row) : null;
}

/** The distinct user ids that hold a seat in this role, by sort. */
export async function loadUsersOfRole(companyId: string, roleId: string): Promise<string[]> {
  const rows = await getDb().orgRoleHolder.findMany({
    where: { companyId, roleId, userId: { not: null } },
    orderBy: { sort: "asc" },
    select: { userId: true },
  });
  return [...new Set(rows.flatMap((r) => (r.userId === null ? [] : [r.userId])))];
}
