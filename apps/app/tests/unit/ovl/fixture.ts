// OVL-G1: a small company for the helper tests: a desk with two holders, a deputy desk, a seat above and a director, one route, fixed days, no clock.
import { EMPTY_APPROVAL_CONFIG } from "@/features/approvals/types";
import { meFor, type SeatRow } from "@/features/auth/identity";
import { DEFAULT_CALENDAR } from "@/features/clock";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import type { SeedRole, Route } from "@/features/demo/types";
import type { InboxSourceInput } from "@/features/inbox/sources/cases";
import type { LoopRules } from "@/features/loop/rules";

export const SEATS: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "T. Vogel", userId: "u_own", sort: 0 },
  { id: "s_own2", roleId: "role_owner", label: "N. Keller", userId: "u_own2", sort: 1 },
  { id: "s_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_dep", sort: 2 },
  { id: "s_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 3 },
  { id: "s_head2", roleId: "role_head", label: "P. Boss", userId: "u_head2", sort: 4 },
  { id: "s_plant", roleId: "role_plant", label: "P. Plant", userId: "u_plant", sort: 5 },
];
export const ROLES: SeedRole[] = [
  { id: "role_head", orgUnitId: "u", reportsToId: null, title: "Director" },
  { id: "role_plant", orgUnitId: "u", reportsToId: "role_head", title: "Plant manager", spendLimitEur: 25_000 },
  { id: "role_owner", orgUnitId: "u", reportsToId: "role_head", title: "Quality lead", spendLimitEur: 5_000 },
  { id: "role_deputy", orgUnitId: "u", reportsToId: "role_owner", title: "Line lead" },
];
export const ROUTES: Route[] = [{
  id: "r1", type: "Type", keys: ["k"], owner: { name: "T. Vogel", role: "Owner", dept: "PRD" }, deputy: "H. Sander", buddy: "B", wait: "2 days",
  ownerSeatId: "s_own", ownerRoleId: "role_owner", deputySeatId: "s_dep", deputyRoleId: "role_deputy",
}];
export const NAME: Record<string, string> = { u_own: "T. Vogel", u_own2: "N. Keller", u_dep: "H. Sander", u_head: "K. Head", u_head2: "P. Boss", u_plant: "P. Plant", u_ra: "J. Schmidt", u_rb: "M. Roth" };

export const seedOf = (over: Partial<ReduceSeed> = {}): ReduceSeed => ({
  cases: [], ideas: [], problems: [], routes: ROUTES, clock: { mode: "workdays", calendar: DEFAULT_CALENDAR }, promiseDays: 5, seats: SEATS, roles: ROLES, approvals: { ...EMPTY_APPROVAL_CONFIG, councils: [{ id: "k1", name: "Council", memberRoleIds: ["role_plant"], secretaryRoleId: "role_plant", everyDays: 10, firstDay: 3 }] }, ...over,
});

let n = 0;
export const ev = (type: CaseEventType, by: string | null, target: string | null, payload: Record<string, unknown>, day: number, actor?: string): CaseEvent =>
  ({ id: `h${++n}`, ts: 0, type, actor: actor ?? (by === null ? "system:clock" : NAME[by] ?? by), actorUserId: by, target, payload: payload as EventPayload, day });

/** A raise on the route's owner desk, by a person who is on no desk. */
export const raise = (id: string, day = 0, by = "u_ra", seat = "s_own") =>
  ev("case.raised", by, id, { kind: "idea", title: "Case " + id, body: "b", routeId: "r1", assignee: NAME[seat === "s_own" ? "u_own" : "u_dep"], assigneeRoleHolderId: seat, fromDept: "PRD" }, day);
export const away = (awayId: string, userId: string, from: number, to: number, setBy: string | null = userId) => ev("person.away", userId, null, { userId, from, to, awayId, setBy }, from);
export const back = (awayId: string, userId: string, day: number) => ev("person.back", userId, null, { userId, awayId }, day);
/** The clock hands a case on, with its reason ('away', 'overflow', 'escalation'). */
export const handed = (id: string, toSeat: string, why: string, day: number) => ev("case.handed", null, id, { to: SEATS.find((s) => s.id === toSeat)?.label ?? toSeat, toRoleHolderId: toSeat, why }, day);

export const stateOf = (day: number, events: CaseEvent[], over: Partial<ReduceSeed> = {}, loop?: Partial<LoopRules>): State => reduce(seedOf({ ...(loop ? { loop } : {}), ...over }), { events, day });
export const above = (roleId: string): string | null => (roleId === "role_owner" || roleId === "role_deputy" ? "s_head" : null);
export const inboxInput = (state: State, userId: string, today: number): InboxSourceInput => ({ state, me: meFor(userId, SEATS), seats: SEATS, today, demo: false, flags: { projects: true, discussion: true } });
