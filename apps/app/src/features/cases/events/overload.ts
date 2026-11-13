// The overload area's events (plan REG, decision D6; plan OVL, D15): a person's absence, a desk that carries too much, and a seat whose holder left.
// OVL writes here; the composer (../events.ts) is closed. A field that more than one file uses lives in CorePayload in ../events.ts.

/** The overload.* types the app may append, in the order of APP_EVENT_TYPES: the three OVL's own server actions write (D19, D28). */
export const OVERLOAD_EVENT_TYPES = ["person.away", "person.back", "desk.covered"] as const;

/** Every overload.* type, the internal and seed-only ones included. */
export type OverloadAreaEventType =
  | "person.away" // { userId, from, to, awayId, setBy }  from <= to, working-day numbers; awayId = this event's id and setBy = the viewer's user id, both set by the server; no reason, no text
  | "person.back" // { userId, awayId }  ends that span today
  | "desk.covered" // { roleId, seatId }  target = the role id; the seat above appoints a cover seat for the desk (D28)
  | "desk.overloaded" // { roleId, level: 20 | 30, perHolder, holders }  target = the role id; internal: the clock writes it (D26)
  | "desk.cleared" // { roleId }  target = the role id; internal: the clock writes it; also ends the cover
  | "org.seat.vacant"; // { seatId, roleId, userId }  target = the seat id; internal: the directory writes it when a holder leaves (D30); userId = the leaver

// Compile-time: every app type is a member of the area's union.
const _appTypesAreMembers: readonly OverloadAreaEventType[] = OVERLOAD_EVENT_TYPES;
void _appTypesAreMembers;

/**
 * The EventPayload fields only overload events carry. `userId` is the core's. `to` is the core's too (a hand-over's label, a string), so person.away's
 * last day is not declared here: it is read as `unknown` and checked for a whole number where it is used (features/overload/reduce.ts), and a writer
 * builds the payload with a cast. case.handed gains three `why` values written only by OVL ('away' and 'overflow' by the clock, 'takeback' by the
 * take-back action with the actor 'system:cover' and the person in `takenBy`); `why` is a free string, so the case reducer needs no branch for them.
 */
export type OverloadAreaPayload = {
  awayId?: string; // person.away (its own event id), person.back: the span it is about
  from?: number; // person.away: the first away day, a working-day number
  setBy?: string | null; // person.away: the user id of whoever set it, stamped by the server
  roleId?: string; // desk.overloaded, desk.covered, desk.cleared, org.seat.vacant: the desk (a role)
  level?: 20 | 30; // desk.overloaded: the threshold reached (D16, D18)
  perHolder?: number; // desk.overloaded: open work items per present holder when it was written
  holders?: number; // desk.overloaded: how many present holders the desk had
  seatId?: string; // desk.covered: the cover seat; org.seat.vacant: the seat that lost its holder
  takenBy?: string; // case.handed why 'takeback': the user id of the person who took the case back
};
