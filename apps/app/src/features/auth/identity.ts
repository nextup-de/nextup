// Who someone is, by id (docs/IDENTITY.md). Pure: no Prisma, no React.
// Display names are labels for the screen and are never compared (IDN/D2).
import type { Role } from "@/config/roles";

/** One OrgRoleHolder row: id = holder id, label = holder name (display only). */
export type SeatRow = { id: string; roleId: string; label: string; userId: string | null; sort: number };

/** Who a signed-in person is: their user id, the seats they hold and the roles those seats are in. */
export type Me = { userId: string | null; seatIds: string[]; roleIds: string[] };

/** Nobody: not signed in, or a seat nobody holds. */
export const NOBODY: Me = { userId: null, seatIds: [], roleIds: [] };

const bySort = (seats: readonly SeatRow[]): SeatRow[] => [...seats].sort((a, b) => a.sort - b.sort);

/** The seats a user holds (by sort) and their role ids without duplicates; NOBODY for null. */
export function meFor(userId: string | null, seats: readonly SeatRow[]): Me {
  if (userId === null) return NOBODY;
  const mine = bySort(seats).filter((s) => s.userId === userId);
  return { userId, seatIds: mine.map((s) => s.id), roleIds: [...new Set(mine.map((s) => s.roleId))] };
}

/** The Me of one seat, whoever holds it; NOBODY for an unknown seat. */
export function meOfSeat(seatId: string, seats: readonly SeatRow[]): Me {
  const s = seats.find((x) => x.id === seatId);
  return s ? { userId: s.userId, seatIds: [s.id], roleIds: [s.roleId] } : NOBODY;
}

/** A user's first seat by sort, or null. */
export function holderOf(seats: readonly SeatRow[], userId: string): SeatRow | null {
  return bySort(seats).find((s) => s.userId === userId) ?? null;
}

/** The seats of one role, by sort. */
export function seatsOfRole(seats: readonly SeatRow[], roleId: string): SeatRow[] {
  return bySort(seats).filter((s) => s.roleId === roleId);
}

/** The distinct, non-null user ids that hold a seat in this role, by sort. */
export function usersOfRole(seats: readonly SeatRow[], roleId: string): string[] {
  return [...new Set(seatsOfRole(seats, roleId).flatMap((s) => (s.userId === null ? [] : [s.userId])))];
}

/** Does this person hold a seat in the role? False for a null role id. */
export function holdsRole(me: Me, roleId: string | null): boolean {
  return roleId !== null && me.roleIds.includes(roleId);
}

/** The person behind an action: name and handle are labels, userId and me are the identity. */
export type Actor = { role: Role; userId: string | null; me: Me; name: string; handle: string | null };

/** The label stored on an event: a member's handle if they have one, else the name. */
export function actorLabel(a: { role: Role; name: string; handle: string | null }): string {
  return a.role === "member" && a.handle ? a.handle : a.name;
}
