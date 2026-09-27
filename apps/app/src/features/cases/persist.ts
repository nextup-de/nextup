// Between CaseEvent rows in Postgres and the EventLog the reducer takes.
//
// Pure on purpose - no Prisma import, no next/*. `EventRow` is hand-written rather than derived
// from Prisma's generated types so that tests/unit/ can cover this without pulling a database
// client into the DB-free suite.
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "./events";

/** One row as the database hands it back. */
export type EventRow = {
  id: string;
  seq: number;
  day: number;
  ts: Date | number;
  type: string;
  actor: string;
  targetId: string | null;
  payload: unknown;
};

/** What the server needs in order to write one. */
export type NewEventRow = {
  id: string;
  day: number;
  type: CaseEventType;
  actor: string;
  targetId: string | null;
  payload: EventPayload;
};

function toEvent(row: EventRow): CaseEvent {
  return {
    id: row.id,
    ts: row.ts instanceof Date ? row.ts.getTime() : row.ts,
    day: row.day | 0,
    type: row.type as CaseEventType,
    actor: row.actor,
    target: row.targetId,
    payload: (row.payload ?? {}) as EventPayload,
    // `seed` is deliberately never set. Seed history lives in Company.seedJson and the reducer
    // synthesises it; a row in this table is always something that actually happened.
  };
}

/**
 * Rows plus the company's clock -> the log the reducer takes.
 *
 * `day` comes in separately because reducer.ts reads `log.day` directly and never replays
 * day.advanced, so it cannot be derived from the rows. It lives on Company.demoDay.
 *
 * Rows must arrive ordered by `seq`, not by `ts`: timestamps tie at millisecond resolution and
 * the reducer is order-sensitive - a hand-over then an answer is not the same as the reverse.
 */
export function logFromRows(rows: readonly EventRow[], day: number): EventLog {
  return { events: rows.map(toEvent), day: day | 0 };
}

/** The cursor a caller should poll from next. */
export function cursorOf(rows: readonly EventRow[], since: number): number {
  return rows.reduce((max, r) => (r.seq > max ? r.seq : max), since);
}

/**
 * The event types the app itself may append.
 *
 * `case.building` and `case.shipped` are missing on purpose: they only ever appear as seed
 * history inside Company.seedJson, describing what happened before day 0. Nothing in the UI
 * emits them, and the server rejects them.
 *
 * What a *system* actor (n8n) may append is a different, smaller list - see features/integrations.
 */
export const APP_EVENT_TYPES = [
  "case.raised", "case.read", "case.decided", "case.handed", "case.asked", "case.answered",
  "case.override", "case.affected", "case.unaffected", "case.commented",
  "idea.cosigned", "idea.uncosigned", "idea.asked", "idea.approved", "idea.funded",
  "day.advanced",
] as const;

export type AppEventType = (typeof APP_EVENT_TYPES)[number];

export function isAppEventType(t: string): t is AppEventType {
  return (APP_EVENT_TYPES as readonly string[]).includes(t);
}
