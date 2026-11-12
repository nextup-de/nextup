// The case area of the clock (REG/D9): what falls due on a case. NOR and SEE add their kinds and loops here, never in due.ts.
import { seatsOfRole } from "@/features/auth/identity";
import type { State } from "@/features/cases/reducer";
import type { CaseEvent } from "@/features/cases/events";
import { byClock } from "../actor";
import type { Due, SeatAbove } from "../due";
import { hasFact, idemKeyOf, targetSeat } from "./shared";

// revisit: a no comes back on its day; appeal: the second look is due (check 2: the seat above is brought in); view: an invitee's view is due by the next check-in (plan NOR, D12, D14, D18; the logic is NOR-D1's).
export const CASE_DUE_KINDS = ["deadline", "checkin", "handover", "escalation", "question", "unanswered", "triage", "revisit", "appeal", "view"] as const;
export type CaseDueKind = (typeof CASE_DUE_KINDS)[number];

/** A raise no route owns sits on the fallback desk (features/cases/stamp.ts): after this many working days it is reminded to pass it on (decision Q2.1). */
export const TRIAGE_REMIND_DAYS = 1;

/** A question the raiser has not answered: a reminder after this many working days ... */
export const QUESTION_REMIND_DAYS = 3;
/** ... and after this many the case is open on the desk again, without an answer (decision Q4.3). */
export const QUESTION_RETURN_DAYS = 5;

/** LOOP/D17: the seat of the deadline fact for this day, unless the case was already handed over for it. */
function handoverSeat(history: readonly CaseEvent[], dueDay: number): string | null {
  // FX8: only the clock's own events count, so a hand-over a person labelled "deadline" cannot stop the real one.
  if (history.some((e) => e.type === "case.handed" && e.payload.why === "deadline" && byClock(e))) return null;
  const f = history.find((e) => e.type === "clock.due" && e.payload.kind === "deadline" && e.payload.dueDay === dueDay && byClock(e));
  return f?.payload.toRoleHolderId ?? null;
}

/**
 * The second level (company rule escalation_days): a case still open that many working days after its
 * answer date goes to the seat above the desk that owes the answer, once per case. First the fact, which
 * sends the mails, also when nobody is above; a run later the hand-over to the fact's seat.
 */
function escalation(c: State["cases"][number], days: number, today: number, above: SeatAbove): Due | null {
  if (days <= 0 || c.dueDay + days >= today) return null;
  const fact = c.history.find((e) => e.type === "clock.due" && e.payload.kind === "escalation");
  if (!fact) {
    const desk = c.route?.ownerRoleId ?? c.assigneeRoleId;
    const to = desk ? above(desk, c.assigneeRoleId ? [c.assigneeRoleId] : []) : null;
    return { kind: "escalation", target: c.id, dueDay: c.dueDay, toRoleHolderId: to, idemKey: `clk:escalate:${c.id}` };
  }
  const to = fact.payload.toRoleHolderId ?? null;
  if (to === null || to === c.assigneeSeatId || c.history.some((e) => e.type === "case.handed" && e.payload.why === "escalation")) return null;
  return { kind: "handover", why: "escalation", target: c.id, dueDay: c.dueDay, toRoleHolderId: to, idemKey: `clk:escalate:${c.id}:handover` };
}

/** True for the Dues that go behind every fact: the hand-overs and the unanswered return (they are events, not facts). */
export const caseAfterFacts = (d: Due): boolean => d.kind === "handover" || d.kind === "unanswered";

/** Everything that falls due on a case, in the order the loops ran in dueNow. */
export function caseDues(state: State, today: number, above: SeatAbove): Due[] {
  const out: Due[] = [];

  for (const c of state.cases) {
    // A case without a route has a deadline like any other once it sits on a desk; on no desk there is nobody to tell.
    if (!c.open || c.dueDay >= today || (c.route === null && c.assigneeSeatId === null)) continue;
    const talk = c.status === "discussion" ? c.discussion : null;
    if (talk && !talk.ready) {
      if (!hasFact(c.history, "checkin", c.dueDay)) out.push({ kind: "checkin", target: c.id, dueDay: c.dueDay, idemKey: idemKeyOf("checkin", c.id, c.dueDay) });
      continue;
    }
    if (hasFact(c.history, "deadline", c.dueDay)) {
      // The first level comes first; once the second has started, the deputy no longer takes the case.
      const second = c.history.some((e) => e.type === "clock.due" && e.payload.kind === "escalation");
      const to = state.rules.deadlineHandover && c.status === "open" && !second ? handoverSeat(c.history, c.dueDay) : null;
      const up = to ? null : escalation(c, state.rules.escalationDays, today, above);
      if (to) out.push({ kind: "handover", target: c.id, dueDay: c.dueDay, toRoleHolderId: to, idemKey: `clk:handover:${c.id}` });
      else if (up) out.push(up);
      continue;
    }
    const atOwner = c.assigneeRoleId !== null && c.assigneeRoleId === (c.route?.ownerRoleId ?? null);
    out.push({ kind: "deadline", target: c.id, dueDay: c.dueDay, toRoleHolderId: targetSeat(state, c.route, atOwner), idemKey: idemKeyOf("deadline", c.id, c.dueDay) });
  }

  // A desk nobody sits at cannot answer (decision Q1.10): the case goes on at once, to the route's other desk
  // (the deputy's, or back to the owner's) when someone sits there, else to the seat above. Once per seat.
  const occupied = (roleId: string) => seatsOfRole(state.seats, roleId).some((s) => s.userId !== null);
  for (const c of state.cases) {
    if ((c.status !== "open" && c.status !== "discussion") || c.assigneeSeatId === null || c.assigneeRoleId === null || occupied(c.assigneeRoleId)) continue;
    const atOwner = c.assigneeRoleId === (c.route?.ownerRoleId ?? null);
    const to = (c.route ? targetSeat(state, c.route, atOwner) : null) ?? above(c.assigneeRoleId, []);
    if (to !== null && to !== c.assigneeSeatId) {
      out.push({ kind: "handover", why: "vacant", target: c.id, dueDay: c.dueDay, toRoleHolderId: to, idemKey: `clk:vacant:${c.id}:${c.assigneeSeatId}` });
    }
  }

  // A raise without a route waits on the fallback desk to be passed on: one reminder to that desk, while it
  // has neither a route (a manager's case.override gives it one) nor a hand-over.
  for (const c of state.cases) {
    if (c.status !== "open" || c.route !== null || c.assigneeSeatId === null || c.handed.length > 0) continue;
    const due = c.raisedDay + TRIAGE_REMIND_DAYS;
    if (today >= due && !hasFact(c.history, "triage", due)) out.push({ kind: "triage", target: c.id, dueDay: due, idemKey: idemKeyOf("triage", c.id, due) });
  }

  // A question nobody answers must not pause a case for ever: one reminder to the raiser, then the case goes
  // back to the desk as open (the scheduler writes case.unanswered) and its answer date runs again.
  for (const c of state.cases) {
    const q = c.status === "asked" ? c.question : null;
    if (!q || q.answer) continue;
    const waited = today - q.day;
    if (waited >= QUESTION_RETURN_DAYS) {
      out.push({ kind: "unanswered", target: c.id, dueDay: q.day + QUESTION_RETURN_DAYS, idemKey: idemKeyOf("unanswered", c.id, q.day) });
    } else if (waited >= QUESTION_REMIND_DAYS && !hasFact(c.history, "question", q.day + QUESTION_REMIND_DAYS)) {
      out.push({ kind: "question", target: c.id, dueDay: q.day + QUESTION_REMIND_DAYS, idemKey: idemKeyOf("question", c.id, q.day) });
    }
  }
  return out;
}
