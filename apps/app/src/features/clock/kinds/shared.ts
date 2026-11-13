// What every area's due loops share (REG/D7): the key of a fact, the check whether it is stored, the seat a fact goes to.
// features/clock/due.ts re-exports these. An area file imports its values from here and only types from due.ts: due.ts
// builds its lists from the area files at load, so a value import back would be a cycle.
import { seatsOfRole } from "@/features/auth/identity";
import type { State } from "@/features/cases/reducer";
import type { CaseEvent } from "@/features/cases/events";
import type { Route } from "@/features/demo/types";
import type { DueKind } from "../due";

/** The idempotency key of a fact. `stepId` (a project step the fact is about) is appended only when given, so every existing key stays as it was. */
export const idemKeyOf = (kind: DueKind, target: string, dueDay: number, check?: number, stepId?: string): string =>
  `clk:${kind}:${target}:${dueDay}` + (check === undefined ? "" : `:${check}`) + (stepId === undefined ? "" : `:${stepId}`);

/** Is this fact stored: a clock.due of that kind and day (and check, and step) in the history. */
export const hasFact = (history: readonly CaseEvent[], kind: DueKind, dueDay: number, check?: number, stepId?: string): boolean =>
  history.some((e) => e.type === "clock.due" && e.payload.kind === kind && e.payload.dueDay === dueDay && (check === undefined || e.payload.check === check)
    && (stepId === undefined || e.payload.stepId === stepId));

/** IDN/D8: the deputy role when the holder sits with the owner's role, else the owner role; its first seat with someone on it. */
export function targetSeat(state: State, route: Route | null, atOwner: boolean): string | null {
  const roleId = route ? (atOwner ? route.deputyRoleId : route.ownerRoleId) ?? null : null;
  return roleId === null ? null : seatsOfRole(state.seats, roleId).find((s) => s.userId !== null)?.id ?? null;
}
