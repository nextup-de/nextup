// The case area's events (plan REG, decision D8): every case.* type, the app list of them, and the payload fields
// only case events carry. NOR and SEE write here; the composer (../events.ts) is closed. A field that more than one
// file uses (why, to, text, note, title, ...) lives in CorePayload in ../events.ts. Types only come from the composer.
import type { RouteProposal, Visibility } from "../events";

/** The case.* types the app may append, in the order of APP_EVENT_TYPES. case.unanswered, case.building and case.shipped are not here: see CaseAreaEventType. */
export const CASE_EVENT_TYPES = [
  "case.raised", "case.read", "case.decided", "case.handed", "case.asked", "case.answered", "case.override",
  "case.affected", "case.unaffected", "case.commented", "case.discussion", "case.invited", "case.revised",
  "case.checkin", "case.withdrawn",
] as const;

/** Every case.* type, with the fields it carries; the app list above plus the internal case.unanswered (the clock's) and the seed-only case.building and case.shipped. */
export type CaseAreaEventType =
  | "case.raised" // { title, body, routeId, assignee, assigneeRoleHolderId?, fromDept, kind?, reason?, upside?, affected?, attachments?, proposal?, visibility?, seenBy? }
  | "case.read" // -
  | "case.decided" // { answer: 'yes'|'no', reason?, note?, projectId?, lead?, leadUserId?, title?, draft?, raiserNote? }  a yes with projectId opens (or joins) that project; draft: true opens it as a draft (plan SET, D8)
  | "case.discussion" // { invited, invitedUserIds?, missing }  "Discuss first": round 1 starts (docs/plans/2026-10-15_idea-to-project.md)
  | "case.invited" // { invited, invitedUserIds? }  more people asked for their view
  | "case.revised" // { body, title?, overall? }  the raiser's next version; the reducer numbers it
  | "case.checkin" // { next: 'round'|'decide', open, note }  ends a round
  | "case.handed" // { to, toRoleHolderId?, why? }
  | "case.asked" // { text }
  | "case.answered" // { text }
  | "case.withdrawn" // { note? }  the raiser takes back an idea nobody decided yet (decision Q1.14): archived, no decision
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
};
