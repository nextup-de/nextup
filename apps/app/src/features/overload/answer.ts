// Which desk a new raise on a route really reaches (plan OVL, D25): the owner desk when someone present sits there, else the cover of an away single holder, the
// overflow desk, the deputy of a vacant desk or the seat above. Pure functions of the reduced state, so the raise page can say it before the clock acts; the
// answer carries seat labels and a role, never a person's name (D3).
import { seatsOfRole } from "@/features/auth/identity";
import type { SeatAbove } from "@/features/clock/due";
import type { State } from "@/features/cases/reducer";
import { EMPTY_APPROVAL_CONFIG } from "@/features/approvals/types";
import { LOOP_DEFAULTS } from "@/features/loop/rules";
import type { MessageKey } from "@/i18n";
import { awayCoverSeat, overflowSeat, seatPresent } from "./away";
import { deskLoads } from "./load";
import { overloadOf } from "./reduce";

/** Why this desk answers: its holders do, the holder is away, the desk is at overflow, nobody sits there (the deputy answers) or nobody is below (the seat above answers). */
export type AnswerWhy = "holder" | "away" | "overflow" | "vacant" | "above";
export type AnsweringDesk = { roleId: string; why: AnswerWhy; names: string[] };

type AnswerState = Pick<State, "seats" | "overload" | "routes" | "cases" | "projects" | "rules" | "approvals">;

const safely = <T>(run: () => T, otherwise: T): T => {
  try {
    return run();
  } catch {
    return otherwise;
  }
};

/** The sent line of each reason (D25): the same line as today for a holder, one for each of the others. */
export const SENT_LINE: Record<AnswerWhy, MessageKey> = {
  holder: "ideas.deskSent",
  away: "ideas.deskSentAway",
  overflow: "ideas.deskSentOverflow",
  vacant: "ideas.deskSentDeputy",
  above: "ideas.deskSentVacant",
};

/**
 * The desk a new raise on `routeId` reaches today (D25), or null when the route has no owner role or nobody at all can answer:
 * - the owner role when a present holder sits there, unless the desk is at overflow, or at up with an appointed cover (why holder);
 * - at overflow, or at up with a cover: the role of overflowSeat (why overflow); when it gives nobody the owner keeps it;
 * - every holder is away: the role of awayCoverSeat (why away); with nobody to cover, the holders keep it;
 * - nobody holds the role: the first present seat of the route's deputy role (why vacant), else the seat above (why above).
 */
export function answeringDesk(given: Partial<AnswerState>, routeId: string | null, today: number, above: SeatAbove): AnsweringDesk | null {
  // The raise page hands over the state it has: a company's reduced state in server mode, where a part can be missing; what is missing is empty, never a throw.
  const state: AnswerState = {
    seats: given.seats ?? [], routes: given.routes ?? [], cases: given.cases ?? [], projects: given.projects ?? [],
    rules: given.rules ?? LOOP_DEFAULTS, approvals: given.approvals ?? { ...EMPTY_APPROVAL_CONFIG, roles: [] }, overload: given.overload,
  };
  const route = state.routes.find((r) => r.id === routeId);
  const roleId = route?.ownerRoleId ?? null;
  if (!route || roleId === null) return null;
  const label = (seatId: string) => state.seats.find((s) => s.id === seatId)?.label ?? "";
  const roleOf = (seatId: string) => state.seats.find((s) => s.id === seatId)?.roleId ?? null;
  const at = (seatId: string | null, why: AnswerWhy): AnsweringDesk | null => {
    const role = seatId === null ? null : roleOf(seatId);
    return seatId === null || role === null ? null : { roleId: role, why, names: [label(seatId)] };
  };

  const owners = seatsOfRole(state.seats, roleId).filter((s) => s.userId !== null);
  const present = owners.filter((s) => seatPresent(state, s.id, today));
  if (owners.length > 0) {
    const episode = overloadOf(state).desks.find((d) => d.roleId === roleId && d.clearedDay === null);
    // The load is worked out from every case and project of the state: a part of it that cannot be read means no overflow, the desk answers itself.
    const level = safely(() => deskLoads(state, today).find((l) => l.roleId === roleId)?.level, undefined);
    const full = level === "overflow" || (episode !== undefined && episode.coverSeatId !== null);
    if (full) {
      const over = at(safely(() => overflowSeat(state, roleId, route.id, today), null), "overflow");
      if (over) return over;
    }
    if (present.length > 0) return { roleId, why: "holder", names: present.map((s) => s.label) };
    const cover = at(awayCoverSeat(state, owners[0].id, route.id, today, above), "away");
    return cover ?? { roleId, why: "holder", names: owners.map((s) => s.label) };
  }

  const deputyRole = route.deputyRoleId ?? null;
  const deputySeat = deputyRole === null || deputyRole === roleId ? undefined : seatsOfRole(state.seats, deputyRole).find((s) => seatPresent(state, s.id, today));
  if (deputySeat) return at(deputySeat.id, "vacant");
  const up = above(roleId, []);
  return up !== null && seatPresent(state, up, today) ? at(up, "above") : null;
}
