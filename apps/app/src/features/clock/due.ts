// What has fallen due, as facts still to be stored (CLK/D12). Pure: state and today in, a list out.
// The scheduler (CLK-D1) appends one clock.due event per Due; the reducer reads those events (D11).
// Demo companies get nothing: their reducer escalates at render time.
import { seatsOfRole } from "@/features/auth/identity";
import type { State } from "@/features/cases/reducer";
import type { CaseEvent, EventPayload } from "@/features/cases/events";
import { byClock } from "./actor";
import type { Route } from "@/features/demo/types";
import type { ReducedProject } from "@/features/projects/types";
import { CONFIRM_ESCALATE_DAYS, unconfirmedOf } from "@/features/projects/confirm";

export type DueKind = "deadline" | "checkin" | "start" | "measure" | "handover" | "escalation" | "question" | "unanswered" | "triage" | "confirm" | "lead" | "invite" | "draft";

/** A raise no route owns sits on the fallback desk (features/cases/stamp.ts): after this many working days it is reminded to pass it on (decision Q2.1). */
export const TRIAGE_REMIND_DAYS = 1;

/** A question the raiser has not answered: a reminder after this many working days ... */
export const QUESTION_REMIND_DAYS = 3;
/** ... and after this many the case is open on the desk again, without an answer (decision Q4.3). */
export const QUESTION_RETURN_DAYS = 5;

/** A draft's lead has not answered: a reminder after this many working days ... */
export const LEAD_REMIND_DAYS = 2;
/** ... and after this many the draft goes back to the decider, who becomes the lead (decision D11). */
export const LEAD_RETURN_DAYS = 4;
/** A person invited to a draft has not answered: a reminder after this many working days ... */
export const INVITE_REMIND_DAYS = 2;
/** ... and after this many the invitation lapses and the lead may invite someone else (decision D12). */
export const INVITE_LAPSE_DAYS = 5;
/** A draft past its start day went to the seat above: one more reminder to that seat this many working days later (decision D15). */
export const DRAFT_UP_DAYS = 3;

export type Due = {
  kind: DueKind;
  target: string; // the case or project id
  dueDay: number;
  check?: number; // measure and confirm; draft: DRAFT_UP_DAYS for the second reminder
  toRoleHolderId?: string | null; // the seat the fact escalates to
  why?: "escalation" | "vacant"; // handover only: the second level's hand-over, or off a desk nobody sits at; missing = the deadline's
  /** lead and invite: the person the clock waits for (the lead, the invitee). */
  userId?: string;
  /** lead and invite: the fact that leads to the lapse (the answer the clock writes), not the reminder before it. */
  lapse?: boolean;
  /** invite: the project.invited event, the invitation's identity (Invite.id); a second invitation of the same person is another cycle. */
  inviteId?: string;
  /** lead: the event that asked the lead (the yes, or a project.handed on the draft), so a new ask is a new cycle. */
  askId?: string;
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

/** Has this cycle's fact been written: a clock.due of that kind and day, with the payload fields in `match` (the ask, the invitation), appended at or after history index `since`. */
const hasCycleFact = (history: readonly CaseEvent[], kind: DueKind, dueDay: number, match: Partial<EventPayload>, since = 0, check?: number): boolean =>
  history.some((e, i) => i >= since && e.type === "clock.due" && e.payload.kind === kind && e.payload.dueDay === dueDay && (check === undefined || e.payload.check === check)
    && (Object.keys(match) as (keyof EventPayload)[]).every((k) => e.payload[k] === match[k]) && Boolean(e.payload.lapse) === Boolean(match.lapse));

/**
 * Where a draft's current cycle began, read off its history the way the reducer reads it: the event that asked the lead
 * (the yes, or a hand-over that changed the lead), and the index of the latest event that restarted the start window (a hand-over,
 * the lead's answer, a moved start). Facts before `since` belong to an earlier cycle.
 */
function draftCycle(p: ReducedProject): { askId: string | undefined; since: number; sinceId: string | undefined } {
  let lead: string | null = null;
  let askId: string | undefined;
  let sinceId: string | undefined;
  let since = -1;
  let pending = false;
  p.history.forEach((e, i) => {
    const pl = e.payload;
    if (e.type === "case.decided" && pl.answer === "yes" && askId === undefined) {
      askId = e.id;
      sinceId = e.id;
      lead = pl.leadUserId ?? e.actorUserId ?? null;
      pending = pl.draft === true && lead !== null && lead !== (e.actorUserId ?? null);
    } else if (e.type === "project.handed") {
      const to = pl.toUserId ?? null;
      if (to === null || to === lead) return;
      lead = to;
      askId = e.id;
      sinceId = e.id;
      since = i;
      pending = to !== (e.actorUserId ?? null);
    } else if (e.type === "project.lead.answered" && pending && (pl.askId === undefined || pl.askId === askId)) {
      pending = false;
      if (pl.take !== true) lead = p.deciderUserId;
      sinceId = e.id;
      since = i;
    } else if (e.type === "project.start.moved" && !pending) {
      sinceId = e.id;
      since = i;
    }
  });
  return { askId, since, sinceId };
}

/**
 * The project draft's clock (plan SET, D11, D12, D15): the lead's answer, each invitation's answer, the start day.
 * Every fact belongs to one cycle (the ask, the invitation, the start day), so a new ask, a new invitation or a moved
 * start gets its own deadlines; an old fact of another cycle neither stops nor brings forward the new one. A lapse is the
 * answer the scheduler writes as an event (handovers), a reminder is a fact. Legacy projects (no `draft`) get nothing here.
 */
function draftDue(state: State, today: number, above: SeatAbove, out: Due[], handovers: Due[]): void {
  for (const p of state.projects) {
    if (!p.draft || p.status === "stopped" || p.status === "recognised") continue;
    const planning = p.status === "planning";

    // The lead has not answered. The ask is the latest yes or hand-over on the draft; before the lead takes it there is no start day.
    if (planning && p.leadState === "pending" && p.leadAskedDay !== null) {
      const { askId } = draftCycle(p);
      const key = `clk:lead:${p.id}:${askId ?? "d" + p.leadAskedDay}`;
      const cycle: Partial<EventPayload> = askId === undefined ? {} : { askId };
      const userId = p.leadUserId ?? undefined;
      const remind = p.leadAskedDay + LEAD_REMIND_DAYS;
      const lapse = p.leadAskedDay + LEAD_RETURN_DAYS;
      if (today >= lapse) handovers.push({ kind: "lead", target: p.id, dueDay: lapse, lapse: true, userId, askId, idemKey: `${key}:lapse` });
      else if (today >= remind && !hasCycleFact(p.history, "lead", remind, cycle)) out.push({ kind: "lead", target: p.id, dueDay: remind, userId, askId, idemKey: key });
    }

    // Each invitation that is still open: also after the start (P6.5:add). The invitation's own event is the cycle.
    for (const i of p.invites) {
      if (i.state !== "pending" || i.role === "follower") continue;
      const remind = i.day + INVITE_REMIND_DAYS;
      const lapse = i.day + INVITE_LAPSE_DAYS;
      const key = `clk:invite:${p.id}:${i.id}`;
      if (today >= lapse) handovers.push({ kind: "invite", target: p.id, dueDay: lapse, lapse: true, userId: i.userId, inviteId: i.id, idemKey: `${key}:lapse` });
      else if (today >= remind && !hasCycleFact(p.history, "invite", remind, { inviteId: i.id })) out.push({ kind: "invite", target: p.id, dueDay: remind, userId: i.userId, inviteId: i.id, idemKey: key });
    }

    // Past its start day and not started: the seat above the lead's seat is told, and again DRAFT_UP_DAYS later. Nothing stops.
    // A moved start, a new lead or the lead's answer is a new cycle: only facts after it count, and the key names it.
    if (planning && p.leadState === "taken" && p.startDay !== null && today >= p.startDay) {
      const { since: at, sinceId } = draftCycle(p);
      const moved = at < 0 ? "" : `:m${sinceId}`;
      const leadRole = state.seats.find((s) => s.userId !== null && s.userId === p.leadUserId)?.roleId ?? null;
      const to = leadRole === null ? null : above(leadRole, []);
      const first = p.startDay;
      if (!hasCycleFact(p.history, "draft", first, {}, at + 1, undefined)) out.push({ kind: "draft", target: p.id, dueDay: first, toRoleHolderId: to, idemKey: idemKeyOf("draft", p.id, first) + moved });
      const up = p.startDay + DRAFT_UP_DAYS;
      if (today >= up && !hasCycleFact(p.history, "draft", up, {}, at + 1, DRAFT_UP_DAYS)) {
        out.push({ kind: "draft", target: p.id, dueDay: up, check: DRAFT_UP_DAYS, toRoleHolderId: to, idemKey: idemKeyOf("draft", p.id, up, DRAFT_UP_DAYS) + moved });
      }
    }
  }
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

  // A desk nobody sits at cannot answer (decision Q1.10): the case goes on at once, to the route's other desk
  // (the deputy's, or back to the owner's) when someone sits there, else to the seat above. Once per seat.
  const occupied = (roleId: string) => seatsOfRole(state.seats, roleId).some((s) => s.userId !== null);
  for (const c of state.cases) {
    if ((c.status !== "open" && c.status !== "discussion") || c.assigneeSeatId === null || c.assigneeRoleId === null || occupied(c.assigneeRoleId)) continue;
    const atOwner = c.assigneeRoleId === (c.route?.ownerRoleId ?? null);
    const to = (c.route ? targetSeat(state, c.route, atOwner) : null) ?? above(c.assigneeRoleId, []);
    if (to !== null && to !== c.assigneeSeatId) {
      handovers.push({ kind: "handover", why: "vacant", target: c.id, dueDay: c.dueDay, toRoleHolderId: to, idemKey: `clk:vacant:${c.id}:${c.assigneeSeatId}` });
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
    // A draft's start is the draft kind below (SET/D15), not this one.
    if (!p.draft && p.status === "planning" && p.dueDay !== null && p.dueDay < today && !hasFact(p.history, "start", p.dueDay)) {
      out.push({ kind: "start", target: p.id, dueDay: p.dueDay, toRoleHolderId: targetSeat(state, route, leadIsOwner), idemKey: idemKeyOf("start", p.id, p.dueDay) });
    }
    if (p.status === "measuring") {
      for (const k of p.checks) {
        if (k.measured || k.dueDay >= today || hasFact(p.history, "measure", k.dueDay, k.check)) continue;
        out.push({ kind: "measure", target: p.id, dueDay: k.dueDay, check: k.check, toRoleHolderId: targetSeat(state, route, leadIsOwner), idemKey: idemKeyOf("measure", p.id, k.dueDay, k.check) });
      }
    }
  }
  draftDue(state, today, above, out, handovers);
  // A typed result waits for a second person (decision Q6.15): when its date has passed, one reminder to who may
  // confirm; CONFIRM_ESCALATE_DAYS later the seat above the deputy's desk is asked, once, and may confirm from then.
  for (const p of state.projects) {
    const route = state.routes.find((r) => r.id === p.routeId) ?? null;
    const desk = route?.deputyRoleId ?? route?.ownerRoleId ?? null;
    for (const u of unconfirmedOf(p)) {
      if (u.dueDay < today && !hasFact(p.history, "confirm", u.dueDay, u.check)) {
        out.push({ kind: "confirm", target: p.id, dueDay: u.dueDay, check: u.check, idemKey: idemKeyOf("confirm", p.id, u.dueDay, u.check) });
      }
      const upDay = u.dueDay + CONFIRM_ESCALATE_DAYS;
      if (desk === null || upDay >= today || hasFact(p.history, "confirm", upDay, u.check)) continue;
      // Never the lead's own desk or the desk of who typed the number: they cannot be the second person.
      const own = state.seats.filter((s) => s.userId !== null && (s.userId === p.leadUserId || s.userId === u.measure.byUserId)).map((s) => s.roleId);
      const to = above(desk, own);
      if (to !== null) out.push({ kind: "confirm", target: p.id, dueDay: upDay, check: u.check, toRoleHolderId: to, idemKey: idemKeyOf("confirm", p.id, upDay, u.check) });
    }
  }
  return [...out, ...handovers];
}
