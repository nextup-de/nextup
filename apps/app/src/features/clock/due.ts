// What has fallen due, as facts still to be stored (CLK/D12). Pure: state and today in, a list out.
// The scheduler (CLK-D1) appends one clock.due event per Due; the reducer reads those events (D11).
// Demo companies get nothing: their reducer escalates at render time.
import { seatsOfRole } from "@/features/auth/identity";
import type { State } from "@/features/cases/reducer";
import type { CaseEvent } from "@/features/cases/events";
import { byClock } from "./actor";
import type { Route } from "@/features/demo/types";

export type DueKind = "deadline" | "checkin" | "start" | "measure" | "handover" | "escalation" | "question" | "unanswered" | "triage";

/** A raise no route owns sits on the fallback desk (features/cases/stamp.ts): after this many working days it is reminded to pass it on (decision Q2.1). */
export const TRIAGE_REMIND_DAYS = 1;

/** A question the raiser has not answered: a reminder after this many working days ... */
export const QUESTION_REMIND_DAYS = 3;
/** ... and after this many the case is open on the desk again, without an answer (decision Q4.3). */
export const QUESTION_RETURN_DAYS = 5;

export type Due = {
  kind: DueKind;
  target: string; // the case or project id
  dueDay: number;
  check?: number; // measure only
  toRoleHolderId?: string | null; // the seat the fact escalates to
  why?: "escalation"; // handover only: the second level's hand-over; missing = the deadline's
  idemKey: string;
};

/** The seat above a desk's role, not counting the roles in `skip`; null when nobody is above (features/knowledge seatAbove). */
export type SeatAbove = (roleId: string, skip: readonly string[]) => string | null;

const idemKeyOf = (kind: DueKind, target: string, dueDay: number, check?: number): string =>
  `clk:${kind}:${target}:${dueDay}` + (check === undefined ? "" : `:${check}`);

const hasFact = (history: readonly CaseEvent[], kind: DueKind, dueDay: number, check?: number): boolean =>
  history.some((e) => e.type === "clock.due" && e.payload.kind === kind && e.payload.dueDay === dueDay && (check === undefined || e.payload.check === check));

/** IDN/D8: the deputy role when the holder sits with the owner's role, else the owner role; its first seat with someone on it. */
function targetSeat(state: State, route: Route | null, atOwner: boolean): string | null {
  const roleId = route ? (atOwner ? route.deputyRoleId : route.ownerRoleId) ?? null : null;
  return roleId === null ? null : seatsOfRole(state.seats, roleId).find((s) => s.userId !== null)?.id ?? null;
}

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

export function dueNow(state: State, today: number, above: SeatAbove = () => null): Due[] {
  if (state.clock.mode !== "workdays") return [];
  const out: Due[] = [];
  const handovers: Due[] = []; // listed after every fact

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
      if (to) handovers.push({ kind: "handover", target: c.id, dueDay: c.dueDay, toRoleHolderId: to, idemKey: `clk:handover:${c.id}` });
      else if (up) (up.kind === "handover" ? handovers : out).push(up);
      continue;
    }
    const atOwner = c.assigneeRoleId !== null && c.assigneeRoleId === (c.route?.ownerRoleId ?? null);
    out.push({ kind: "deadline", target: c.id, dueDay: c.dueDay, toRoleHolderId: targetSeat(state, c.route, atOwner), idemKey: idemKeyOf("deadline", c.id, c.dueDay) });
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
      handovers.push({ kind: "unanswered", target: c.id, dueDay: q.day + QUESTION_RETURN_DAYS, idemKey: idemKeyOf("unanswered", c.id, q.day) });
    } else if (waited >= QUESTION_REMIND_DAYS && !hasFact(c.history, "question", q.day + QUESTION_REMIND_DAYS)) {
      out.push({ kind: "question", target: c.id, dueDay: q.day + QUESTION_REMIND_DAYS, idemKey: idemKeyOf("question", c.id, q.day) });
    }
  }

  for (const p of state.projects) {
    const route = state.routes.find((r) => r.id === p.routeId) ?? null;
    // The lead is the route owner when the owner seat's user is the lead's user (by id, as the reducer does).
    const ownerUser = route?.ownerSeatId ? state.seats.find((s) => s.id === route.ownerSeatId)?.userId ?? null : null;
    const leadIsOwner = p.leadUserId !== null && ownerUser === p.leadUserId;
    if (route === null) continue;
    if (p.status === "planning" && p.dueDay !== null && p.dueDay < today && !hasFact(p.history, "start", p.dueDay)) {
      out.push({ kind: "start", target: p.id, dueDay: p.dueDay, toRoleHolderId: targetSeat(state, route, leadIsOwner), idemKey: idemKeyOf("start", p.id, p.dueDay) });
    }
    if (p.status === "measuring") {
      for (const k of p.checks) {
        if (k.measured || k.dueDay >= today || hasFact(p.history, "measure", k.dueDay, k.check)) continue;
        out.push({ kind: "measure", target: p.id, dueDay: k.dueDay, check: k.check, toRoleHolderId: targetSeat(state, route, leadIsOwner), idemKey: idemKeyOf("measure", p.id, k.dueDay, k.check) });
      }
    }
  }
  return [...out, ...handovers];
}
