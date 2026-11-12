// The overload area of the loop mails (REG/D6; plan OVL, D3, D22, D30): who is told when someone is away, when a desk carries too much, when a cover is
// appointed and when it is over, and when a seat has no holder. Pure: the state after the event in, notices out; the dispatcher plans them in the existing
// opt-out group `loop` (so no new switch), and `loop.org.seat.vacant` is a duty notice. Roles, not people (D3): a mail names a desk or a role, a count per
// desk and a date, never a reason, never a comparison of people. The clock's own away and overflow hand-overs send no case notice (D22): the people who
// matter hear of them through the events below.
import { seatsOfRole, usersOfRole, type SeatRow } from "@/features/auth/identity";
import type { State } from "@/features/cases/reducer";
import { dateOfWorkday } from "@/features/clock/calendar";
import type { SeatAbove } from "@/features/clock/due";
import { awayCoverSeat, overflowSeat } from "@/features/overload/away";
import { deskLoads } from "@/features/overload/load";
import { overloadOf } from "@/features/overload/reduce";
import type { T } from "@/i18n";
import type { NoticeBuilder, NoticeBuilders, NoticeCtx } from "./shared";

/** A working-day number as the company's date, in the layout the reader's language writes; "day N" where the company has no calendar (the demo). */
function dateOf(t: T, state: Pick<State, "clock">, day: number): string {
  if (state.clock.mode === "workdays") {
    try {
      const [y, m, d] = dateOfWorkday(day, state.clock.calendar).split("-");
      return t("caseNo.dateNumeric", { y, m, d });
    } catch {
      // A calendar without working days has no date to name.
    }
  }
  return t("mail.dayNumber", { day });
}

/** The title of a role, else the label of one of its seats: what a mail calls a desk. */
const roleName = (state: State, roleId: string | null | undefined): string => {
  if (!roleId) return "";
  return state.approvals.roles.find((r) => r.id === roleId)?.title || state.seats.find((s) => s.roleId === roleId)?.label || "";
};

/** The seat above a role for this state: the first role up the chart (not in `skip`) with a seat somebody holds (features/knowledge seatAbove, from the state alone). */
function seatAboveIn(state: State): SeatAbove {
  const roles = new Map(state.approvals.roles.map((r) => [r.id, r]));
  return (roleId, skip) => {
    const seen = new Set<string>([roleId]);
    for (let up = roles.get(roleId)?.reportsToId ?? null; up !== null && !seen.has(up); up = roles.get(up)?.reportsToId ?? null) {
      seen.add(up);
      if (skip.includes(up)) continue;
      const seat = seatsOfRole(state.seats, up).find((s) => s.userId !== null);
      if (seat) return seat.id;
    }
    return null;
  };
}

/** The users of the role above a desk: the people the seat above means (Q3.14). */
const aboveUsers = (state: State, roleId: string): string[] => {
  const seat = seatAboveIn(state)(roleId, []);
  const role = seat === null ? undefined : state.seats.find((s) => s.id === seat)?.roleId;
  return role === undefined ? [] : usersOfRole(state.seats, role);
};

/** The routes a desk owns, once each by deputy role: where its new cases overflow to (D24). */
const overflowSeatsOf = (state: State, roleId: string, today: number): string[] => {
  const seats = state.routes.filter((r) => r.ownerRoleId === roleId).map((r) => overflowSeat(state, roleId, r.id, today));
  return [...new Set(seats.filter((s): s is string => s !== null))];
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);

/** An absence set by somebody else tells the person; every absence tells the holders of the seat that answers for each seat the person holds alone (D22). */
const personAwayNotice: NoticeBuilder = ({ ev, state, pl, send, deskOf, find }) => {
  const userId = pl.userId;
  const from = num(pl.from);
  const to = num((pl as { to?: unknown }).to);
  if (typeof userId !== "string" || from === null || to === null) return;
  if (typeof pl.setBy === "string" && pl.setBy !== userId) {
    const setter = find(pl.setBy)?.name || ev.actor;
    send(userId, (t) => t("overload.mail.awaySetSubject"), (t) => [t("overload.mail.awaySetBody", { who: setter, from: dateOf(t, state, from), to: dateOf(t, state, to) })]);
  }
  // The seats the person holds alone: no other person sits on a seat of the role. Evaluated on the first away day .
  const today = from;
  const above = seatAboveIn(state);
  for (const seat of state.seats.filter((s) => s.userId === userId)) {
    if (seatsOfRole(state.seats, seat.roleId).some((s) => s.userId !== null && s.userId !== userId)) continue;
    const routeId = state.routes.find((r) => r.ownerRoleId === seat.roleId)?.id ?? null;
    const cover = awayCoverSeat(state, seat.id, routeId, today, above);
    if (cover === null) continue;
    for (const who of deskOf(cover)) {
      if (who === userId) continue;
      send(who, (t) => t("overload.mail.coverSubject"), (t) => [t("overload.mail.coverBody", { from: dateOf(t, state, from), to: dateOf(t, state, to), seat: roleName(state, seat.roleId) })]);
    }
  }
};

/** A desk at 20 tells the seat above; at 30 also the desk that new cases now come to (D22). */
const deskOverloadedNotice: NoticeBuilder = ({ state, pl, ev, send, deskOf }) => {
  const roleId = ev.target ?? pl.roleId;
  if (typeof roleId !== "string") return;
  const desk = roleName(state, roleId);
  const load = deskLoads(state, state.day).find((l) => l.roleId === roleId);
  const open = load?.open ?? (pl.perHolder ?? 0) * (pl.holders ?? 0);
  const holders = pl.holders ?? load?.holders ?? 0;
  for (const who of aboveUsers(state, roleId)) {
    send(who, (t) => t("overload.mail.upSubject", { desk }), (t) => [t("overload.mail.upBody", { desk, open, holders })]);
  }
  if (pl.level !== 30) return;
  for (const seat of overflowSeatsOf(state, roleId, state.day)) {
    const to = roleName(state, state.seats.find((s) => s.id === seat)?.roleId);
    for (const who of deskOf(seat)) send(who, (t) => t("overload.mail.overflowSubject", { desk, to }), (t) => [t("overload.mail.overflowBody", { desk, to })]);
  }
};

/** The seat above appointed a cover for the desk: the cover's holders hear that its new cases come to them until it is cleared (D22). */
const deskCoveredNotice: NoticeBuilder = ({ state, pl, ev, send, deskOf }) => {
  const roleId = ev.target ?? pl.roleId;
  if (typeof roleId !== "string" || typeof pl.seatId !== "string") return;
  const desk = roleName(state, roleId);
  const seat = roleName(state, state.seats.find((s) => s.id === pl.seatId)?.roleId);
  for (const who of deskOf(pl.seatId)) send(who, (t) => t("overload.mail.coveredSubject", { desk }), (t) => [t("overload.mail.coveredBody", { desk, seat })]);
};

/** The desk is eased: the people the episode told - the seat above, the desk that took the overflow, the cover - hear once that it is over (D22). */
const deskClearedNotice: NoticeBuilder = ({ state, pl, ev, send, deskOf }) => {
  const roleId = ev.target ?? pl.roleId;
  if (typeof roleId !== "string") return;
  const desk = roleName(state, roleId);
  // The episode this event closed: the latest closed one of the role (the state is the one after the event).
  const episode = overloadOf(state).desks.filter((d) => d.roleId === roleId && d.clearedDay !== null).at(-1);
  const people = new Set<string>(aboveUsers(state, roleId));
  if (episode?.level === 30) for (const seat of overflowSeatsOf(state, roleId, state.day)) deskOf(seat).forEach((u) => people.add(u));
  if (episode?.coverSeatId) deskOf(episode.coverSeatId).forEach((u) => people.add(u));
  for (const who of people) send(who, (t) => t("overload.mail.clearedSubject", { desk }), (t) => [t("overload.mail.clearedBody", { desk })]);
};

/** A seat has no holder: the company admins are told at once, with a link to the org settings (D30). A duty notice. */
const seatVacantNotice: NoticeBuilder = ({ state, pl, ev, send, people, baseUrl }: NoticeCtx) => {
  const roleId = pl.roleId;
  const seatId = typeof pl.seatId === "string" ? pl.seatId : ev.target;
  const seat: SeatRow | undefined = state.seats.find((s) => s.id === seatId);
  const role = roleName(state, typeof roleId === "string" ? roleId : seat?.roleId) || seat?.label || "";
  for (const p of people) {
    if (!p.manager) continue;
    send(p.id, (t) => t("overload.mail.seatVacantSubject", { seat: role }), (t) => [t("overload.mail.seatVacantBody", { seat: role }), "", `${baseUrl}/settings/org`]);
  }
};

export const OVERLOAD_NOTICES: NoticeBuilders = {
  "person.away": personAwayNotice,
  "desk.overloaded": deskOverloadedNotice,
  "desk.covered": deskCoveredNotice,
  "desk.cleared": deskClearedNotice,
  "org.seat.vacant": seatVacantNotice,
};
