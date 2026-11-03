// The Inbox's two desk numbers, counted from the desk's own answered cases (D18). A disclosure
// control, not anonymisation (D6): below MIN_GROUP holders or MIN_GROUP answered cases there is no value.
import type { ReducedCase } from "@/features/cases/reducer";
import { median, pctWithin } from "@/features/metrics";
import { MIN_GROUP } from "@/features/metrics/types";

export type DeskStats = { median: number | null; withinPct: number | null };

export function deskStats(cases: readonly ReducedCase[], deskRoleIds: readonly string[], holderCount: number, promiseDays: number): DeskStats {
  const none: DeskStats = { median: null, withinPct: null };
  if (holderCount < MIN_GROUP) return none;
  const waits = cases
    .filter((c) => c.decided !== null && c.assigneeRoleId !== null && deskRoleIds.includes(c.assigneeRoleId))
    .map((c) => Math.max(0, (c.decided as { day: number }).day - c.raisedDay - c.pausedDays));
  if (waits.length < MIN_GROUP) return none;
  return { median: median(waits), withinPct: pctWithin(waits, promiseDays) };
}
