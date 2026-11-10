// A typed result counts only once a second person confirmed it (LOOP/D18). This says which results still wait,
// until when, and who may confirm them (decision Q6.15): a manager or a holder of the route's deputy role, and,
// once the clock passed it up, the seat above. Never the lead and never who typed the number. Pure.
import { holdsRole, type Me, type SeatRow } from "@/features/auth/identity";
import type { Measure, ReducedProject } from "./types";

/** Working days a typed result may wait for its second person before the clock reminds who may confirm. */
export const CONFIRM_DAYS = 5;
/** Working days after that reminder until the seat above the deputy's desk is asked. */
export const CONFIRM_ESCALATE_DAYS = 3;

export type Unconfirmed = {
  check: number;
  measure: Measure;
  /** The last day the confirmation is on time. */
  dueDay: number;
  /** The seat above that the clock asked (its clock.due fact), or null while it has not. */
  upSeatId: string | null;
};

type Waiting = Pick<ReducedProject, "measures" | "stopped" | "history">;

/** The results of a project that wait for a second person. A stopped project chases nobody. */
export function unconfirmedOf(p: Waiting): Unconfirmed[] {
  if (p.stopped) return [];
  return p.measures
    .filter((m) => !m.confirmed && m.sourceKind !== "system")
    .map((m) => ({
      check: m.check,
      measure: m,
      dueDay: m.day + CONFIRM_DAYS,
      upSeatId: p.history.findLast((e) => e.type === "clock.due" && e.payload.kind === "confirm" && e.payload.check === m.check && !!e.payload.toRoleHolderId)?.payload.toRoleHolderId ?? null,
    }));
}

export type Confirmer = { userId: string | null; manager: boolean; me?: Me };

/** May this person confirm this result? The second person is never the lead or who typed the number. */
export function mayConfirm(p: Pick<ReducedProject, "leadUserId">, u: Unconfirmed, who: Confirmer, deputyRoleId: string | null, seats: readonly SeatRow[]): boolean {
  if (who.userId !== null && (who.userId === p.leadUserId || who.userId === u.measure.byUserId)) return false;
  if (who.manager) return true;
  if (!who.me) return false;
  const upRoleId = u.upSeatId ? seats.find((s) => s.id === u.upSeatId)?.roleId ?? null : null;
  return holdsRole(who.me, deputyRoleId) || holdsRole(who.me, upRoleId);
}

/**
 * Who is told that a result waits: every manager and every holder of the deputy role, or - `above` - the holders
 * of the seat the clock passed it up to. Without the lead and who typed the number, each person once.
 */
export function confirmerIds(
  p: Pick<ReducedProject, "leadUserId">, u: Unconfirmed, deputyRoleId: string | null, seats: readonly SeatRow[], managerIds: readonly string[], level: "desk" | "above",
): string[] {
  const usersOf = (roleId: string | null) => (roleId === null ? [] : seats.flatMap((s) => (s.roleId === roleId && s.userId !== null ? [s.userId] : [])));
  const upRoleId = u.upSeatId ? seats.find((s) => s.id === u.upSeatId)?.roleId ?? null : null;
  const ids = level === "above" ? usersOf(upRoleId) : [...usersOf(deputyRoleId), ...managerIds];
  return [...new Set(ids)].filter((id) => id !== p.leadUserId && id !== u.measure.byUserId);
}
