// What the server decides about a raise, whatever the client sent (IDN/D13). Pure: the seed or the
// org in, the payload out.
import { fallbackSeatFor, reviewApplies, reviewSeatFor, triageSeat } from "@/features/approvals/rules";
import { appealSeatWithReview } from "@/features/approvals/rights";
import { EMPTY_APPROVAL_CONFIG, type ApprovalConfig, type ApprovalRoleInfo } from "@/features/approvals/types";
import { HANDLE_PREFIX } from "@/features/auth/handle";
import type { SeatRow } from "@/features/auth/identity";
import { workdayOf } from "@/features/clock/calendar";
import type { Seed, SeedRole } from "@/features/demo/types";
import { MIN_GROUP } from "@/features/metrics/types";
import type { EventPayload } from "./events";
import { routeOfSeat } from "./hand";
import { passDueDay } from "./no";
import type { ReducedCase, State } from "./reducer";

/**
 * The desk for a raise that no route owns (decisions Q2.1 and Q1.9): the head of the org chart, which passes it
 * on or answers it. That is the occupied seat of the top role with the most roles under it, so a stray role
 * without a boss is not taken for the head; ties go to the seat listed first. null when the company has no
 * org chart or nobody sits at its top - the raise then lands on no desk, as before.
 */
export function fallbackSeat(seed: { seats?: readonly SeatRow[]; roles?: readonly SeedRole[] }): SeatRow | null {
  const roles = seed.roles ?? [];
  const known = new Set(roles.map((r) => r.id));
  const under = (id: string, seen: Set<string>): number =>
    roles.filter((r) => r.reportsToId === id && !seen.has(r.id)).reduce((n, r) => n + 1 + under(r.id, seen.add(r.id)), 0);
  const seats = [...(seed.seats ?? [])].sort((a, b) => a.sort - b.sort);
  const heads = roles
    .filter((r) => r.reportsToId === null || !known.has(r.reportsToId))
    .flatMap((r) => {
      const seat = seats.find((s) => s.roleId === r.id && s.userId !== null);
      return seat ? [{ seat, below: under(r.id, new Set([r.id])) }] : [];
    });
  return heads.sort((a, b) => b.below - a.below || a.seat.sort - b.seat.sort)[0]?.seat ?? null;
}

/** What the raise placement reads of the company besides the routes: the seats, the roles with their boss and limit, the review and approval settings, the managers. */
export type StampSeed = Pick<Seed, "routes"> & {
  clock?: Seed["clock"];
  seats?: readonly SeatRow[];
  roles?: readonly SeedRole[];
  approvals?: ApprovalConfig;
  managerUserIds?: readonly string[];
};

/** The roles as the review and approval rules read them (the same mapping the reducer makes for `State.approvals.roles`). */
const roleInfos = (roles: readonly SeedRole[] | undefined): ApprovalRoleInfo[] =>
  (roles ?? []).map((r) => ({ id: r.id, title: r.title ?? "", reportsToId: r.reportsToId, spendLimitEur: r.spendLimitEur ?? null }));

/** The company's working day now, from the seed's clock; 0 on the demo clock, which has no calendar here (the caller passes `today` then). */
const clockDayOf = (seed: Pick<StampSeed, "clock">): number => (seed.clock?.mode === "workdays" ? workdayOf(new Date(), seed.clock.calendar) : 0);

/**
 * case.raised: the seat the raise lands on, whatever the client sent (plan GAT, D12, D16). A raise that review applies to goes to the review
 * seat that the raiser does not hold, with `review: true` and `reviewDueDay` = the raise day + the review's days; else a raise without a route
 * goes to the triage seat, a raise onto a route without an owner seat to the fallback seat (each the review seat while the company's review is on, else
 * the seat the setting names, else the first manager role's seat, else the head of the org chart), and a route with an owner seat keeps it. A seat
 * label rides along. null only when there is no seat at all. `review` and `reviewDueDay` are the server's: the client's are dropped. Every other
 * type passes unchanged.
 */
export function stampEvent(type: string, payload: EventPayload, seed: StampSeed, ctx: { raiserUserId?: string | null; today?: number } = {}): EventPayload {
  if (type !== "case.raised") return payload;
  const { review: _review, reviewDueDay: _due, ...base } = payload;
  void _review;
  void _due;
  const config = seed.approvals ?? EMPTY_APPROVAL_CONFIG;
  const route = seed.routes.find((r) => r.id === payload.routeId) ?? null;
  const input = {
    config, seats: seed.seats ?? [], roles: roleInfos(seed.roles), managerUserIds: new Set(seed.managerUserIds ?? []), raiserUserId: ctx.raiserUserId ?? null,
  };
  if (reviewApplies(config, route?.id ?? null)) {
    const seat = reviewSeatFor(input);
    if (seat) return { ...base, assignee: seat.label, assigneeRoleHolderId: seat.id, review: true, reviewDueDay: (ctx.today ?? clockDayOf(seed)) + config.review.days };
  }
  const owner = route?.ownerSeatId ?? null;
  if (owner !== null) return { ...base, assigneeRoleHolderId: owner };
  const seat = route === null ? triageSeat(input) : fallbackSeatFor(input);
  return seat ? { ...base, assignee: seat.label, assigneeRoleHolderId: seat.id } : { ...base, assigneeRoleHolderId: null };
}

// ── What the server decides about a pass and a second look (plan NOR, NOR-B1) ──────────────────────

/** The seat above a role, not counting the roles in `skip` (features/knowledge seatAbove); null when nobody is. */
export type SeatAboveFn = (roleId: string, skip: readonly string[]) => { id: string; label: string } | null;

/**
 * The desk a second look goes to (D18): the first occupied seat of the route's deputy role, unless the person who said no holds that role
 * (by user id) or nobody sits there; then the seat above that role, never in a role the no-sayer holds. null when no one can take it: a
 * manager answers then. The client's idea of the desk is never read.
 */
export function appealDeskSeat(
  kase: Pick<ReducedCase, "decided" | "routeId" | "assigneeRoleId">,
  state: Pick<State, "seats" | "routes">,
  above: SeatAboveFn,
): { id: string; label: string } | null {
  const noSayer = kase.decided?.answer === "no" ? kase.decided.byUserId ?? null : null;
  const held = new Set(state.seats.filter((x) => noSayer !== null && x.userId === noSayer).map((x) => x.roleId));
  const route = state.routes.find((r) => r.id === kase.routeId);
  const deputyRole = route?.deputyRoleId ?? null;
  if (deputyRole !== null && !held.has(deputyRole)) {
    const seat = [...state.seats].sort((a, b) => a.sort - b.sort).find((x) => x.roleId === deputyRole && x.userId !== null);
    if (seat) return { id: seat.id, label: seat.label };
  }
  const from = deputyRole ?? route?.ownerRoleId ?? kase.assigneeRoleId;
  return from ? above(from, [...held]) : null;
}

/**
 * The payload a person's event is written with, whatever the client sent. A pass: the destination of Not mine from the recorded pass
 * it answers, of Send up from the desk hierarchy; the flag that keeps a question only on an asked case; the new desk's date floor from
 * the rule, even when omitted or forged; the route of the seat it goes to when none came. A second look: the desk from D18, never the
 * client's seat. A second look's answer and a stopped project's reopen: no seat and no date of the client's. Every other type passes unchanged.
 * A send-up with nobody above comes back without a seat (the caller refuses it).
 */
export function stampNor(
  type: string,
  payload: EventPayload,
  kase: ReducedCase | undefined,
  state: Pick<State, "seats" | "routes" | "day"> & Partial<Pick<State, "approvals">>,
  above: SeatAboveFn,
): EventPayload {
  if (!kase) return payload;
  if (type === "case.handed") {
    const next: EventPayload = { ...payload };
    const label = (seatId: string) => state.seats.find((x) => x.id === seatId)?.label ?? "";
    const last = kase.handed[kase.handed.length - 1];
    if (payload.back === true && payload.up !== true && last?.fromSeatId) {
      next.toRoleHolderId = last.fromSeatId;
      next.to = label(last.fromSeatId);
      delete next.routeId;
    } else if (payload.up === true && payload.back !== true) {
      const seat = kase.assigneeRoleId ? above(kase.assigneeRoleId, [kase.assigneeRoleId]) : null;
      delete next.routeId;
      if (seat) {
        next.toRoleHolderId = seat.id;
        next.to = seat.label;
      } else {
        delete next.toRoleHolderId;
        delete next.to;
      }
    } else if (next.routeId === undefined && typeof next.toRoleHolderId === "string") {
      const route = routeOfSeat([...state.routes], next.toRoleHolderId);
      if (route) next.routeId = route.id;
    }
    if (kase.status === "asked") {
      if (payload.keepsQuestion === true) next.keepsQuestion = true;
    } else delete next.keepsQuestion;
    const floor = passDueDay(kase, state.day);
    if (floor !== null) next.dueDay = floor;
    else delete next.dueDay;
    return next;
  }
  if (type === "case.appealed") {
    const next: EventPayload = { ...payload };
    // When review applies to the case's route the second look goes to the review seat (GAT D17); NOR's rule when that gives none, also when the no-sayer holds the review role.
    const reviewSeat = state.approvals ? appealSeatWithReview(kase, { seats: state.seats, approvals: state.approvals }, kase.decided?.answer === "no" ? kase.decided.byUserId ?? null : null) : null;
    const desk = reviewSeat ? { id: reviewSeat.id, label: reviewSeat.label } : appealDeskSeat(kase, state, above);
    if (desk) next.toRoleHolderId = desk.id;
    else delete next.toRoleHolderId;
    return next;
  }
  if (type === "case.appeal.decided" || type === "case.reopened") {
    const next: EventPayload = { ...payload };
    delete next.toRoleHolderId;
    delete next.dueDay;
    return next;
  }
  return payload;
}

// ── The department on an anonymous raise ─────────────────────────────────────────────────────────
// A handle next to a department of three people names the person. So a raise under a handle keeps its
// department only when the raiser's own unit has at least MIN_GROUP active people (the limit the
// metrics already hide below, MET D6). The unit is the server's: the label is never read or matched.

/** The part of the org the rule counts on: ids only. */
export type DeptOrg = {
  units: readonly { id: string; parentId: string | null }[];
  roles: readonly { id: string; orgUnitId: string }[];
  /** The occupied seats of active people, in seat order. */
  seats: readonly { roleId: string; userId: string }[];
  /** The active people without a seat, and the unit their department names (null: none). */
  members: readonly { userId: string; unitId: string | null }[];
};

export type UnitPeople = {
  /** How many active people this person's own unit has, or null for a person without a unit. */
  ofUser: (userId: string | null | undefined) => number | null;
  /** How many active people the unit has, its sub-units included, as the metrics count them. */
  ofUnit: (unitId: string) => number;
};

export const NO_UNITS: UnitPeople = { ofUser: () => null, ofUnit: () => 0 };

/** A person's unit is the unit of their first seat, else the one their department names (lib/db/metrics.ts counts the same way). */
export function unitPeople(org: DeptOrg): UnitPeople {
  const unitOfRole = new Map(org.roles.map((r) => [r.id, r.orgUnitId]));
  const unitOfUser = new Map<string, string>();
  for (const s of org.seats) {
    const unit = unitOfRole.get(s.roleId);
    if (unit !== undefined && !unitOfUser.has(s.userId)) unitOfUser.set(s.userId, unit);
  }
  for (const m of org.members) if (m.unitId !== null && !unitOfUser.has(m.userId)) unitOfUser.set(m.userId, m.unitId);

  const sizes = new Map<string, number>();
  const ofUnit = (unitId: string): number => {
    const known = sizes.get(unitId);
    if (known !== undefined) return known;
    const ids = new Set<string>();
    const walk = (id: string) => {
      ids.add(id);
      for (const u of org.units) if (u.parentId === id && !ids.has(u.id)) walk(u.id);
    };
    walk(unitId);
    const people = new Set<string>();
    for (const s of org.seats) if (ids.has(unitOfRole.get(s.roleId) ?? "")) people.add(s.userId);
    for (const m of org.members) if (m.unitId !== null && ids.has(m.unitId)) people.add(m.userId);
    sizes.set(unitId, people.size);
    return people.size;
  };
  return {
    ofUser: (userId) => {
      const unit = userId ? unitOfUser.get(userId) : undefined;
      return unit === undefined ? null : ofUnit(unit);
    },
    ofUnit,
  };
}

/** Does this actor label hide who it is? A member's handle does; a name does not. */
export const underHandle = (label: string): boolean => label.startsWith(HANDLE_PREFIX);

/** May a raise that hides its raiser name a department with this many people? */
export const deptIsBigEnough = (people: number | null): boolean => people !== null && people >= MIN_GROUP;

/**
 * case.raised at write time: under a handle, the department is blanked unless the raiser's own unit is big
 * enough. A named raiser's payload passes unchanged, and so does every other type.
 */
export function stampDept(type: string, payload: EventPayload, raiser: { label: string; userId: string | null }, people: UnitPeople): EventPayload {
  if (type !== "case.raised" || !payload.fromDept || !underHandle(raiser.label)) return payload;
  return deptIsBigEnough(people.ofUser(raiser.userId)) ? payload : { ...payload, fromDept: "" };
}

/** Does this actor label leave the person unnamed? A handle does, and so does a system actor (system:api). */
const hidesRaiser = (label: string): boolean => underHandle(label) || label.startsWith("system:");

/**
 * The department on a raise the server writes for a person (Teams, API v1): their own users.dept, which is what
 * the web raise sends. Next to a label that does not name them it follows stampDept's rule. No person: none.
 */
export function raiserDept(dept: string | null | undefined, raiser: { label: string; userId: string | null }, people: UnitPeople): string {
  const own = (dept ?? "").trim();
  if (!own || raiser.userId === null) return "";
  return !hidesRaiser(raiser.label) || deptIsBigEnough(people.ofUser(raiser.userId)) ? own : "";
}

type RaisedRow = { type: string; actor: string; actorUserId?: string | null; payload: unknown };

/** Would the rule look at this stored row at all? Lets a caller skip loading the org. */
export function namesDeptUnderHandle(row: RaisedRow): boolean {
  const fromDept = (row.payload as EventPayload | null)?.fromDept;
  return row.type === "case.raised" && underHandle(row.actor) && typeof fromDept === "string" && fromDept !== "";
}

/**
 * The same rule for events already stored, as they leave the server: copies with the department blanked
 * where today's org says the unit is too small. The stored event is never changed.
 */
export function hideSmallDepts<T extends RaisedRow>(rows: readonly T[], people: UnitPeople): readonly T[] {
  if (!rows.some(namesDeptUnderHandle)) return rows;
  return rows.map((r) =>
    namesDeptUnderHandle(r) && !deptIsBigEnough(people.ofUser(r.actorUserId)) ? { ...r, payload: { ...(r.payload as object), fromDept: "" } } : r,
  );
}
