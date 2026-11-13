// The event log. Append-only facts; the reducer turns seed + events into what the page shows.
// Port of legacy/demo/js/store.js - types here, reducer in reducer.ts, selectors in selectors.ts.
// Every event may also carry actorUserId (the person behind `actor`; null for system actors) and
// the id fields next to the label fields above (docs/IDENTITY.md). Labels are for display only.
// Never store display text as state: store who / which day / which route; build sentences at render.
import type { DueKind } from "@/features/clock/due";
import type { MeasureSource } from "@/features/projects/measure-source";
import type { AgentAreaEventType, AgentAreaPayload } from "./events/agent";
import type { ApprovalAreaEventType, ApprovalAreaPayload } from "./events/approval";
import type { CaseAreaEventType, CaseAreaPayload } from "./events/case";
import type { OverloadAreaEventType, OverloadAreaPayload } from "./events/overload";
import type { ProjectAreaEventType, ProjectAreaPayload } from "./events/project";

// The core types: the idea.* events, day.advanced and clock.due. The case.* and project.* types (and the stubs of
// the other areas) are in events/<area>.ts and composed into CaseEventType below.
export type CoreEventType =
  | "idea.cosigned" // -
  | "idea.uncosigned" // -
  | "idea.asked" // { text }
  | "idea.approved" // { team?: [names], note? }
  | "idea.funded" // { team?: [names], note? }
  | "day.advanced" // { by }
  | "clock.due"; // { kind, dueDay, check?, toRoleHolderId?, userId?, inviteId?, askId?, lapse? }  kind lead / invite / draft: userId = the person waited for, inviteId = the project.invited event, askId = the event that asked the lead (cycle-specific idempotency), lapse = the second fact that writes the lapse; kind escalation: the second level, toRoleHolderId = the seat above (null: nobody).  internal: the scheduler appends it as actor system:clock, never a browser or integration (CLK/D10)

// What an employee raises: something that hurts, or something that could be. Missing = problem.
export type CaseKind = "problem" | "idea";

// Who the raiser lets see it in the lists: the whole company, only them and the desk it lands on,
// or those plus the people and departments picked (seenByUserIds, seenByUnitIds). Missing = no choice
// (features/cases/visibility decides by role). Applied in the browser only for now: the events endpoint
// still sends every event to every viewer.
export type Visibility = "everyone" | "private" | "custom";

// What the router proposed when the case was raised, kept so /admin/decisions can compare it with
// what people then chose (docs/COMPANY_KNOWLEDGE.md). The reducer never reads it.
export type RouteProposal = {
  routeId: string | null;
  confidence: number; // 0-100
  source: "keywords" | "llm";
  version: string; // which matcher or prompt - features/routing ROUTER_VERSION
};

// The fields that core events carry, and every field more than one file uses (an area file declares only the fields
// that its own events carry). Which ones apply is documented per type in the area files.
export type CorePayload = {
  title?: string; routeId?: string | null; kind?: CaseKind | DueKind; reason?: string;
  note?: string;
  to?: string; why?: string;
  text?: string;
  team?: string[]; // idea.approved, idea.funded
  by?: number; // day.advanced
  // Projects (case.decided yes opens one; the fields are shared with the project events)
  projectId?: string; // case.decided yes: the project it opens or joins
  lead?: string; // case.decided yes: who leads it
  name?: string; on?: boolean; // project.member
  source?: string | MeasureSource; // project.baseline, project.measured
  stepId?: string; dueDay?: number | null; // project.step.*, project.linked (stepId), project.start.moved, clock.due
  system?: string; url?: string; key?: string; // project.linked, project.sync (system; on is above), project.template (key)
  check?: number; // project.measured: days after done (30, 90); clock.due
  // Ids next to the labels above (IDN/D5); the label fields stay for display.
  toRoleHolderId?: string | null; // case.handed, clock.due
  leadUserId?: string | null; // case.decided yes with projectId
  userId?: string | null; // project.member, project.invited, clock.due
  toUserId?: string | null; // project.handed
  lapse?: boolean; // clock.due kind lead / invite: the fact that leads to the lapse, not the reminder
  inviteId?: string; // project.invite.answered, clock.due kind invite: the project.invited event it is about
  askId?: string; // clock.due kind lead: the event that asked the lead (the yes, or a project.handed on the draft)
};

// Composer (docs/process/README.md): a phase adds event types and fields to its area file under events/, never here.
export type CaseEventType = CoreEventType | CaseAreaEventType | ProjectAreaEventType | AgentAreaEventType | ApprovalAreaEventType | OverloadAreaEventType;

// Every field an event may carry: the core fields and each area's own.
export type EventPayload = CorePayload & CaseAreaPayload & ProjectAreaPayload & AgentAreaPayload & ApprovalAreaPayload & OverloadAreaPayload;

export type CaseEvent = {
  id: string;
  ts: number;
  day: number; // demo clock when it happened, 0 = today; seed history is negative
  type: CaseEventType;
  actor: string;
  target: string | null; // case id, idea id, or null (day.advanced)
  payload: EventPayload;
  actorUserId?: string | null; // the person behind `actor`; null or absent for system actors and unbound history
  seed?: boolean; // history that already happened before day 0 (from the seed rows)
};

// History carried on a seed row; the reducer applies it before live events.
export type SeedEvent = { type: CaseEventType; day: number; actor: string; actorUserId?: string | null; payload?: EventPayload };

// The log: the events that happened in this browser plus the demo clock.
export type EventLog = { events: CaseEvent[]; day: number };

export const emptyLog = (): EventLog => ({ events: [], day: 0 });

let seq = 0;
export const newId = (prefix: string) => prefix + "_" + Date.now().toString(36) + (seq++).toString(36);

export type NewEvent = { type: CaseEventType; actor: string; actorUserId?: string | null; target: string | null; payload?: EventPayload };

// Append one event. Returns a new log; the old one is untouched. day.advanced moves the clock.
export function appendEvent(log: EventLog, ev: NewEvent): EventLog {
  const e: CaseEvent = { id: newId("e"), ts: Date.now(), day: log.day, ...ev, actorUserId: ev.actorUserId ?? null, payload: ev.payload ?? {} };
  const day = ev.type === "day.advanced" ? log.day + (ev.payload?.by ?? 1) : log.day;
  return { events: log.events.concat([e]), day };
}
