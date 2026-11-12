// The fixed log of NOR-A1's replay proof (B3): written the way main writes events before NOR, over literal seats and routes.
// Every value is a literal; nothing here is built by the reducer.
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import type { ReduceSeed, State } from "@/features/cases/reducer";
import type { Route } from "@/features/demo/types";

export const SEATS: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "T. Vogel", userId: "u_own", sort: 0 },
  { id: "s_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_dep", sort: 1 },
  { id: "s_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 2 },
  { id: "s_o2", roleId: "role_o2", label: "E. Wagner", userId: "u_o2", sort: 3 },
];

const route = (id: string, ownerSeat: string, ownerRole: string, owner: string, deputySeat: string | null, deputyRole: string | null, deputy: string): Route => ({
  id, type: "Type " + id, keys: [id], owner: { name: owner, role: ownerRole, dept: "PRD" }, deputy, buddy: "B", wait: "2 days",
  ownerSeatId: ownerSeat, ownerRoleId: ownerRole, deputySeatId: deputySeat, deputyRoleId: deputyRole,
});
export const ROUTES: Route[] = [
  route("r1", "s_own", "role_owner", "T. Vogel", "s_dep", "role_deputy", "H. Sander"),
  route("r2", "s_o2", "role_o2", "E. Wagner", "s_own", "role_owner", "T. Vogel"),
];

export const seedOf = (workdays: boolean): ReduceSeed => ({
  cases: [], ideas: [], problems: [], routes: ROUTES, promiseDays: 5, seats: SEATS,
  ...(workdays ? { clock: { mode: "workdays", calendar: { weekend: [0, 6], holidays: [], extraHolidays: [] } } as unknown as ReduceSeed["clock"] } : {}),
});

const NAME: Record<string, string> = { u_own: "T. Vogel", u_dep: "H. Sander", u_head: "K. Head", u_o2: "E. Wagner", u_ra: "J. Schmidt", u_rb: "M. Roth" };
let n = 0;
const ev = (type: CaseEventType, by: string | null, target: string | null, payload: EventPayload, day: number): CaseEvent =>
  ({ id: "r" + n++, ts: 0, type, actor: by === null ? "system:clock" : NAME[by], actorUserId: by, target, payload, day });
const raise = (id: string, route: string, by: string, day: number) => ev("case.raised", by, id, { kind: "problem", title: "Case " + id, routeId: route, assignee: "x", assigneeRoleHolderId: route === "r1" ? "s_own" : "s_o2" }, day);

/** A log as main wrote it: old noes with picked ids and with Teams' free text, a pass on an asked case, passes without routeId or dueDay, a discussion, a deadline hand-over and an escalation. */
export function preNorEvents(): CaseEvent[] {
  n = 0;
  return [
    raise("ca", "r1", "u_ra", 0), raise("cb", "r1", "u_rb", 0), raise("cc", "r1", "u_ra", 0), raise("cd", "r1", "u_rb", 0),
    raise("ce", "r1", "u_ra", 0), raise("cf", "r2", "u_rb", 1), raise("cg", "r1", "u_ra", 2), raise("ch", "r2", "u_rb", 2),
    ev("case.read", "u_own", "ca", {}, 1),
    ev("case.decided", "u_own", "ca", { answer: "no", reason: "no time", note: "The plan is full until Q4" }, 2),
    ev("case.decided", "u_own", "cb", { answer: "no", reason: "Too costly" }, 1),
    ev("case.asked", "u_own", "cc", { text: "Which line?" }, 1),
    ev("case.handed", "u_own", "cc", { to: "H. Sander", toRoleHolderId: "s_dep", why: "not mine" }, 2), // on an asked case without keepsQuestion: ignored
    ev("case.answered", "u_ra", "cc", { text: "Line 3" }, 3),
    ev("case.handed", "u_own", "cc", { to: "H. Sander", toRoleHolderId: "s_dep", why: "Quality owns it" }, 3),
    ev("case.handed", "u_dep", "cc", { to: "E. Wagner", toRoleHolderId: "s_o2", why: "Engineering owns it" }, 4),
    ev("case.discussion", "u_own", "cd", { invited: ["H. Sander"], invitedUserIds: ["u_dep"], missing: "The saving" }, 1),
    ev("case.invited", "u_own", "cd", { invited: ["K. Head"], invitedUserIds: ["u_head"] }, 2),
    ev("case.revised", "u_rb", "cd", { body: "A better body", title: "Case cd v2", overall: 70 }, 3),
    ev("case.checkin", "u_own", "cd", { next: "round", open: ["Cost"], note: "Round one" }, 3),
    ev("case.checkin", "u_own", "cd", { next: "decide", open: [], note: "Ready" }, 5),
    ev("case.decided", "u_own", "cd", { answer: "yes", projectId: "p_cd", lead: "T. Vogel", leadUserId: "u_own", title: "Case cd" }, 6),
    ev("clock.due", null, "ce", { kind: "deadline", dueDay: 5, toRoleHolderId: "s_dep" }, 6),
    ev("case.handed", null, "ce", { to: "H. Sander", toRoleHolderId: "s_dep", why: "deadline" }, 6),
    ev("clock.due", null, "ce", { kind: "deadline", dueDay: 8, toRoleHolderId: "s_head" }, 9),
    ev("clock.due", null, "ce", { kind: "escalation", dueDay: 8, toRoleHolderId: "s_head" }, 9),
    ev("case.discussion", "u_own", "cg", { invited: ["K. Head"], invitedUserIds: ["u_head"], missing: "A number" }, 2),
    ev("case.withdrawn", "u_rb", "ch", { note: "Changed my mind" }, 4),
    ev("case.override", "u_head", "cf", { proposed: "r2", chosen: "r1" }, 5),
  ];
}
export const LOG_DAY = 12;

// The fields a case had before NOR (decision D6): everything but the NOR additions.
const OLD_DECISION = ["answer", "reason", "note", "by", "day", "projectId", "lead", "byUserId"] as const;
const pick = <T extends object>(o: T | null, keys: readonly string[]) => (o === null ? null : Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, (o as Record<string, unknown>)[k]])));
export const oldFields = (c: State["cases"][number]) => ({
  id: c.id, kind: c.kind, title: c.title, body: c.body, from: c.from, fromUserId: c.fromUserId, assigneeSeatId: c.assigneeSeatId, assigneeRoleId: c.assigneeRoleId,
  routeId: c.routeId, assignee: c.assignee, raisedDay: c.raisedDay, status: c.status, read: c.read,
  decided: pick(c.decided, OLD_DECISION), withdrawn: c.withdrawn, question: c.question,
  handed: c.handed.map((h) => pick(h, ["from", "fromUserId", "to", "toSeatId", "why", "day"])),
  discussion: c.discussion ? { ...pick(c.discussion, ["startedDay", "by", "byUserId", "invited", "invitedUserIds", "missing", "rounds", "round", "ready", "lastDay"]) } : null,
  versions: c.versions.length, pausedDays: c.pausedDays, pausedSince: c.pausedSince, history: c.history.map((e) => e.id),
  route: c.route?.id ?? null, age: c.age, clock: c.clock, open: c.open, archived: c.archived, overdue: c.overdue, dueDay: c.dueDay, escalated: c.escalated, override: c.override,
});
