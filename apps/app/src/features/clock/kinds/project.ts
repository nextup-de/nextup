// The project area of the clock (REG/D9): what falls due on a project, a project draft included (plan SET). MOV and RES add their
// kinds and loops here, never in due.ts.
import type { State } from "@/features/cases/reducer";
import type { CaseEvent, EventPayload } from "@/features/cases/events";
import { CONFIRM_ESCALATE_DAYS, unconfirmedOf } from "@/features/projects/confirm";
import { checkInDayOf, previousCheckInDayOf } from "@/features/projects/rhythm";
import type { ReducedProject } from "@/features/projects/types";
import type { Due, DueKind, SeatAbove } from "../due";
import { hasFact, idemKeyOf, targetSeat } from "./shared";

export const PROJECT_DUE_KINDS = ["start", "measure", "confirm", "lead", "invite", "draft", "late", "blocked", "quiet", "stalled", "update", "vacant"] as const;
export type ProjectDueKind = (typeof PROJECT_DUE_KINDS)[number];

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

// A project that keeps moving (plan MOV, D27): working days, the logic is MOV-D1's.
/** A step is late for its lead this many working days after its due day. */
export const LATE_LEAD_DAYS = 2;
/** A running project with no activity for this many working days: a reminder to the lead (D12). */
export const QUIET_DAYS = 5;
/** Still nothing this many working days after the quiet fact: the sponsor's desk (D12). */
export const STALLED_DAYS = 3;
/** No weekly update this many working days after the check-in day: one reminder to the lead (D21). */
export const UPDATE_REMIND_DAYS = 2;
/** Still no lead this many working days after project.lead.vacated (D14). */
export const VACANT_DAYS = 5;
/** A pause lasts at most this many working days (D20). */
export const PAUSE_MAX_DAYS = 20;
/** A started project without a goal date is done by this many working days after its start (D19). */
export const DONE_BY_DEFAULT_DAYS = 30;
/** A step on Blocked tells the lead after this many working days when the company set no blocked_days (D18). */
export const BLOCKED_DAYS_DEFAULT = 3;

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
 * answer the scheduler writes as an event (projectAfterFacts puts it behind the facts), a reminder is a fact. Legacy projects (no `draft`) get nothing here.
 */
function draftDue(state: State, today: number, above: SeatAbove, out: Due[]): void {
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
      if (today >= lapse) out.push({ kind: "lead", target: p.id, dueDay: lapse, lapse: true, userId, askId, idemKey: `${key}:lapse` });
      else if (today >= remind && !hasCycleFact(p.history, "lead", remind, cycle)) out.push({ kind: "lead", target: p.id, dueDay: remind, userId, askId, idemKey: key });
    }

    // Each invitation that is still open: also after the start (P6.5:add). The invitation's own event is the cycle.
    for (const i of p.invites) {
      if (i.state !== "pending" || i.role === "follower") continue;
      const remind = i.day + INVITE_REMIND_DAYS;
      const lapse = i.day + INVITE_LAPSE_DAYS;
      const key = `clk:invite:${p.id}:${i.id}`;
      if (today >= lapse) out.push({ kind: "invite", target: p.id, dueDay: lapse, lapse: true, userId: i.userId, inviteId: i.id, idemKey: `${key}:lapse` });
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

/** True for the Dues that go behind every fact: the lapses of a lead and of an invitation (they are events, not facts). */
export const projectAfterFacts = (d: Due): boolean => d.lapse === true;

// ── A project that keeps moving (plan MOV, D11 D12 D14 D18 D20 D21 D26 D27 D29) ──

/** The idempotency key of a MOV fact: `clk:<kind>:<target>:<dueDay>[:<check>][:<stepId>][:<originEventId>]`. Pre-MOV keys stay as idemKeyOf makes them. */
export const projectIdemKey = (kind: DueKind, target: string, dueDay: number, check?: number, stepId?: string, originEventId?: string): string =>
  idemKeyOf(kind, target, dueDay, check, stepId) + (originEventId === undefined ? "" : `:${originEventId}`);

/** Is this MOV fact stored: a clock.due of that kind and day whose check, step and origin event are exactly the ones given (none given: none stored). */
export const hasProjectFact = (p: Pick<ReducedProject, "history">, kind: DueKind, dueDay: number, check?: number, stepId?: string, originEventId?: string): boolean =>
  p.history.some((e) => e.type === "clock.due" && e.payload.kind === kind && e.payload.dueDay === dueDay
    && e.payload.check === check && e.payload.stepId === stepId && e.payload.originEventId === originEventId);

/** The id of the latest event of this type on the project that satisfies `by`: the occurrence a repeatable fact belongs to. */
const lastEventId = (p: Pick<ReducedProject, "history">, type: CaseEvent["type"], by: (e: CaseEvent) => boolean = () => true): string | undefined =>
  p.history.findLast((e) => e.type === type && by(e))?.id;

/**
 * A running project: started, not done, not stopped (D12). The facts below look at no other. A start before working day 1 is a
 * demo seed's history (a company made from the template carries it): it has no check-in and nobody to remind.
 */
const running = (p: ReducedProject): boolean => p.status === "running" && typeof p.startedDay === "number" && p.startedDay >= 1;

/** Paused on this working day (D20): the pause's last day is still part of it. */
const pausedOn = (p: ReducedProject, today: number): boolean => p.pausedUntil !== null && today <= p.pausedUntil;

/** The seat a project's second-level facts go to: the route owner role's first occupied seat, else the deputy's (the seat rule of the start clock). */
const deskSeat = (state: State, p: ReducedProject): string | null => {
  const route = state.routes.find((r) => r.id === p.routeId) ?? null;
  return targetSeat(state, route, false) ?? targetSeat(state, route, true);
};

/** The lead holds the route's owner role by user id (the reducer's rule): then the deputy's desk is the one above. */
const leadHoldsOwner = (state: State, p: ReducedProject): boolean => {
  const route = state.routes.find((r) => r.id === p.routeId) ?? null;
  const ownerUser = route?.ownerSeatId ? state.seats.find((s) => s.id === route.ownerSeatId)?.userId ?? null : null;
  return p.leadUserId !== null && ownerUser === p.leadUserId;
};

/** The day the quiet count starts from: the latest activity (D12), MOV's release day, the day after a pause that ran out. An early resume is an activity of its own. */
const quietBase = (p: ReducedProject, since: number): number =>
  Math.max(p.lastActivityDay ?? p.startedDay ?? 0, since, p.pausedUntil !== null ? p.pausedUntil + 1 : 0);

/** The done-by date the quiet clock watches: the project's own, else the default after its start (D19). */
const doneByOf = (p: ReducedProject): number | null => p.doneBy ?? (p.startedDay !== null ? p.startedDay + DONE_BY_DEFAULT_DAYS : null);

/** Late steps (D11): the owner (else the lead) the day after the due day, the lead 2 working days later; with no lead only the owner. */
function lateDues(state: State, today: number, since: number, out: Due[]): void {
  for (const p of state.projects) {
    if (!running(p) || pausedOn(p, today)) continue;
    const noLead = p.leadVacatedDay !== null;
    for (const s of p.steps) {
      if (s.column === "done" || s.dueDay === null || s.dueDay < since) continue;
      const owner = s.ownerUserId ?? null;
      const first = s.dueDay + 1;
      const to = owner ?? (noLead ? null : p.leadUserId);
      if (to !== null && today >= first && !hasProjectFact(p, "late", s.dueDay, undefined, s.id)) {
        out.push({ kind: "late", target: p.id, dueDay: s.dueDay, stepId: s.id, userId: to, idemKey: projectIdemKey("late", p.id, s.dueDay, undefined, s.id) });
      }
      const second = first + LATE_LEAD_DAYS;
      if (owner !== null && p.leadUserId !== null && owner !== p.leadUserId && !noLead && today >= second && !hasProjectFact(p, "late", s.dueDay, 2, s.id)) {
        out.push({ kind: "late", target: p.id, dueDay: s.dueDay, check: 2, stepId: s.id, userId: p.leadUserId, idemKey: projectIdemKey("late", p.id, s.dueDay, 2, s.id) });
      }
    }
  }
}

/** A step on Blocked for blocked_days working days (D18): the lead once per block; the block is the move that put the step there. */
function blockedDues(state: State, today: number, since: number, out: Due[]): void {
  for (const p of state.projects) {
    if (!running(p) || pausedOn(p, today) || p.leadVacatedDay !== null || p.leadUserId === null) continue;
    for (const s of p.steps) {
      if (s.column !== "blocked") continue;
      const dueDay = Math.max(s.movedDay, since) + state.rules.blockedDays;
      const origin = lastEventId(p, "project.step.moved", (e) => e.payload.stepId === s.id && e.payload.to === "blocked");
      if (today < dueDay || hasProjectFact(p, "blocked", dueDay, undefined, s.id, origin)) continue;
      out.push({ kind: "blocked", target: p.id, dueDay, stepId: s.id, userId: p.leadUserId, originEventId: origin, idemKey: projectIdemKey("blocked", p.id, dueDay, undefined, s.id, origin) });
    }
  }
}

/** Quiet (D12): nothing for QUIET_DAYS working days since the base, and once past the done-by date; a reminder to the lead per such day. */
function quietDues(state: State, today: number, since: number, out: Due[]): void {
  for (const p of state.projects) {
    if (!running(p) || pausedOn(p, today) || p.leadVacatedDay !== null || p.leadUserId === null) continue;
    const days: number[] = [quietBase(p, since) + QUIET_DAYS];
    const doneBy = doneByOf(p);
    if (doneBy !== null && doneBy >= since) days.push(doneBy + 1);
    for (const q of days) {
      if (today < q || hasProjectFact(p, "quiet", q)) continue;
      out.push({ kind: "quiet", target: p.id, dueDay: q, userId: p.leadUserId, idemKey: projectIdemKey("quiet", p.id, q) });
    }
  }
}

/**
 * Stalled (D12, D26): STALLED_DAYS after the latest quiet fact, when nothing happened since it - no activity, no moved done-by date, no
 * pause that ended after it. To the sponsor, else to the route owner's seat (the deputy's when the lead holds the owner role).
 */
function stalledDues(state: State, today: number, since: number, out: Due[]): void {
  for (const p of state.projects) {
    if (!running(p) || pausedOn(p, today) || p.leadVacatedDay !== null) continue;
    const activity = Math.max(p.lastActivityDay ?? p.startedDay ?? 0, since);
    const pauseEnd = p.pausedUntil !== null ? p.pausedUntil + 1 : 0;
    const doneBy = doneByOf(p);
    // The quiet days this project can be on now, newest last; only one that was written (a fact) and that nothing has overtaken counts.
    const quiet = [quietBase(p, since) + QUIET_DAYS, ...(doneBy !== null && doneBy >= since ? [doneBy + 1] : [])]
      .filter((q) => hasProjectFact(p, "quiet", q) && activity <= q && pauseEnd <= q && !p.doneByMoves.some((m) => m.day > q));
    if (quiet.length === 0) continue;
    const q = Math.max(...quiet);
    const dueDay = q + STALLED_DAYS;
    if (today < dueDay || hasProjectFact(p, "stalled", dueDay)) continue;
    const sponsor = p.sponsorUserId !== null && p.sponsorUserId !== p.leadUserId ? p.sponsorUserId : null;
    const route = state.routes.find((r) => r.id === p.routeId) ?? null;
    if (sponsor !== null) out.push({ kind: "stalled", target: p.id, dueDay, userId: sponsor, idemKey: projectIdemKey("stalled", p.id, dueDay) });
    else out.push({ kind: "stalled", target: p.id, dueDay, toRoleHolderId: targetSeat(state, route, leadHoldsOwner(state, p)), idemKey: projectIdemKey("stalled", p.id, dueDay) });
  }
}

/** The weekly update (D21): UPDATE_REMIND_DAYS after a check-in day that has no update, once; also while paused (D20). The week that just ended counts while its reminder day is still ahead of it (a Friday check-in). */
function updateDues(state: State, today: number, since: number, out: Due[]): void {
  for (const p of state.projects) {
    if (!running(p) || p.leadVacatedDay !== null || p.leadUserId === null) continue;
    const now = checkInDayOf(p, today, state.clock);
    if (now === null) continue;
    const before = previousCheckInDayOf(p, now, state.clock);
    for (const c of before === null ? [now] : [before, now]) {
      const dueDay = c + UPDATE_REMIND_DAYS;
      if (c < since || today < dueDay || p.latestUpdate?.week === c || hasProjectFact(p, "update", dueDay)) continue;
      out.push({ kind: "update", target: p.id, dueDay, userId: p.leadUserId, idemKey: projectIdemKey("update", p.id, dueDay) });
    }
  }
}

/**
 * No lead for VACANT_DAYS (D14): one fact per vacancy, the event that emptied the seat being its identity. With a sponsor it goes to the desk's seat,
 * without one to the seat above the desk; a project with no such seat (no route, nobody on the desk or above it) still gets the fact, with no seat,
 * so its inbox item stays and a manager sees it (D26): the diagnostic is the missing `toRoleHolderId`, and a desk assigned later gets the routed fact too.
 */
function vacantDues(state: State, today: number, since: number, above: SeatAbove, out: Due[]): void {
  for (const p of state.projects) {
    if (p.status === "stopped" || p.status === "recognised" || typeof p.leadVacatedDay !== "number" || p.leadVacatedDay < since) continue;
    const dueDay = p.leadVacatedDay + VACANT_DAYS;
    if (today < dueDay) continue;
    const route = state.routes.find((r) => r.id === p.routeId) ?? null;
    const sponsor = p.sponsorUserId !== null && p.sponsorUserId !== p.leadUserId;
    const to = sponsor ? deskSeat(state, p) : route?.ownerRoleId ? above(route.ownerRoleId, []) : null;
    const origin = lastEventId(p, "project.lead.vacated");
    const stored = p.history.filter((e) => e.type === "clock.due" && e.payload.kind === "vacant" && e.payload.dueDay === dueDay && e.payload.originEventId === origin);
    if (to === null ? stored.length > 0 : stored.some((e) => e.payload.toRoleHolderId)) continue;
    out.push({ kind: "vacant", target: p.id, dueDay, toRoleHolderId: to, originEventId: origin, idemKey: projectIdemKey("vacant", p.id, dueDay, undefined, undefined, origin) + (to === null ? ":unrouted" : "") });
  }
}

/**
 * Order of the project facts (OVL takes this over): start, measure, SET's draft facts (lead, invite, draft), confirm,
 * then MOV's late, blocked, quiet, stalled, update, vacant. A new kind goes at the end of the list it belongs to, never between.
 */
export function projectDues(state: State, today: number, above: SeatAbove): Due[] {
  const out: Due[] = [];
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
  draftDue(state, today, above, out);
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
  // MOV: workdays mode only, from MOV's release day on (D17); the demo clock fires nothing.
  if (state.clock.mode === "workdays") {
    const since = state.rules.movSinceDay;
    lateDues(state, today, since, out);
    blockedDues(state, today, since, out);
    quietDues(state, today, since, out);
    stalledDues(state, today, since, out);
    updateDues(state, today, since, out);
    vacantDues(state, today, since, above, out);
  }
  return out;
}
