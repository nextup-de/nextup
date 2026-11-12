// A hand-over names a seat (IDN/D5, D13): the seat id decides where the case goes, the seat's label rides along as `to`.
import type { SeatRow } from "@/features/auth/identity";
import type { Route } from "@/features/demo/types";
import type { EventPayload } from "./events";

export function handPayload(seats: readonly SeatRow[], seatId: string, why?: string): EventPayload {
  return { to: seats.find((s) => s.id === seatId)?.label ?? "", toRoleHolderId: seatId, why };
}

/** What a pass may carry besides the seat and the reason (plan NOR, D13). */
export type PassOptions = { back?: boolean; up?: boolean; routeId?: string; dueDay?: number; keepsQuestion?: boolean };

/** A pass: the hand-over of a seat with the optional fields, each only when set (an old reader sees the same payload as before). */
export function passPayload(seats: readonly SeatRow[], seatId: string, why: string, opts: PassOptions = {}): EventPayload {
  return {
    ...handPayload(seats, seatId, why),
    ...(opts.back ? { back: true } : {}),
    ...(opts.up ? { up: true } : {}),
    ...(opts.routeId ? { routeId: opts.routeId } : {}),
    ...(opts.dueDay !== undefined ? { dueDay: opts.dueDay } : {}),
    ...(opts.keepsQuestion ? { keepsQuestion: true } : {}),
  };
}

/** The first route whose owner seat is `seatId`, else the first whose deputy seat is; null when none. */
export function routeOfSeat(routes: readonly Route[], seatId: string): Route | null {
  return routes.find((r) => r.ownerSeatId === seatId) ?? routes.find((r) => r.deputySeatId === seatId) ?? null;
}
