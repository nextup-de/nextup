// Who may do what about absence and the load of a desk (plan OVL, D19, D28, D31), as pure functions of the reduced state. Each answers one question for one
// viewer and returns `{ ok: true }` or the message key of the reason; the server actions and the pages ask the same functions. Roles and user ids, never names (D3).
import type { CaseEvent } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import { byClock } from "@/features/clock/actor";
import type { SeatAbove } from "@/features/clock/due";
import type { MessageKey } from "@/i18n";
import { takeBackable } from "./away";
import { deskLoads } from "./load";
import { overloadOf } from "./reduce";

export type Verdict = { ok: true } | { ok: false; key: MessageKey };
const OK: Verdict = { ok: true };
const no = (key: MessageKey): Verdict => ({ ok: false, key });

/** The longest absence a span may cover, in working days (D19). */
export const AWAY_MAX_DAYS = 120;

type Viewer = { userId: string; role: string };
type Seats = Pick<State, "seats">;

/** The viewer is a company admin (app role manager, D31). */
const isAdmin = (viewer: Pick<Viewer, "role">): boolean => viewer.role === "manager";

/** The seat that sits directly above one of the person's seats (what SeatAbove returns for it) is held by the viewer (D31). */
function holdsSeatAbove(viewerId: string, userId: string, state: Seats, above: SeatAbove): boolean {
  return state.seats.some((s) => {
    if (s.userId !== userId) return false;
    const up = above(s.roleId, []);
    return up !== null && state.seats.some((x) => x.id === up && x.userId === viewerId);
  });
}

/**
 * May the viewer set (or end) an absence for this person (D31): themselves, a company admin, or the holder of the seat directly above one of the person's seats.
 * `target` is the person as the server resolved them among the company's members: nobody, or somebody who is not active, is no target.
 */
export function maySetAway(viewer: Viewer, target: { userId: string; active: boolean } | null, state: Seats, above: SeatAbove): Verdict {
  if (target === null || !target.active) return no("overload.away.errTarget");
  if (target.userId === viewer.userId || isAdmin(viewer) || holdsSeatAbove(viewer.userId, target.userId, state, above)) return OK;
  return no("overload.away.errRights");
}

/** The active members the viewer may set away: everyone for a company admin, the people directly below for a seat holder; never the viewer, sorted by name (D31). */
export function awayTargets<M extends { userId: string; name: string; active: boolean }>(viewer: Viewer, members: readonly M[], state: Seats, above: SeatAbove): M[] {
  return members
    .filter((m) => m.userId !== viewer.userId && maySetAway(viewer, m, state, above).ok)
    .sort((a, b) => a.name.localeCompare(b.name));
}

const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

/** A span the days of which are whole working-day numbers, starting today or later, ending on or after its start, and at most 120 days long (D9, D19). */
export function checkSpan(from: unknown, to: unknown, today: number): Verdict {
  if (!whole(from) || !whole(to) || !whole(today)) return no("overload.err.badDay");
  return from >= today && from <= to && to - from <= AWAY_MAX_DAYS ? OK : no("overload.away.errRange");
}

/**
 * Did a person write on the case after the clock handed it away? The reduced case keeps only the events that change it, so a comment or a co-sign is
 * not in its history; the log has them all (D19: 'no later event by a person'). The clock's and a system actor's events do not count.
 */
export function touchedSinceAway(events: readonly Pick<CaseEvent, "type" | "target" | "actor" | "actorUserId" | "payload">[], caseId: string): boolean {
  const mine = events.filter((e) => e.target === caseId);
  const at = mine.findLastIndex((e) => e.type === "case.handed" && e.payload.why === "away" && byClock(e));
  return at >= 0 && mine.slice(at + 1).some((e) => !byClock(e) && !e.actor.startsWith("system:"));
}

/**
 * May the viewer take this case back: it is one of the cases the clock handed away from the viewer's seat during an absence that is over, nobody has touched
 * since (D19). With `events` (the case's log) a comment counts as a touch too.
 */
export function mayTakeBack(viewer: Pick<Viewer, "userId">, caseId: string, state: Pick<State, "cases" | "seats" | "overload">, today: number, events?: readonly Pick<CaseEvent, "type" | "target" | "actor" | "actorUserId" | "payload">[]): Verdict {
  if (!takeBackable(state, viewer.userId, today).some((c) => c.id === caseId)) return no("overload.err.nothing");
  return events !== undefined && touchedSinceAway(events, caseId) ? no("overload.err.nothing") : OK;
}

/**
 * May the viewer share the load of this desk (D28): its level is up or overflow, and the viewer is a company admin or holds the seat directly above the desk
 * (what SeatAbove returns for its role). Nothing else is widened: a holder of the desk itself, or a member, may not.
 */
export function mayShareLoad(
  viewer: Viewer, roleId: string, state: Pick<State, "cases" | "projects" | "seats" | "routes" | "rules" | "approvals" | "overload">, today: number, above: SeatAbove,
): Verdict {
  if (!isAdmin(viewer)) {
    const up = above(roleId, []);
    if (up === null || !state.seats.some((s) => s.id === up && s.userId === viewer.userId)) return no("overload.err.notAbove");
  }
  const level = deskLoads(state, today).find((l) => l.roleId === roleId)?.level;
  return level === "up" || level === "overflow" ? OK : no("overload.err.notOverloaded");
}

/** The span of a person that is open today or starts later (the earliest such); null when there is none. */
export function currentOrNextSpan(state: Pick<State, "overload">, userId: string, today: number): { awayId: string; from: number; to: number } | null {
  const open = overloadOf(state).away
    .filter((s) => s.userId === userId && s.endedDay === null && s.to >= today)
    .sort((a, b) => a.from - b.from)[0];
  return open ? { awayId: open.awayId, from: open.from, to: open.to } : null;
}
