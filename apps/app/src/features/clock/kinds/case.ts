// The case area of the clock (REG/D9): what falls due on a case. NOR and SEE add their kinds and loops here, never in due.ts.
import { seatsOfRole } from "@/features/auth/identity";
import type { State } from "@/features/cases/reducer";
import { cycleEvents, decidedThisCycle, decisionKey } from "@/features/cases/no";
import { byClock } from "../actor";
import type { Due, SeatAbove } from "../due";
import { idemKeyOf, targetSeat } from "./shared";

type ReducedCase = State["cases"][number];

// revisit: a no comes back on its day; appeal: the second look is due (check 2: the seat above is brought in); view: an invitee's view is due by the next check-in (plan NOR, D12, D14, D18; the logic is NOR-D1's).
export const CASE_DUE_KINDS = ["deadline", "checkin", "handover", "escalation", "question", "unanswered", "triage", "revisit", "appeal", "view"] as const;
export type CaseDueKind = (typeof CASE_DUE_KINDS)[number];

/** A raise no route owns sits on the fallback desk (features/cases/stamp.ts): after this many working days it is reminded to pass it on (decision Q2.1). */
export const TRIAGE_REMIND_DAYS = 1;

/** A question the raiser has not answered: a reminder after this many working days ... */
export const QUESTION_REMIND_DAYS = 3;
/** ... and after this many the case is open on the desk again, without an answer (decision Q4.3). */
export const QUESTION_RETURN_DAYS = 5;

/**
 * Company values the reduced State does not carry; the scheduler passes them from the company's seed (plan NOR, NOR-D1). A caller without a company
 * (a unit test) passes none: the answer length is then the reducer's own default and a gone route has no fallback desk.
 */
export type CaseClockExtra = {
  /** The company's answer length in working days (seed.promiseDays): a second look is due this long after it was asked. */
  promiseDays?: number;
  /** The fallback desk of the company's org chart (features/cases/stamp.ts fallbackSeat): where a revisit goes when its route is gone; null when there is none. */
  fallbackSeatId?: string | null;
};
/** The reducer's answer length when a company has none (reducer.ts). */
const DEFAULT_PROMISE_DAYS = 5;

/** The case's cycle: how often it was reopened (D24). Cycle 0 is the case as it was before NOR, with today's keys. */
export const cycleOf = (c: Pick<ReducedCase, "reopens">): number => c.reopens.length;
/** A per-case key gets the cycle appended from cycle 1 on, so a reopened case's facts are new ones and cycle 0 keeps today's keys. */
const cycleKey = (key: string, c: Pick<ReducedCase, "reopens">): string => (cycleOf(c) === 0 ? key : `${key}:${cycleOf(c)}`);

/**
 * Has this cycle's fact been written: a clock.due of that kind, day and check (none = a fact without a check) after the case's latest reopen,
 * by event order, so a fact of an earlier cycle never stands for this one, also on the day of the reopen (D24). Replaces due.ts hasFact for the case area.
 */
export function hasCycleFact(c: Pick<ReducedCase, "history" | "reopenSeq">, kind: Due["kind"], dueDay: number, check?: number): boolean {
  return cycleEvents(c).some((e) => e.type === "clock.due" && e.payload.kind === kind && e.payload.dueDay === dueDay && e.payload.check === check);
}

/** LOOP/D17: the seat of the deadline fact for this day, unless the case was already handed over for it in this cycle (D24). */
function handoverSeat(c: Pick<ReducedCase, "history" | "reopenSeq">, dueDay: number): string | null {
  const history = cycleEvents(c);
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
function escalation(c: ReducedCase, days: number, today: number, above: SeatAbove): Due | null {
  if (days <= 0 || c.dueDay + days >= today) return null;
  // Only this cycle's facts count (D24): a reopened case is escalated again from its new answer date.
  const history = cycleEvents(c);
  const fact = history.find((e) => e.type === "clock.due" && e.payload.kind === "escalation");
  if (!fact) {
    const desk = c.route?.ownerRoleId ?? c.assigneeRoleId;
    const to = desk ? above(desk, c.assigneeRoleId ? [c.assigneeRoleId] : []) : null;
    return { kind: "escalation", target: c.id, dueDay: c.dueDay, toRoleHolderId: to, idemKey: cycleKey(`clk:escalate:${c.id}`, c) };
  }
  const to = fact.payload.toRoleHolderId ?? null;
  if (to === null || to === c.assigneeSeatId || history.some((e) => e.type === "case.handed" && e.payload.why === "escalation")) return null;
  return { kind: "handover", why: "escalation", target: c.id, dueDay: c.dueDay, toRoleHolderId: to, idemKey: cycleKey(`clk:escalate:${c.id}:handover`, c) };
}

/** The seat a revisit reopens the case on: the route owner's first occupied seat, else the org's fallback desk (D12), else nobody (the reducer then picks the desk). */
function revisitSeat(state: State, c: ReducedCase, extra: CaseClockExtra): string | null {
  return targetSeat(state, c.route, false) ?? extra.fallbackSeatId ?? null;
}

/** Invitees (user ids) with no view in the round that is under way: neither a comment since it began nor a decline since they were last asked (D14). */
function outstandingViews(c: ReducedCase): string[] {
  const talk = c.discussion;
  if (!talk) return [];
  const h = c.history;
  // The round began at the latest check-in, else with the discussion itself.
  const roundStart = Math.max(h.findLastIndex((e) => e.type === "case.checkin"), h.findLastIndex((e) => e.type === "case.discussion"));
  return talk.invitedUserIds.filter((u) => {
    const asked = h.findLastIndex((e) => (e.type === "case.discussion" || e.type === "case.invited") && (e.payload.invitedUserIds ?? []).includes(u));
    const declined = h.findLastIndex((e) => e.type === "case.invite.declined" && e.actorUserId === u) > asked;
    const commented = h.some((e, i) => i > roundStart && e.type === "case.commented" && e.actorUserId === u);
    return !declined && !commented;
  });
}

/** True for the Dues that go behind every fact: the hand-overs, the unanswered return and the revisit (they are events, not facts). */
export const caseAfterFacts = (d: Due): boolean => d.kind === "handover" || d.kind === "unanswered" || d.kind === "revisit";

/** Everything that falls due on a case, in the order the loops ran in dueNow. */
export function caseDues(state: State, today: number, above: SeatAbove, extra: CaseClockExtra = {}): Due[] {
  const out: Due[] = [];

  for (const c of state.cases) {
    // A case without a route has a deadline like any other once it sits on a desk; on no desk there is nobody to tell.
    if (!c.open || c.dueDay >= today || (c.route === null && c.assigneeSeatId === null)) continue;
    const talk = c.status === "discussion" ? c.discussion : null;
    if (talk && !talk.ready) {
      if (!hasCycleFact(c, "checkin", c.dueDay)) out.push({ kind: "checkin", target: c.id, dueDay: c.dueDay, idemKey: idemKeyOf("checkin", c.id, c.dueDay) });
      // No check-in came escalation_days after its day: the case is handled like a late answer from then on (D11, D19), at exactly that day.
      if (state.rules.escalationDays <= 0 || today < c.dueDay + state.rules.escalationDays) continue;
    }
    if (hasCycleFact(c, "deadline", c.dueDay)) {
      // The first level comes first; once the second has started, the deputy no longer takes the case.
      const second = cycleEvents(c).some((e) => e.type === "clock.due" && e.payload.kind === "escalation");
      const to = state.rules.deadlineHandover && !second ? handoverSeat(c, c.dueDay) : null;
      const up = to ? null : escalation(c, state.rules.escalationDays, today, above);
      if (to) out.push({ kind: "handover", target: c.id, dueDay: c.dueDay, toRoleHolderId: to, idemKey: cycleKey(`clk:handover:${c.id}`, c) });
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
    if (today >= due && !hasCycleFact(c, "triage", due)) out.push({ kind: "triage", target: c.id, dueDay: due, idemKey: idemKeyOf("triage", c.id, due) });
  }

  // A question nobody answers must not pause a case for ever: one reminder to the raiser, then the case goes
  // back to the desk as open (the scheduler writes case.unanswered) and its answer date runs again. The days are the
  // company's question_days (D23); the reminder stays at 3 working days, or one day before the return when that is earlier.
  const questionDays = state.rules.questionDays;
  const remindDays = Math.min(QUESTION_REMIND_DAYS, questionDays - 1);
  for (const c of state.cases) {
    const q = c.status === "asked" ? c.question : null;
    if (!q || q.answer) continue;
    const waited = today - q.day;
    if (waited >= questionDays) {
      out.push({ kind: "unanswered", target: c.id, dueDay: q.day + questionDays, idemKey: idemKeyOf("unanswered", c.id, q.day) });
    } else if (waited >= remindDays && !hasCycleFact(c, "question", q.day + remindDays)) {
      out.push({ kind: "question", target: c.id, dueDay: q.day + remindDays, idemKey: idemKeyOf("question", c.id, q.day) });
    }
  }

  // A not-now comes back on its day (D12): the clock writes case.reopened itself, once per decision (its place in the history, never its day).
  for (const c of state.cases) {
    const d = c.decided;
    if (d === null || d.answer !== "no" || d.revisitDay === null || d.revisitDay > today || !decidedThisCycle(c)) continue;
    out.push({ kind: "revisit", target: c.id, dueDay: d.revisitDay, toRoleHolderId: revisitSeat(state, c, extra), idemKey: `clk:revisit:${decisionKey(c)}:${cycleOf(c)}` });
  }

  // A second look nobody answered (D18): the desk is reminded when the answer is due, the seat above escalation_days later.
  const promise = extra.promiseDays ?? DEFAULT_PROMISE_DAYS;
  const days = state.rules.escalationDays;
  for (const c of state.cases) {
    const a = c.appeal;
    if (a === null || a.decided !== null || c.decided?.answer !== "no") continue;
    const first = a.day + promise;
    if (today >= first && !hasCycleFact(c, "appeal", first)) out.push({ kind: "appeal", target: c.id, dueDay: first, toRoleHolderId: a.seatId, idemKey: idemKeyOf("appeal", c.id, first) });
    const second = first + days;
    if (days > 0 && today >= second && !hasCycleFact(c, "appeal", second, 2)) {
      const roleOf = (seatId: string | null) => (seatId === null ? null : state.seats.find((s) => s.id === seatId)?.roleId ?? null);
      const desk = roleOf(a.seatId) ?? c.route?.deputyRoleId ?? null;
      const noSayer = c.decided?.byUserId ?? null;
      const skip = [...new Set(state.seats.filter((s) => noSayer !== null && s.userId === noSayer).map((s) => s.roleId))];
      out.push({ kind: "appeal", target: c.id, dueDay: second, check: 2, toRoleHolderId: desk === null ? null : above(desk, skip), idemKey: idemKeyOf("appeal", c.id, second, 2) });
    }
  }

  // An invitee's view is due by the next check-in (D14): one fact on the working day before it, once per check-in day, while someone has neither commented in the round nor declined.
  for (const c of state.cases) {
    const talk = c.status === "discussion" ? c.discussion : null;
    if (!c.open || !talk || talk.ready || today < c.dueDay - 1 || today > c.dueDay) continue;
    if (!hasCycleFact(c, "view", c.dueDay) && outstandingViews(c).length > 0) out.push({ kind: "view", target: c.id, dueDay: c.dueDay, idemKey: idemKeyOf("view", c.id, c.dueDay) });
  }
  return out;
}
