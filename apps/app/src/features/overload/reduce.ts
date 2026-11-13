// The overload state as a reducer (plan OVL, D16): the six OVL events reduce into OverloadState; the case reducer calls applyOverload from one hook
// before its switch and no other branch sees them. Pure. An away span carries no reason and no text (D3).
import type { CaseEvent } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import type { AwaySpan, DeskEpisode, OverloadState } from "./types";

export const emptyOverload = (): OverloadState => ({ away: [], desks: [] });

/** The overload state of a State: absent means empty, so State literals in tests and fixtures stay valid. */
export const overloadOf = (state: Pick<State, "overload">): OverloadState => state.overload ?? emptyOverload();

const whole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const str = (v: unknown): v is string => typeof v === "string" && v !== "";

/** The open episode of a role: not cleared yet. */
const openEpisode = (o: OverloadState, roleId: string): DeskEpisode | undefined => o.desks.find((d) => d.roleId === roleId && d.clearedDay === null);

/**
 * Applies one event. True when it was one of OVL's six types (handled, whether or not it changed anything), so the caller does not look at it again.
 * - person.away appends a span; a second span of the same user that overlaps one still open replaces it.
 * - person.back sets the end day of the span with that awayId and that user; a pair that does not match changes nothing.
 * - desk.overloaded opens an episode for the role or raises the open one's level; desk.covered sets the cover seat of the open one (none open: nothing);
 *   desk.cleared closes the open one. org.seat.vacant changes no state.
 */
export function applyOverload(o: OverloadState, ev: CaseEvent, day: number): boolean {
  const pl = ev.payload ?? {};
  switch (ev.type) {
    case "person.away": {
      const userId = pl.userId, from = pl.from, to = (pl as { to?: unknown }).to;
      if (!str(userId) || !whole(from) || !whole(to) || to < from) return true;
      // The id is the event's own (the server sets it); a payload without one keeps the event id.
      const awayId = str(pl.awayId) ? pl.awayId : ev.id;
      const span: AwaySpan = { awayId, userId, from, to, setBy: str(pl.setBy) ? pl.setBy : null, endedDay: null };
      // A span that overlaps one still open of the same person replaces it.
      o.away = o.away.filter((s) => !(s.userId === userId && s.endedDay === null && s.from <= to && from <= s.to));
      o.away.push(span);
      return true;
    }
    case "person.back": {
      const span = o.away.find((s) => s.awayId === pl.awayId && s.userId === pl.userId);
      if (span && span.endedDay === null) span.endedDay = day;
      return true;
    }
    case "desk.overloaded": {
      const roleId = ev.target ?? pl.roleId;
      if (!str(roleId) || (pl.level !== 20 && pl.level !== 30)) return true;
      const open = openEpisode(o, roleId);
      if (open) open.level = pl.level === 30 ? 30 : open.level;
      else o.desks.push({ roleId, since: day, level: pl.level, coverSeatId: null, clearedDay: null });
      return true;
    }
    case "desk.covered": {
      const roleId = ev.target ?? pl.roleId;
      const open = str(roleId) ? openEpisode(o, roleId) : undefined;
      if (open && str(pl.seatId)) open.coverSeatId = pl.seatId;
      return true;
    }
    case "desk.cleared": {
      const roleId = ev.target ?? pl.roleId;
      const open = str(roleId) ? openEpisode(o, roleId) : undefined;
      if (open) open.clearedDay = day;
      return true;
    }
    case "org.seat.vacant":
      return true;
    default:
      return false;
  }
}

