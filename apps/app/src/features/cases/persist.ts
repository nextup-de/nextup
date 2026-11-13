// Between CaseEvent rows in Postgres and the EventLog the reducer takes.
//
// Pure on purpose - no Prisma import, no next/*. `EventRow` is hand-written rather than derived
// from Prisma's generated types so that tests/unit/ can cover this without pulling a database
// client into the DB-free suite.
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "./events";
import { AGENT_EVENT_TYPES } from "./events/agent";
import { APPROVAL_EVENT_TYPES } from "./events/approval";
import { CASE_EVENT_TYPES } from "./events/case";
import { OVERLOAD_EVENT_TYPES } from "./events/overload";
import { PROJECT_EVENT_TYPES } from "./events/project";

/** One row as the database hands it back. */
export type EventRow = {
  id: string;
  seq: number;
  day: number;
  ts: Date | number;
  type: string;
  actor: string;
  actorUserId?: string | null;
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
    actorUserId: row.actorUserId ?? null,
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

/** The core event types the app may append: the idea.* events and day.advanced. The areas list their own (events/<area>.ts). */
export const CORE_APP_EVENT_TYPES = ["idea.cosigned", "idea.uncosigned", "idea.asked", "idea.approved", "idea.funded", "day.advanced"] as const;

/**
 * The event types the app itself may append: the core ones, then each area's in area order (case, project, agent,
 * approval, overload). Nothing depends on the order.
 *
 * `case.building` and `case.shipped` are missing on purpose: they only ever appear as seed
 * history inside Company.seedJson, describing what happened before day 0. Nothing in the UI
 * emits them, and the server rejects them.
 *
 * What a *system* actor (n8n) may append is a different, smaller list - see features/integrations.
 */
export const APP_EVENT_TYPES = [
  ...CORE_APP_EVENT_TYPES, ...CASE_EVENT_TYPES, ...PROJECT_EVENT_TYPES, ...AGENT_EVENT_TYPES, ...APPROVAL_EVENT_TYPES, ...OVERLOAD_EVENT_TYPES,
] as const;

/** The events behind the `discussion` flag. */
export const DISCUSSION_EVENT_TYPES: readonly string[] = ["case.discussion", "case.invited", "case.revised", "case.checkin"];

/** Is this event behind the `projects` flag? Every project.* event, and a yes that opens a project. */
export const needsProjectsFlag = (type: string, payload: { projectId?: unknown }): boolean =>
  type.startsWith("project.") || (type === "case.decided" && payload.projectId != null);

export type AppEventType = (typeof APP_EVENT_TYPES)[number];

export function isAppEventType(t: string): t is AppEventType {
  return (APP_EVENT_TYPES as readonly string[]).includes(t);
}
