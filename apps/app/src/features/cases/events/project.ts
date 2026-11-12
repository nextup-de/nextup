// The project area's events (plan REG, decision D8): every project.* type, the app list of them, and the payload
// fields only project events carry. MOV and RES write here; the composer (../events.ts) is closed. A field that more
// than one file uses (stepId, dueDay, userId, check, source, system, ...) lives in CorePayload in ../events.ts.
import type { MeasureImpact } from "@/features/projects/measure-source";

/** The project.* types the app may append, in the order of APP_EVENT_TYPES. */
export const PROJECT_EVENT_TYPES = [
  "project.member", "project.handed", "project.baseline", "project.started", "project.step.added",
  "project.step.moved", "project.step.edited", "project.linked", "project.sync", "project.commented", "project.done",
  "project.measured", "project.measure.confirmed", "project.rewarded", "project.claimed", "project.stopped",
  "project.lead.answered", "project.template", "project.invited", "project.invite.answered", "project.goal",
  "project.start.moved",
  "project.doneby.moved", "project.paused", "project.resumed", "project.howwework", "project.update", "project.lead.vacated",
  "project.lead.changed",
] as const;

/** Every project.* type, with the fields it carries. */
export type ProjectAreaEventType =
  // A project, target = its id. It opens with the case.decided yes above (a yes with draft: true opens a draft, D8), never with an event of its own.
  | "project.member" // { name, userId?, on }
  | "project.handed" // { to, toUserId?, why? }  a new lead; the old one stays on the team
  | "project.baseline" // { metric, unit, value, better: 'up'|'down', source } or { none: true, why }
  | "project.started" // -  refused without a baseline
  | "project.step.added" // { stepId, text, owner?, ownerUserId?, dueDay?, note?, to?, external? }  to: the column it starts in (To do when missing)
  | "project.step.moved" // { stepId, to: 'todo'|'doing'|'blocked'|'done', why?, before? }  before: the card it lands above (null = the bottom)
  | "project.step.edited" // { stepId, text?, owner?, ownerUserId?, dueDay?, note?, removed? }  only the fields sent change; owner "" and dueDay null clear
  | "project.linked" // { system, url, key?, stepId? }
  | "project.commented" // { text }
  | "project.sync" // { system: 'jira', on }  send the project to Jira / stop syncing it; lead or manager, while the project is open
  | "project.done" // { note? }  the measure checks start counting
  | "project.measured" // { check, value, source, note? }  the verdict is computed, never sent
  | "project.measure.confirmed" // { check }  a second person confirms a typed measure (LOOP/D18)
  | "project.rewarded" // { rule, amount?, note? }
  | "project.claimed" // -  an anonymous author takes their reward
  | "project.stopped" // { why }
  // The project draft (plan SET, D11 to D17).
  | "project.lead.answered" // { take, reason?, lapsed? }  the lead takes the draft or declines it; lapsed: the clock wrote it after LEAD_RETURN_DAYS (system:clock). Carries askId when the clock or a later cycle needs to name the ask it answers
  | "project.template" // { key, version, title? }  seeds the board steps from that exact template version; refused after the start
  | "project.invited" // { userId, role }  the lead or a manager invites; the event's own id is the invitation's identity (Invite.id)
  | "project.invite.answered" // { inviteId, userId, take, reason?, lapsed? }  inviteId names the project.invited event; a legacy answer without it counts only when the person has exactly one pending invitation, else it is rejected
  | "project.goal" // { goal, doneWhen, doneBy?, brief? }  goal and doneWhen 3 to 400 characters, brief up to 1200
  | "project.start.moved" // { dueDay, why }  the seat above keeps a late draft with a new start day
  // A project that keeps moving (plan MOV, D14 to D22).
  | "project.doneby.moved" // { doneBy, why }  a new done-by working day on a running project; the lead once, then the sponsor or a manager
  | "project.paused" // { why, untilDay }  the lead or a manager pauses a running project, at most PAUSE_MAX_DAYS ahead
  | "project.resumed" // -  the lead, the sponsor or a manager ends a pause early
  | "project.howwework" // { checkInWeekday, note? }  the weekly check-in weekday (1-5) and a note on how the team works
  | "project.update" // { text, week }  the lead's weekly update; week is the check-in day number
  | "project.lead.vacated" // { userId }  the lead left; written only by system:directory
  | "project.lead.changed"; // { to, toUserId, why? }  a new lead while the project has none

// Compile-time: every app type is a member of the area's union.
const _appTypesAreMembers: readonly ProjectAreaEventType[] = PROJECT_EVENT_TYPES;
void _appTypesAreMembers;

/** The EventPayload fields only project events carry. */
export type ProjectAreaPayload = {
  metric?: string; unit?: string; value?: number; better?: "up" | "down"; none?: boolean; // project.baseline, project.measured (value)
  owner?: string; // project.step.added, project.step.edited
  before?: string | null; removed?: boolean; // project.step.moved (before), project.step.edited (removed)
  external?: { system: string; key: string; url?: string }; // project.step.added from a connector
  impact?: MeasureImpact; // project.measured (LOOP/D20)
  rule?: string; amount?: number; // project.rewarded
  ownerUserId?: string | null; // project.step.added, project.step.edited (null clears)
  // The project draft (plan SET)
  take?: boolean; // project.lead.answered, project.invite.answered: accepted or declined
  lapsed?: boolean; // project.lead.answered, project.invite.answered: nobody answered, the clock wrote it
  version?: number; // project.template
  goal?: string; doneWhen?: string; doneBy?: number; brief?: string; // project.goal (doneBy: a working-day number)
  role?: "sponsor" | "member" | "contributor" | "follower"; // project.invited
  // A project that keeps moving (plan MOV). doneBy is shared with project.goal above (project.doneby.moved reuses it).
  untilDay?: number; // project.paused (a working-day number)
  checkInWeekday?: number; // project.howwework (1 = Monday ... 5 = Friday)
  week?: number; // project.update: the check-in day number of the week it is for
  unassign?: boolean; // project.member with on: false (D22): also clears the person's open steps and drops them as sponsor and follower
  originEventId?: string; // clock.due of a project: the event the occurrence belongs to (a block or vacancy cycle)
};
