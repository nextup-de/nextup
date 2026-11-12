// What every area's writer shares (REG/D9). Pure: no database import, so a unit test can import it and the write*Due functions.
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import type { Due } from "@/features/clock/due";

/** What a writer sees: the reduced state the Dues were computed from, today, the company, and its answer length in working days (seed.promiseDays; the case area dates a reopened case with it). */
export type WriterCtx = { state: State; today: number; companyId: string; promiseDays?: number };

/** An event to append for a Due, `{ skip: true }` to write nothing (a hand-over to a gone seat), or null when this area does not write it. */
export type WriterResult = { type: CaseEventType; payload: EventPayload } | { skip: true } | null;

/** Fields of a Due that never go into a clock.due payload: `why` and `lapse` belong to the events the scheduler writes instead of a fact (hand-over, lapse), as before the split. */
export const NOT_IN_CLOCK_DUE = ["why", "lapse"] as const;

/** The payload of the clock.due fact for a Due: kind and dueDay, then every other own field that is set, in the order the Due has them. */
export function clockDuePayload(d: Due): Record<string, unknown> {
  const skip: readonly string[] = ["kind", "dueDay", "target", "idemKey", ...NOT_IN_CLOCK_DUE];
  const payload: Record<string, unknown> = { kind: d.kind, dueDay: d.dueDay };
  for (const [key, value] of Object.entries(d)) if (!skip.includes(key) && value !== undefined) payload[key] = value;
  return payload;
}
