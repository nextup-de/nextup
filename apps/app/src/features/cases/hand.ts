// A hand-over names a seat (IDN/D5, D13): the seat id decides where the case goes, the seat's label rides along as `to`.
import type { SeatRow } from "@/features/auth/identity";
import type { EventPayload } from "./events";

export function handPayload(seats: readonly SeatRow[], seatId: string, why?: string): EventPayload {
  return { to: seats.find((s) => s.id === seatId)?.label ?? "", toRoleHolderId: seatId, why };
}
