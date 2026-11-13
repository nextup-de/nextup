// Who is away and who answers for them (plan OVL, D19, D24): pure functions of the reduced state. A seat is present when it has a user who is not away
// today; a case's seat is covered by another present holder of its role, then the route's deputy role, then the seat above, one hop each, never a
// person's name (D3). A hand-over written by the clock for an away holder can be taken back by the holder once the absence is over.
import { seatsOfRole } from "@/features/auth/identity";
import { byClock } from "@/features/clock/actor";
import type { SeatAbove } from "@/features/clock/due";
import type { ReducedCase, State } from "@/features/cases/reducer";
import { deskLoads } from "./load";
import { overloadOf } from "./reduce";

/** Is the person away on `day`: a span with from <= day <= to that no person.back ended on or before that day (D19). */
export function awayOn(state: Pick<State, "overload">, userId: string, day: number): boolean {
  return overloadOf(state).away.some((s) => s.userId === userId && s.from <= day && day <= s.to && (s.endedDay === null || s.endedDay > day));
}

type Seats = Pick<State, "seats" | "overload">;

/** The seat has a user who is not away today. A seat nobody holds, or whose holder left, is not present. */
export function seatPresent(state: Seats, seatId: string, today: number): boolean {
  const seat = state.seats.find((s) => s.id === seatId);
  return seat !== undefined && seat.userId !== null && !awayOn(state, seat.userId, today);
}

const routeDeputyRole = (state: Pick<State, "routes">, routeId: string | null): string | null => state.routes.find((r) => r.id === routeId)?.deputyRoleId ?? null;

/**
 * The seat that answers for an away holder's seat (D19): the first seat (by sort) of the same role whose user is present and not the away user, else the first
 * present seat of the route's deputy role, else the seat above (one hop, and only when someone present sits there), else null.
 */
export function awayCoverSeat(state: Pick<State, "seats" | "overload" | "routes">, seatId: string, routeId: string | null, today: number, above: SeatAbove): string | null {
  const seat = state.seats.find((s) => s.id === seatId);
  if (!seat) return null;
  const present = (id: string) => seatPresent(state, id, today);
  const sameRole = seatsOfRole(state.seats, seat.roleId).find((s) => s.id !== seat.id && s.userId !== null && s.userId !== seat.userId && present(s.id));
  if (sameRole) return sameRole.id;
  const deputy = routeDeputyRole(state, routeId);
  const deputySeat = deputy === null || deputy === seat.roleId ? undefined : seatsOfRole(state.seats, deputy).find((s) => present(s.id));
  if (deputySeat) return deputySeat.id;
  const up = above(seat.roleId, []);
  return up !== null && up !== seat.id && present(up) ? up : null;
}

/**
 * The seat a new case on an overloaded desk goes to (D24): the open episode's cover seat when someone present sits there; else the first present seat
 * of the route's deputy role, provided the deputy role is not the source role and its own desk is not at overflow; else null (the case stays and is
 * counted; one hop, no seat above). Never a seat of the source role.
 */
export function overflowSeat(state: Pick<State, "seats" | "overload" | "routes" | "cases" | "projects" | "rules" | "approvals">, roleId: string, routeId: string | null, today: number): string | null {
  const present = (id: string) => seatPresent(state, id, today);
  const cover = overloadOf(state).desks.find((d) => d.roleId === roleId && d.clearedDay === null)?.coverSeatId ?? null;
  const coverSeat = cover === null ? undefined : state.seats.find((s) => s.id === cover);
  if (coverSeat && coverSeat.roleId !== roleId && present(coverSeat.id)) return coverSeat.id;
  const deputy = routeDeputyRole(state, routeId);
  if (deputy === null || deputy === roleId) return null;
  if (deskLoads(state, today).find((l) => l.roleId === deputy)?.level === "overflow") return null;
  return seatsOfRole(state.seats, deputy).find((s) => present(s.id))?.id ?? null;
}

/** A case the clock handed away from `userId`'s seat during an absence that is over and nobody has touched since: what "Take back" lists (D19). */
export function takeBackable(state: Pick<State, "cases" | "seats" | "overload">, userId: string, today: number): ReducedCase[] {
  if (awayOn(state, userId, today)) return [];
  const mine = new Set(state.seats.filter((s) => s.userId === userId).map((s) => s.id));
  const spans = overloadOf(state).away.filter((s) => s.userId === userId);
  return state.cases.filter((c) => {
    if (!(c.status === "open" || c.status === "discussion")) return false;
    const last = c.handed[c.handed.length - 1];
    if (!last || last.why !== "away" || last.fromUserId !== null || last.fromSeatId === null || !mine.has(last.fromSeatId) || c.assigneeSeatId !== last.toSeatId) return false;
    // Handed during one of the person's spans, and that span is over.
    if (!spans.some((s) => s.from <= last.day && last.day <= s.to)) return false;
    // The place of that hand-over in the case's history: the last case.handed with why 'away' by the clock.
    const at = c.history.findLastIndex((e) => e.type === "case.handed" && e.payload.why === "away" && byClock(e));
    if (at < 0) return false;
    // No later event by a person: the clock's, a system actor's and the take-back's own do not count.
    return !c.history.slice(at + 1).some((e) => !byClock(e) && !e.actor.startsWith("system:"));
  });
}
