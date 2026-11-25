// The project area's events (plan REG, decision D8): every project.* type, the app list of them, and the payload
// fields only project events carry. MOV and RES write here; the composer (../events.ts) is closed. A field that more
// than one file uses (stepId, dueDay, userId, check, source, system, ...) lives in CorePayload in ../events.ts.
import type { FormFieldInput, PageIconKey, StepChecklistOp, StepColumn, StepWaitingOnInput, ToolKind } from "@/features/projects/types";
import type { MeasureImpact } from "@/features/projects/measure-source";

/** The project.* types the app may append, in the order of APP_EVENT_TYPES. */
export const PROJECT_EVENT_TYPES = [
  "project.member", "project.handed", "project.baseline", "project.started", "project.step.added",
  "project.step.moved", "project.step.edited", "project.step.checklist", "project.step.commented", "project.linked", "project.sync", "project.commented", "project.done",
  "project.measured", "project.measure.confirmed", "project.rewarded", "project.claimed", "project.stopped",
  "project.lead.answered", "project.template", "project.invited", "project.invite.answered", "project.goal",
  "project.start.moved", "project.renamed",
  "project.doneby.moved", "project.paused", "project.resumed", "project.howwework", "project.update", "project.lead.vacated",
  "project.lead.changed",
  "project.measure.questioned", "project.baseline.confirmed", "project.help.asked",
  "project.page.added", // { pageId, title, icon, tools: [{ toolId, kind, title?, content? }], before? }
  "project.page.edited", // { pageId, title?, icon? }
  "project.page.moved", // { pageId, before }  null places it at the end
  "project.page.removed", // { pageId }  keeps the page and its tools for restoration
  "project.page.restored", // { pageId }
  "project.tool.added", // { pageId, toolId, kind, before? }
  "project.tool.moved", // { toolId, toPageId, before? }
  "project.tool.edited", // { toolId, title?, collapsed?, content?, baseRev? }  content requires baseRev
  "project.tool.removed", // { toolId }
  "project.tool.restored", // { toolId }
  "project.page.merged", // { mergeId, fromPageId, intoPageId }  moves every tool in order
  "project.page.unmerged", // { mergeId }
  "project.milestone.added", // { milestoneId, title, startDay?, dueDay, note?, external?, sync? }  external and sync: the Jira sync only (plan JSY)
  "project.milestone.edited", // { milestoneId, title?, startDay?, dueDay?, note?, shipped?, removed?, external?, sync? }  external and sync: the Jira sync only (plan JSY)
  "project.form.saved", // { formId, title, intro, fields, shared }
  "project.form.answered", // { formId, formRev, requestId, answers }
  "project.request.stepped", // { requestId, step: { stepId, text, column, ownerUserId?, dueDay?, note? } }
  "project.request.declined", // { requestId, why }
  "project.request.reopened", // { requestId }
] as const;

/** Every project.* type, with the fields it carries. */
export type ProjectAreaEventType =
  // A project, target = its id. It opens with the case.decided yes above (a yes with draft: true opens a draft, D8), never with an event of its own.
  | "project.member" // { name, userId?, on } or { name?, userId, coLead: false }  the co-lead role is taken back or put down
  | "project.handed" // { to, toUserId?, why? }  a new lead; the old one stays on the team
  | "project.baseline" // { metric, unit, value, better: 'up'|'down', source } or { none: true, why }
  | "project.started" // -  refused without a baseline
  | "project.step.added" // { stepId, text, owner?, ownerUserId?, dueDay?, note?, to?, external? }  to: the column it starts in (To do when missing)
  | "project.step.moved" // { stepId, to: 'todo'|'doing'|'blocked'|'done', why?, before?, waitingOn? }  before: the card it lands above (null = the bottom)
  | "project.step.checklist" // { stepId, op, itemId, text?, done? }: one item per event
  | "project.step.commented" // { stepId, text, replyTo? }: replies name an earlier comment on this step
  | "project.step.edited" // { stepId, text?, owner?, ownerUserId?, dueDay?, startDay?, milestoneId?, note?, removed? }  only the fields sent change; owner "" and dueDay, startDay, milestoneId null clear
  | "project.linked" // { system, url, key?, stepId? }
  | "project.commented" // { text }
  | "project.sync" // { system: 'jira', on }  send the project to Jira / stop syncing it; lead or manager, while the project is open
  | "project.done" // { note?, openSteps? }  the measure checks start counting; openSteps: how each step not in Done ends (D13, D28)
  | "project.measured" // { check, value, source, note?, measureEventId? }  the verdict is computed, never sent; after a send-back it re-enters that check once (D14), naming the revision it replaces
  | "project.measure.confirmed" // { check, measureEventId? }  a second person confirms a typed measure (LOOP/D18); measureEventId names the revision confirmed
  | "project.rewarded" // { rule, amount?, note? }
  | "project.claimed" // -  an anonymous author takes their reward
  | "project.stopped" // { why }
  // The project draft (plan SET, D11 to D17).
  | "project.lead.answered" // { take, reason?, lapsed? }  the lead takes the draft or declines it; lapsed: the clock wrote it after LEAD_RETURN_DAYS (system:clock). Carries askId when the clock or a later cycle needs to name the ask it answers
  | "project.template" // { key, version, title? }  seeds the board steps from that exact template version; refused after the start
  | "project.invited" // { userId, role }  the lead or a manager invites; the event's own id is the invitation's identity (Invite.id)
  | "project.invite.answered" // { inviteId, userId, take, reason?, lapsed? }  inviteId names the project.invited event; a legacy answer without it counts only when the person has exactly one pending invitation, else it is rejected
  | "project.goal" // { goal, doneWhen, doneBy?, brief? }  goal and doneWhen 3 to 400 characters, brief up to 1200
  | "project.start.moved" // { dueDay, why }  the seat above keeps a late draft with a new start day; the lead picks another before it is late
  | "project.renamed" // { title }  a draft gets another name; refused after the start
  // A project that keeps moving (plan MOV, D14 to D22).
  | "project.doneby.moved" // { doneBy, why }  a new done-by working day on a running project; the lead once, then the sponsor or a manager
  | "project.paused" // { why, untilDay }  the lead or a manager pauses a running project, at most PAUSE_MAX_DAYS ahead
  | "project.resumed" // -  the lead, the sponsor or a manager ends a pause early
  | "project.howwework" // { checkInWeekday, note? }  the weekly check-in weekday (1-5) and a note on how the team works
  | "project.update" // { text, week }  the lead's weekly update; week is the check-in day number
  | "project.lead.vacated" // { userId }  the lead left; written only by system:directory
  | "project.lead.changed" // { to, toUserId, why? }  a new lead while the project has none
  // A result that closes properly (plan RES, D13 to D19).
  | "project.measure.questioned" // { check, why, measureEventId? }  a person who may confirm sends a typed result back (D14); measureEventId names the revision questioned
  | "project.baseline.confirmed" // { baselineEventId? }  a second person confirms the current baseline number (D16); baselineEventId names the revision confirmed
  | "project.help.asked" // { stepId, text }  the lead or a member asks the sponsor for help on a step (D19)
  // Pages built from tools (plan PGE, D9).
  | "project.page.added" // { pageId, title, icon, tools: [{ toolId, kind, title?, content? }], before? }
  | "project.page.edited" // { pageId, title?, icon? }
  | "project.page.moved" // { pageId, before }  null places it at the end
  | "project.page.removed" // { pageId }  keeps the page and its tools for restoration
  | "project.page.restored" // { pageId }
  | "project.tool.added" // { pageId, toolId, kind, before? }
  | "project.tool.moved" // { toolId, toPageId, before? }
  | "project.tool.edited" // { toolId, title?, collapsed?, content?, baseRev? }  content requires baseRev
  | "project.tool.removed" // { toolId }
  | "project.tool.restored" // { toolId }
  | "project.page.merged" // { mergeId, fromPageId, intoPageId }  moves every tool in order
  | "project.page.unmerged" // { mergeId }
  // Plan tools (plan PLN, D3).
  | "project.milestone.added" // { milestoneId, title, startDay?, dueDay, note?, external?, sync? }  title 1-80, note up to 1000, dueDay not before startDay; external and sync only from the Jira sync
  | "project.milestone.edited" // { milestoneId, title?, startDay?, dueDay?, note?, shipped?, removed?, external?, sync? }  only the fields sent change; external and sync only from the Jira sync (sync null clears); an imported milestone's fields change only by the sync; startDay null clears; removed clears milestoneId on its steps
  // Requests and forms (plan REQ, D4). Every payload fits EVENT_BUDGET.
  | "project.form.saved" // { formId, title, intro, fields: [{ id, kind, label, required, options? }], shared }  title 1-80, intro up to 1000, 1-20 fields; every save counts the form's rev up
  | "project.form.answered" // { formId, formRev, requestId, answers: { [fieldId]: string } }  formRev is the form's current rev; by any signed-in person of the company while the form is shared
  | "project.request.stepped" // { requestId, step: { stepId, text, column, ownerUserId?, dueDay?, note? } }  one event that adds the step and links it; only a new request
  | "project.request.declined" // { requestId, why }  why 1-400; only a new request
  | "project.request.reopened"; // { requestId }  undo: a declined request becomes new; a stepped one only while its step is untouched, then the step goes away with it

// Compile-time: every app type is a member of the area's union.
const _appTypesAreMembers: readonly ProjectAreaEventType[] = PROJECT_EVENT_TYPES;
void _appTypesAreMembers;

/** The EventPayload fields only project events carry. */
export type ProjectAreaPayload = {
  op?: StepChecklistOp; itemId?: string; done?: boolean; // project.step.checklist
  replyTo?: string | null; // project.step.commented
  waitingOn?: StepWaitingOnInput; // project.step.moved to blocked
  metric?: string; unit?: string; value?: number; better?: "up" | "down"; none?: boolean; // project.baseline, project.measured (value)
  owner?: string; // project.step.added, project.step.edited
  before?: string | null; removed?: boolean; // project.step.moved (before), project.step.edited (removed)
  external?: { system: string; key: string; url?: string; mode?: "owned" | "imported" }; // project.step.added from a connector; project.milestone.added/edited from the Jira sync only (mode: who may write the version, plan JSY D9, D20)
  sync?: { state: "pending" | "failed"; op: "create" | "update" | "archive" | "fixVersion"; why?: string } | null; // project.milestone.added/edited from the Jira sync only: an unfinished write to Jira (null clears, D22)
  impact?: MeasureImpact; // project.measured (LOOP/D20)
  rule?: string; amount?: number; // project.rewarded
  ownerUserId?: string | null; // project.step.added, project.step.edited (null clears)
  // The project draft (plan SET)
  take?: boolean; // project.lead.answered, project.invite.answered: accepted or declined
  lapsed?: boolean; // project.lead.answered, project.invite.answered: nobody answered, the clock wrote it
  version?: number; // project.template
  goal?: string; doneWhen?: string; doneBy?: number; brief?: string; // project.goal (doneBy: a working-day number)
  role?: "sponsor" | "colead" | "member" | "contributor" | "follower"; // project.invited
  // A project that keeps moving (plan MOV). doneBy is shared with project.goal above (project.doneby.moved reuses it).
  untilDay?: number; // project.paused (a working-day number)
  checkInWeekday?: number; // project.howwework (1 = Monday ... 5 = Friday)
  week?: number; // project.update: the check-in day number of the week it is for
  coLead?: boolean; // project.member, only false: the co-lead role is taken back; given by an accepted invitation (role colead)
  unassign?: boolean; // project.member with on: false (D22): also clears the person's open steps and drops them as sponsor and follower
  originEventId?: string; // clock.due of a project: the event the occurrence belongs to (a block or vacancy cycle)
  // A result that closes properly (plan RES). check, why, stepId and text are shared (CorePayload).
  openSteps?: { stepId: string; end: "done" | "dropped"; why?: string }[]; // project.done (D13, D28): every step not in Done, how it ends ("open" is case.checkin's)
  // The revision a confirmation, a questioning or a re-entry is about (RES review, 12 Nov): the id of the project.measured / project.baseline
  // event that wrote the number. An event naming a revision that has since been replaced is refused, so a confirmation for revision A never
  // confirms its replacement B. A missing field (every event stored before RES) names the revision that stood when it was written.
  measureEventId?: string; // project.measure.confirmed, project.measure.questioned, project.measured (a re-entry)
  baselineEventId?: string; // project.baseline.confirmed
  // Pages built from tools (plan PGE). title, kind and before are shared core fields.
  pageId?: string; toolId?: string; toPageId?: string;
  icon?: PageIconKey;
  tools?: { toolId: string; kind: ToolKind; title?: string; content?: string }[];
  collapsed?: boolean; content?: string; baseRev?: number;
  mergeId?: string; fromPageId?: string; intoPageId?: string;
  // Plan tools (plan PLN). title, note, dueDay and removed are shared fields.
  startDay?: number | null; // project.step.edited, project.milestone.added, project.milestone.edited (a working-day number; null clears)
  milestoneId?: string | null; // project.step.edited (null clears), project.milestone.added, project.milestone.edited
  shipped?: boolean; // project.milestone.edited
  // Requests and forms (plan REQ). title and why are shared core fields.
  formId?: string; formRev?: number; requestId?: string; // project.form.*, project.request.*
  intro?: string; shared?: boolean; fields?: FormFieldInput[]; // project.form.saved
  answers?: Record<string, string>; // project.form.answered
  // project.request.stepped: the step it adds. case.approval (./approval.ts) uses the same field for the index of the answered step in its run.
  step?: number | RequestStepInput;
};

/** The step a request becomes, with the fields of project.step.added. */
export type RequestStepInput = { stepId: string; text: string; column: StepColumn; ownerUserId?: string | null; dueDay?: number | null; note?: string };
