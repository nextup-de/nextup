// The overload area of the clock (REG/D6; plan OVL, D24, D26, D29): a case on an away holder's seat goes to the seat that answers for it, a desk that carries
// too much tells the seat above at 20 and sends its new cases on at 30, and a desk that is under 20 again clears. Pure: the reduced snapshot and today in,
// a list out; the scheduler writes each Due once (server/scheduler/writers/overload.ts). Roles, not people (D3): every Due names a case or a desk (a role)
// and a seat, never a person, and no Due ranks anything.
import { byClock } from "@/features/clock/actor";
import type { ReducedCase, State } from "@/features/cases/reducer";
import { awayCoverSeat, awayOn, overflowSeat } from "@/features/overload/away";
import { deskLoads } from "@/features/overload/load";
import { overloadOf } from "@/features/overload/reduce";
import type { Due, SeatAbove } from "../due";
import { caseDues } from "./case";

/**
 * away: a case on an away holder's seat goes to the seat that answers for it; overflow: a case on a desk at overflow goes to the deputy desk or the appointed
 * cover; overloaded: a desk reached the up or the overflow level; cleared: a desk with an open episode is under up again.
 */
export const OVERLOAD_DUE_KINDS = ["away", "overflow", "overloaded", "cleared"] as const;
export type OverloadDueKind = (typeof OVERLOAD_DUE_KINDS)[number];

/** The overload level a desk reaches: 20 is up, 30 is overflow (D15, D16). */
const LEVEL = { up: 20, overflow: 30 } as const;

/** Away and overflow are events the scheduler writes (case.handed), so they go after every fact, as the case area's hand-overs do (D26). */
export const overloadAfterFacts: (d: Due) => boolean = (d) => d.kind === "away" || d.kind === "overflow";

/** A hand-over the clock already wrote for this case with this reason on or after `from`: only the clock's own events count (a person cannot stop it). */
const handedBefore = (c: ReducedCase, why: "away" | "overflow", from: number): boolean =>
  c.history.some((e) => e.type === "case.handed" && e.payload.why === why && byClock(e) && e.day >= from);

/**
 * Everything that falls due for absence and overload, from one snapshot (D29): the loads are counted on it, so a desk that crosses 30 writes its
 * `desk.overloaded` and starts overflowing in the same run, and its counts drop by the cases handed only on the next run. One hand-over per case per run:
 * a case the case area hands in the same run gets none (D29), and away comes before overflow. `[]` outside workdays mode, as every area.
 */
export function overloadDues(state: State, today: number, above: SeatAbove): Due[] {
  if (state.clock.mode !== "workdays") return [];
  const taken = new Set(caseDues(state, today, above).filter((d) => d.kind === "handover" || d.kind === "unanswered").map((d) => d.target));
  const facts: Due[] = [];
  const away: Due[] = [];
  const overflow: Due[] = [];
  const open = (c: ReducedCase) => c.status === "open" || c.status === "discussion";

  // A case on an away holder's seat: the seat that answers for it, once per span (the seat's holder is away today and a cover exists).
  for (const c of state.cases) {
    if (!open(c) || taken.has(c.id) || c.assigneeSeatId === null) continue;
    const seat = state.seats.find((s) => s.id === c.assigneeSeatId);
    const span = seat?.userId == null ? undefined : overloadOf(state).away.find((s) => s.userId === seat.userId && awayOn(state, seat.userId as string, today) && s.from <= today && today <= s.to && (s.endedDay === null || s.endedDay > today));
    if (!span || handedBefore(c, "away", span.from)) continue;
    const cover = awayCoverSeat(state, c.assigneeSeatId, c.route?.id ?? c.routeId ?? null, today, above);
    if (cover === null) continue;
    away.push({ kind: "away", target: c.id, dueDay: today, toRoleHolderId: cover, idemKey: `ovl:away:${c.id}:${span.awayId}` });
    taken.add(c.id);
  }

  // The desks: one fact when a desk reaches up or overflow and has no open episode at that level, one when an open episode is under up again (D26).
  const episodes = overloadOf(state).desks.filter((d) => d.clearedDay === null);
  const seatFor = new Map<string, string | null>();
  for (const load of deskLoads(state, today)) {
    const episode = episodes.find((d) => d.roleId === load.roleId);
    const atOverflow = load.level === "overflow";
    const atUp = load.level === "up" || atOverflow;
    if (!atUp) {
      if (episode) facts.push({ kind: "cleared", target: load.roleId, dueDay: today, idemKey: `ovl:clear:${load.roleId}:${episode.since}` });
      continue;
    }
    const level = atOverflow ? LEVEL.overflow : LEVEL.up;
    // The episode is written in this run when there is none: its day is today, so the cases raised today are in it (D24, D29).
    const since = episode?.since ?? today;
    if (!episode || (level === LEVEL.overflow && episode.level < LEVEL.overflow)) {
      facts.push({ kind: "overloaded", target: load.roleId, dueDay: today, check: level, idemKey: `ovl:up:${load.roleId}:${since}:${level}` });
    }
    // New cases overflow while the desk is at overflow, or at up with an appointed cover (D24): those raised on or after the episode's first day that no person ever handed.
    if (!atOverflow && !episode?.coverSeatId) continue;
    for (const c of state.cases) {
      if (!open(c) || taken.has(c.id) || c.assigneeRoleId !== load.roleId || c.raisedDay < since) continue;
      if (c.handed.some((h) => h.fromUserId !== null) || handedBefore(c, "overflow", since)) continue;
      const key = `${load.roleId}|${c.route?.id ?? c.routeId ?? ""}`;
      if (!seatFor.has(key)) seatFor.set(key, overflowSeat(state, load.roleId, c.route?.id ?? c.routeId ?? null, today));
      const to = seatFor.get(key) ?? null;
      if (to === null) continue;
      overflow.push({ kind: "overflow", target: c.id, dueDay: today, toRoleHolderId: to, idemKey: `ovl:overflow:${c.id}:${since}` });
      taken.add(c.id);
    }
  }
  return [...facts, ...away, ...overflow];
}
