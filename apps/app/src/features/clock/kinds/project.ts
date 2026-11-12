// The project area of the clock (REG/D9): what falls due on a project, a project draft included (plan SET). MOV and RES add their
// kinds and loops here, never in due.ts.
import type { State } from "@/features/cases/reducer";
import type { CaseEvent, EventPayload } from "@/features/cases/events";
import { CONFIRM_ESCALATE_DAYS, unconfirmedOf } from "@/features/projects/confirm";
import type { ReducedProject } from "@/features/projects/types";
import type { Due, DueKind, SeatAbove } from "../due";
import { hasFact, idemKeyOf, targetSeat } from "./shared";

export const PROJECT_DUE_KINDS = ["start", "measure", "confirm", "lead", "invite", "draft"] as const;
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

/** Everything that falls due on a project, in the order the loops ran in dueNow. */
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
  return out;
}
