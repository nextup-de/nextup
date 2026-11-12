// OVL-A1 (B1): who may set and end an absence, take cases back and share a desk's load (plan OVL, D19, D28, D31). Fixed literal states; the rights are pure
// functions of the reduced state and of the seat above a role, which the server builds from the org chart (here a literal map).
import { expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import type { SeatAbove } from "@/features/clock/due";
import type { OverloadState } from "@/features/overload/types";
import { awayTargets, checkSpan, currentOrNextSpan, mayShareLoad, maySetAway, mayTakeBack, touchedSinceAway } from "@/features/overload/rights";
import { EMPTY_APPROVAL_CONFIG } from "@/features/approvals/types";

const SEATS: SeatRow[] = [
  { id: "seat_a", roleId: "role_desk", label: "A. Desk", userId: "u_a", sort: 0 },
  { id: "seat_b", roleId: "role_desk", label: "B. Desk", userId: "u_b", sort: 1 },
  { id: "seat_boss", roleId: "role_boss", label: "S. Boss", userId: "u_boss", sort: 2 },
  { id: "seat_exec", roleId: "role_exec", label: "E. Exec", userId: "u_exec", sort: 3 },
  { id: "seat_peer", roleId: "role_peer", label: "P. Peer", userId: "u_peer", sort: 4 },
];
/** The seat directly above a role: a literal map, nobody above the top. */
const UP: Record<string, string> = { role_desk: "seat_boss", role_boss: "seat_exec", role_peer: "seat_boss" };
const above: SeatAbove = (roleId) => UP[roleId] ?? null;

const MEMBERS = [
  { userId: "u_a", name: "Anna", active: true }, { userId: "u_b", name: "Ben", active: true }, { userId: "u_boss", name: "Sam", active: true },
  { userId: "u_exec", name: "Eve", active: true }, { userId: "u_peer", name: "Pia", active: true }, { userId: "u_member", name: "Max", active: true },
  { userId: "u_gone", name: "Gina", active: false }, { userId: "u_c", name: "Carl", active: true },
];
const ME = { leader: "leader", member: "member", manager: "manager" } as const;
const as = (userId: string, role: string = ME.leader) => ({ userId, role });

let n = 0;
const ev = (type: string, actor: string, actorUserId: string | null, target: string, payload: Record<string, unknown> = {}): CaseEvent =>
  ({ id: "e" + n++, ts: 0, day: 0, type, actor, actorUserId, target, payload }) as CaseEvent;
const clockAway = (id: string) => ev("case.handed", "system:clock", null, id, { why: "away", to: "Cover", toRoleHolderId: "seat_b" });

/** A case the clock handed from seat A to seat B on day 11, during a span 10..12 of user A that is over on day 20. */
const handed = (id: string, over: Record<string, unknown> = {}) => {
  const away = clockAway(id);
  return {
    id, status: "open", assigneeSeatId: "seat_b", assigneeRoleId: "role_desk", dueDay: 50, approvals: null, decided: null, decisions: [], routeId: null, review: null,
    handed: [{ from: "system:clock", fromUserId: null, to: "Cover", toSeatId: "seat_b", why: "away", day: 11, fromSeatId: "seat_a", back: false, up: false }],
    history: [away], reopens: [], reopenSeq: null, decidedSeq: null, ...over,
  };
};
const overload = (away: OverloadState["away"] = [], desks: OverloadState["desks"] = []): OverloadState => ({ away, desks });
const span = (over: Partial<OverloadState["away"][number]> = {}) => ({ awayId: "away1", userId: "u_a", from: 10, to: 12, setBy: "u_a", endedDay: null, ...over });
const stateOf = (cases: Record<string, unknown>[] = [], o: OverloadState = overload(), day = 20): State =>
  ({ day, cases, projects: [], ideas: [], problems: [], ledger: {}, rules: { escalationDays: 3 }, seats: SEATS, routes: [], clock: { mode: "demo" }, approvals: { ...EMPTY_APPROVAL_CONFIG, roles: [] }, overload: o }) as unknown as State;
const key = (v: ReturnType<typeof maySetAway>) => (v.ok ? "ok" : v.key);

it("OVL rights lets a person set their own span", () => {
  const state = stateOf();
  for (const role of ["member", "leader"]) expect(maySetAway(as("u_member", role), { userId: "u_member", active: true }, state, above)).toEqual({ ok: true });
  expect(maySetAway(as("u_a"), { userId: "u_a", active: true }, state, above)).toEqual({ ok: true });
  // The span is today or later, whole days, at most 120 working days.
  expect(checkSpan(20, 20, 20)).toEqual({ ok: true });
  expect(checkSpan(21, 140, 20)).toEqual({ ok: true });
});

it("OVL rights lets the holder of the seat directly above set a span", () => {
  const state = stateOf();
  // S. Boss sits directly above the desk role: both desk holders may be set away by them, in either direction of the call.
  for (const target of ["u_a", "u_b"]) expect(maySetAway(as("u_boss"), { userId: target, active: true }, state, above)).toEqual({ ok: true });
  // A person on two seats: the seat above either of them is enough.
  const two = { ...state, seats: [...SEATS, { id: "seat_c2", roleId: "role_peer", label: "A. Also", userId: "u_a", sort: 9 }] } as State;
  expect(maySetAway(as("u_boss"), { userId: "u_a", active: true }, two, above)).toEqual({ ok: true });
});

it("OVL rights lets a company admin set a span for any member", () => {
  const state = stateOf();
  for (const target of ["u_a", "u_boss", "u_exec", "u_member"]) expect(maySetAway(as("u_admin", ME.manager), { userId: target, active: true }, state, above)).toEqual({ ok: true });
});

it("OVL rights refuses a leader or member who is not directly above", () => {
  const state = stateOf();
  expect(key(maySetAway(as("u_peer"), { userId: "u_a", active: true }, state, above))).toBe("overload.away.errRights"); // a peer of the boss, not above
  expect(key(maySetAway(as("u_b"), { userId: "u_a", active: true }, state, above))).toBe("overload.away.errRights"); // a colleague on the same desk
  expect(key(maySetAway(as("u_member", ME.member), { userId: "u_a", active: true }, state, above))).toBe("overload.away.errRights");
  expect(key(maySetAway(as("u_a"), { userId: "u_boss", active: true }, state, above))).toBe("overload.away.errRights"); // below does not reach up
  // A person with no seat has nobody above them: only they and an admin set it.
  expect(key(maySetAway(as("u_boss"), { userId: "u_member", active: true }, state, above))).toBe("overload.away.errRights");
});

it("OVL rights refuses the seat two levels above", () => {
  const state = stateOf();
  expect(key(maySetAway(as("u_exec"), { userId: "u_a", active: true }, state, above))).toBe("overload.away.errRights"); // E. Exec is above S. Boss, not directly above the desk
  expect(maySetAway(as("u_exec"), { userId: "u_boss", active: true }, state, above)).toEqual({ ok: true }); // but directly above the boss
});

it("OVL rights lists the people directly below for a seat holder", () => {
  const state = stateOf();
  expect(awayTargets(as("u_boss"), MEMBERS, state, above).map((m) => m.name)).toEqual(["Anna", "Ben", "Pia"]); // the desk's two holders and the peer role, sorted by name; never the boss
  expect(awayTargets(as("u_exec"), MEMBERS, state, above).map((m) => m.name)).toEqual(["Sam"]);
  expect(awayTargets(as("u_a"), MEMBERS, state, above)).toEqual([]); // nobody sits below
  expect(awayTargets(as("u_member", ME.member), MEMBERS, state, above)).toEqual([]);
});

it("OVL rights lists every active member for a company admin", () => {
  const list = awayTargets(as("u_exec", ME.manager), MEMBERS, stateOf(), above);
  // Everyone active but the viewer, by name; an inactive member is not a target.
  expect(list.map((m) => m.name)).toEqual(["Anna", "Ben", "Carl", "Max", "Pia", "Sam"]);
  expect(list.some((m) => m.userId === "u_gone")).toBe(false);
  expect(list.some((m) => m.userId === "u_exec")).toBe(false);
});

it("OVL rights refuses a target that is missing or inactive", () => {
  const state = stateOf();
  for (const viewer of [as("u_a"), as("u_boss"), as("u_admin", ME.manager)]) {
    expect(key(maySetAway(viewer, null, state, above))).toBe("overload.away.errTarget");
    expect(key(maySetAway(viewer, { userId: "u_a", active: false }, state, above))).toBe("overload.away.errTarget");
  }
});

it("OVL rights refuses a span from yesterday, over 120 days or with a fractional day", () => {
  const range = "overload.away.errRange";
  const bad = (from: unknown, to: unknown, today = 20) => { const v = checkSpan(from, to, today); return v.ok ? "ok" : v.key; };
  expect(bad(19, 25)).toBe(range); // yesterday
  expect(bad(25, 24)).toBe(range); // the last day before the first
  expect(bad(20, 141)).toBe(range); // 121 working days
  expect(bad(20, 140)).toBe("ok"); // 120
  for (const [from, to] of [[20.5, 30], [20, 30.5], [NaN, 30], [20, Infinity], ["20", 30], [20, null], [undefined, 30]]) expect(bad(from, to), `${from} ${to}`).toBe("overload.err.badDay");
});

it("OVL rights refuses take back of a touched case or a case of someone else", () => {
  const o = overload([span()]);
  const state = stateOf([handed("c1"), handed("c2"), handed("c3", { assigneeSeatId: "seat_boss" }), handed("c_open_span")], o);
  const events = (id: string) => [clockAway(id)];
  // The person who was away, once the span is over, takes back a case nobody touched.
  expect(mayTakeBack({ userId: "u_a" }, "c1", state, 20, events("c1"))).toEqual({ ok: true });
  expect(mayTakeBack({ userId: "u_a" }, "c1", state, 20)).toEqual({ ok: true });
  // Somebody else, a case that does not exist and a case that is not on the cover's seat any more.
  for (const [who, id] of [["u_b", "c1"], ["u_boss", "c1"], ["u_a", "c_none"], ["u_a", "c3"]]) expect(mayTakeBack({ userId: who }, id, state, 20)).toEqual({ ok: false, key: "overload.err.nothing" });
  // Still away: nothing to take back yet.
  expect(mayTakeBack({ userId: "u_a" }, "c1", stateOf([handed("c1")], overload([span({ to: 30 })])), 20)).toEqual({ ok: false, key: "overload.err.nothing" });
  // Touched: a person wrote on the reduced case after the hand-over, or - in the log only - a comment or a co-sign did.
  const touched = handed("c4", { history: [clockAway("c4"), ev("case.asked", "T. Vogel", "u_b", "c4", { text: "Which line?" })] });
  expect(mayTakeBack({ userId: "u_a" }, "c4", stateOf([touched], o), 20)).toEqual({ ok: false, key: "overload.err.nothing" });
  const comment = ev("case.commented", "B. Desk", "u_b", "c1", { text: "New information" });
  expect(mayTakeBack({ userId: "u_a" }, "c1", state, 20, [clockAway("c1"), comment])).toEqual({ ok: false, key: "overload.err.nothing" });
  expect(touchedSinceAway([clockAway("c1"), ev("case.affected", "M. Roth", "u_member", "c1")], "c1")).toBe(true);
  // The clock's and a system actor's later events, and events of other cases, are no touch.
  expect(touchedSinceAway([clockAway("c1"), ev("clock.due", "system:clock", null, "c1", { kind: "deadline" }), ev("case.handed", "system:cover", null, "c1", { why: "takeback" }), ev("case.commented", "B", "u_b", "c9")], "c1")).toBe(false);
  expect(currentOrNextSpan(stateOf([], overload([span({ to: 30 }), span({ awayId: "later", from: 40, to: 45 }), span({ awayId: "ended", endedDay: 15, to: 30 })])), "u_a", 20)).toEqual({ awayId: "away1", from: 10, to: 30 });
  expect(currentOrNextSpan(stateOf([], overload([span()])), "u_a", 20)).toBeNull();
});

/** A desk of two holders with `open` cases on it. */
const desk = (open: number, o: OverloadState = overload()) =>
  stateOf(Array.from({ length: open }, (_, i) => ({ id: `d${i}`, status: "open", assigneeSeatId: "seat_a", assigneeRoleId: "role_desk", dueDay: 99, approvals: null, handed: [], history: [], decided: null, decisions: [], routeId: null, review: null, reopens: [], reopenSeq: null, decidedSeq: null })), o);

it("OVL rights lets the seat above share the load only at up or overflow", () => {
  const boss = as("u_boss");
  // 2 holders: 38 open is 19 each (triage), 40 is 20 each (up), 60 is 30 each (overflow).
  expect(mayShareLoad(boss, "role_desk", desk(38), 20, above)).toEqual({ ok: false, key: "overload.err.notOverloaded" });
  expect(mayShareLoad(boss, "role_desk", desk(40), 20, above)).toEqual({ ok: true });
  expect(mayShareLoad(boss, "role_desk", desk(60), 20, above)).toEqual({ ok: true });
  // A person away does not count as a holder: one present holder makes 21 cases an up desk.
  expect(mayShareLoad(boss, "role_desk", desk(21, overload([span({ userId: "u_b", from: 10, to: 30 })])), 20, above)).toEqual({ ok: true });
  // The holders of the seat two levels above, and of the desk itself, are not the seat above.
  expect(mayShareLoad(as("u_exec"), "role_desk", desk(40), 20, above)).toEqual({ ok: false, key: "overload.err.notAbove" });
  expect(mayShareLoad(as("u_a"), "role_desk", desk(40), 20, above)).toEqual({ ok: false, key: "overload.err.notAbove" });
  expect(mayShareLoad(boss, "role_none", desk(40), 20, above)).toEqual({ ok: false, key: "overload.err.notAbove" });
});

it("OVL rights lets a manager share the load of any overloaded desk", () => {
  const admin = as("u_admin", ME.manager);
  expect(mayShareLoad(admin, "role_desk", desk(40), 20, above)).toEqual({ ok: true });
  expect(mayShareLoad(admin, "role_desk", desk(60), 20, above)).toEqual({ ok: true });
  // The desk must still be overloaded, and a desk without work has no level.
  expect(mayShareLoad(admin, "role_desk", desk(10), 20, above)).toEqual({ ok: false, key: "overload.err.notOverloaded" });
  expect(mayShareLoad(admin, "role_boss", desk(40), 20, above)).toEqual({ ok: false, key: "overload.err.notOverloaded" });
});

it("OVL rights refuses a member sharing the load", () => {
  expect(mayShareLoad(as("u_member", ME.member), "role_desk", desk(60), 20, above)).toEqual({ ok: false, key: "overload.err.notAbove" });
  // The seat decides, not the app role: the holder of the seat above may, whatever their role, and a peer seat may not.
  expect(mayShareLoad(as("u_boss", ME.member), "role_desk", desk(60), 20, above)).toEqual({ ok: true });
  expect(mayShareLoad(as("u_peer", ME.member), "role_desk", desk(60), 20, above)).toEqual({ ok: false, key: "overload.err.notAbove" });
});
