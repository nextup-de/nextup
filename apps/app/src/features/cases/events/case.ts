// The case area's events (plan REG, decision D8): every case.* type, the app list of them, and the payload fields
// only case events carry. NOR and SEE write here; the composer (../events.ts) is closed. A field that more than one
// file uses (why, to, text, note, title, ...) lives in CorePayload in ../events.ts. Types only come from the composer.
import type { NoCategory } from "../no";
import type { RouteProposal, Visibility } from "../events";

/** The case.* types the app may append, in the order of APP_EVENT_TYPES. case.unanswered, case.building and case.shipped are not here: see CaseAreaEventType. */
export const CASE_EVENT_TYPES = [
  "case.raised", "case.read", "case.decided", "case.handed", "case.asked", "case.answered", "case.override",
  "case.affected", "case.unaffected", "case.commented", "case.discussion", "case.invited", "case.revised",
  "case.checkin", "case.withdrawn", "case.reopened", "case.appealed", "case.appeal.decided", "case.invite.declined",
] as const;

/** Every case.* type, with the fields it carries; the app list above plus the internal case.unanswered (the clock's) and the seed-only case.building and case.shipped. */
export type CaseAreaEventType =
  | "case.raised" // { title, body, routeId, assignee, assigneeRoleHolderId?, fromDept, kind?, reason?, upside?, affected?, attachments?, proposal?, visibility?, seenBy? }
  | "case.read" // -
  | "case.decided" // yes: { answer: 'yes', note?, projectId?, lead?, leadUserId?, title?, draft?, raiserNote? }  a yes with projectId opens (or joins) that project; draft: true opens it as a draft (plan SET, D8). no: { answer: 'no', category, reason, changeIf?, revisitDay?, duplicateOf? } (plan NOR, D17); an old no carries the picked id in `reason` and the text in `note`
  | "case.discussion" // { invited, invitedUserIds?, missing }  "Discuss first": round 1 starts (docs/plans/2026-10-15_idea-to-project.md)
  | "case.invited" // { invited, invitedUserIds? }  more people asked for their view
  | "case.revised" // { body, title?, overall? }  the raiser's next version; the reducer numbers it
  | "case.checkin" // { next: 'round'|'decide', open, note }  ends a round
  | "case.handed" // { to, toRoleHolderId?, why?, back?, up?, routeId?, dueDay?, keepsQuestion? }  a pass; back: Not mine, to the seat it came from; up: Send up, to the seat above; routeId: the route moves with it; dueDay: the new desk's answer date floor; keepsQuestion: an open question stays (plan NOR, D13)
  | "case.asked" // { text }
  | "case.answered" // { text }
  | "case.withdrawn" // { note? }  the raiser takes back an idea nobody decided yet (decision Q1.14): archived, no decision
  | "case.reopened" // { why: 'revisit'|'stopped', dueDay?, toRoleHolderId? }  the case is open on a desk again (plan NOR, D12). revisit: only the clock writes it, on the revisit day of a no. stopped: written by RES when a stopped project's idea goes back (D16). A second look that is not upheld reopens the case through case.appeal.decided, not through this event
  | "case.appealed" // { text, toRoleHolderId? }  the raiser asks for a second look at a no, once per case (D18); the server sets the desk (toRoleHolderId)
  | "case.appeal.decided" // { uphold, reason }  the second look's answer: uphold true keeps the no, final; uphold false reopens the case (D18)
  | "case.invite.declined" // { why? }  an invited person says the discussion is not for them: off the list, no view item (D14)
  | "case.unanswered" // {}  the raiser did not answer in time: the case is open on the desk again. internal: only the scheduler appends it, as actor system:clock (features/clock/due.ts)
  | "case.building" // { days, expected? }            (seed history)
  | "case.shipped" // { outcome, outcomeNote }        (seed history)
  | "case.override" // { proposed, chosen }  (route ids)
  | "case.affected" // { why? }  the actor says the problem hits them too - a lead says why (read from the log by selectors; the reducer ignores it)
  | "case.unaffected" // - withdraws that
  | "case.commented"; // { text, rescore? }  rescore: the text is new information and corrects the score

// Compile-time: every app type is a member of the area's union.
const _appTypesAreMembers: readonly CaseAreaEventType[] = CASE_EVENT_TYPES;
void _appTypesAreMembers;

/** The EventPayload fields only case events carry. */
export type CaseAreaPayload = {
  body?: string; assignee?: string; fromDept?: string; upside?: string; // case.raised, case.revised (body)
  answer?: "yes" | "no"; // case.decided
  days?: number; expected?: string; // case.building (seed history)
  outcome?: string; outcomeNote?: string; // case.shipped (seed history)
  proposed?: string | null; chosen?: string; // case.override (route ids)
  affected?: string[]; // names the raiser says are hit by the problem too
  attachments?: number; // screenshots attached when raised (the files stay in the browser; only the count is a fact)
  rescore?: boolean; // on case.commented: the comment is new information, the score is re-evaluated with it
  channel?: "mail" | "teams"; // on case.commented by system:mail: what carried the raise notice (none on notes before 9 Nov: mail)
  proposal?: RouteProposal; // on case.raised
  visibility?: Visibility; // on case.raised
  asName?: boolean; // on case.raised: a member posted it by name instead of their handle (decision Q1.7); the server keeps it only when it took effect
  seenBy?: string[]; // on case.raised with visibility "custom": people and department names (shown, never compared)
  seenByUserIds?: string[]; // on case.raised with visibility "custom": the picked people by user id (VIS/D10)
  seenByUnitIds?: string[]; // on case.raised with visibility "custom": the picked departments by org unit id (VIS/D10)
  // The discussion stage
  invited?: string[]; // case.discussion, case.invited: names
  missing?: string; // case.discussion: what is still missing, in the desk holder's words
  overall?: number; // case.revised: the benchmark score of the new version, 0-100
  next?: "round" | "decide"; // case.checkin
  open?: string[]; // case.checkin: the points still open (dial names or short notes)
  // Ids next to the labels above (IDN/D5)
  assigneeRoleHolderId?: string | null; // case.raised: the seat it lands on
  invitedUserIds?: string[]; // case.discussion, case.invited
  // The project draft (plan SET): a yes that opens a project is a case event
  draft?: boolean; // case.decided yes: opens a draft (D8)
  raiserNote?: string; // case.decided yes: one line to the raiser (D10)
  // The reasoned no (plan NOR)
  category?: NoCategory; // case.decided no: why not (D17); reason is the text
  changeIf?: string; // case.decided no: what would make it a yes, up to 400 characters
  revisitDay?: number; // case.decided no: the working day it comes back (not-now: required)
  duplicateOf?: string; // case.decided no, category duplicate: the case or project it is a duplicate of
  back?: boolean; // case.handed: Not mine, back to the seat it came from
  up?: boolean; // case.handed: Send up, to the seat above
  keepsQuestion?: boolean; // case.handed: the open question stays open for the new holder
  uphold?: boolean; // case.appeal.decided: true keeps the no, false reopens the case
};
