// The Overview's cells, from the case and the company's seats (MET D17). Pure: no React, no clock.
// Roles come first, holders second; a name is a label, never a key.
import type { SeatRow } from "@/features/auth/identity";
import type { ReducedCase } from "@/features/cases/reducer";
import { CLOCK_EPOCH, dateOfWorkday } from "@/features/clock/calendar";
import type { ClockSpec } from "@/features/clock";

export type RoleTitle = { id: string; title?: string };
export type DeskLabel = { role: string | null; names: string[]; more: number; escalation: string | null };

const NAMES_SHOWN = 2;

/**
 * Whose desk a case is on: the role first, then up to two holders and how many more. A role nobody holds
 * shows alone; a case without a seat has role null ("No desk yet"). A case moved up past its promise
 * names the role it moved to in `escalation`.
 */
export function deskLabel(
  c: Pick<ReducedCase, "assigneeRoleId" | "escalated">,
  seats: readonly SeatRow[],
  roles: readonly RoleTitle[],
): DeskLabel {
  const title = (id: string | null) => (id === null ? null : roles.find((r) => r.id === id)?.title ?? null);
  const escalation = title(c.escalated?.toRoleId ?? null);
  if (c.assigneeRoleId === null) return { role: null, names: [], more: 0, escalation };
  const holders: string[] = [];
  const seen = new Set<string>();
  for (const s of [...seats].filter((x) => x.roleId === c.assigneeRoleId).sort((a, b) => a.sort - b.sort)) {
    if (s.userId === null) continue;
    if (seen.has(s.userId)) continue;
    seen.add(s.userId);
    holders.push(s.label);
  }
  return {
    role: title(c.assigneeRoleId) ?? "",
    names: holders.slice(0, NAMES_SHOWN),
    more: Math.max(0, holders.length - NAMES_SHOWN),
    escalation,
  };
}

export type OpenSince = { date: string | null; days: number; pastPromise: number };

/**
 * How long a case has been open. In workdays mode the date is the calendar day it was raised and the
 * days are working days; the demo has no calendar, so the date is null. `pastPromise` is the working
 * days since the promise ran out, 0 while it holds.
 */
export function openSince(
  c: Pick<ReducedCase, "raisedDay" | "dueDay" | "overdue">,
  today: number,
  clock: ClockSpec,
): OpenSince {
  const date = clock.mode === "workdays" ? (c.raisedDay < 1 ? CLOCK_EPOCH : dateOfWorkday(c.raisedDay, clock.calendar)) : null;
  return { date, days: Math.max(0, today - c.raisedDay), pastPromise: c.overdue ? Math.max(0, today - c.dueDay) : 0 };
}

/** One page of rows, 1-based; a page past the end is empty, below 1 is the first. */
export function pageOf<T>(rows: readonly T[], page: number, size = 50): T[] {
  const p = Math.max(1, Math.floor(page));
  return rows.slice((p - 1) * size, p * size);
}
