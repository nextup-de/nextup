// OVL-G1 (B2): a log written before OVL reduces to the same State as before, apart from the new empty `overload` (plan OVL, decision D6). The log is the
// fixed pre-REG list of one EventRow of every type the app may append (tests/unit/reg/events-replay.ts), reduced with a fixed seed: no appendEvent, no
// Date.now. The golden in ./snapshot/replay.json was written from the reducer at the base commit, before any OVL change.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { logFromRows } from "@/features/cases/persist";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { emptyOverload, overloadOf } from "@/features/overload/reduce";
import type { ReducedProject } from "@/features/projects/types";
import type { Route, SeedRole } from "@/features/demo/types";
import { REPLAY_ROWS } from "../reg/events-replay";

const SEATS: SeatRow[] = [
  { id: "s_vogel", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "s_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 1 },
  { id: "s_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 2 },
];
const ROLES: SeedRole[] = [
  { id: "role_head", orgUnitId: "u", reportsToId: null },
  { id: "role_owner", orgUnitId: "u", reportsToId: "role_head" },
  { id: "role_deputy", orgUnitId: "u", reportsToId: "role_owner" },
];
const ROUTES: Route[] = [{
  id: "r1", type: "Type", keys: ["k"], owner: { name: "T. Vogel", role: "Owner", dept: "PRD" }, deputy: "H. Sander", buddy: "B", wait: "2 days",
  ownerSeatId: "s_vogel", ownerRoleId: "role_owner", deputySeatId: "s_dep", deputyRoleId: "role_deputy",
}];
export const SEED: ReduceSeed = { cases: [], ideas: [], problems: [], routes: ROUTES, promiseDays: 5, seats: SEATS, roles: ROLES };
export const DAY = 14;

// PGE adds explicit empty page state; leave the pre-OVL golden unchanged.
const beforePages = (p: ReducedProject) => Object.fromEntries(Object.entries(p).filter(([key]) => !["pages", "removed", "merges"].includes(key)));

it("OVL replay writes the golden of a pre-OVL log", async () => {
  const state = reduce(SEED, logFromRows(REPLAY_ROWS, DAY));
  // The golden was written before OVL: the field OVL adds is left out, so it reads the same at the base commit and after.
  await expect(JSON.stringify({ ...state, projects: state.projects.map(beforePages), overload: undefined }, null, 2)).toMatchFileSnapshot("./snapshot/replay.json");
});

it("OVL replay reduces a pre-OVL log to the golden apart from an empty overload", () => {
  const state = reduce(SEED, logFromRows(REPLAY_ROWS, DAY));
  // The new field is the only difference: empty, and read the same through overloadOf as without it.
  expect(state.overload).toEqual({ away: [], desks: [] });
  expect(overloadOf({})).toEqual(emptyOverload());
  expect(JSON.stringify({ ...state, projects: state.projects.map(beforePages), overload: undefined }, null, 2)).toBe(readFileSync("tests/unit/ovl/snapshot/replay.json", "utf8"));
});

let n = 0;
const ev = (type: CaseEventType, by: string | null, target: string | null, payload: Record<string, unknown>, day: number): CaseEvent =>
  ({ id: `ov_${++n}`, ts: 0, type, actor: by === null ? "system:clock" : by, actorUserId: by, target, payload: payload as EventPayload, day });
const away = (id: string, userId: string, from: number, to: number, setBy: string | null = userId) => ev("person.away", userId, null, { userId, from, to, awayId: id, setBy }, from);
const overloadOfLog = (day: number, ...events: CaseEvent[]) => overloadOf(reduce(SEED, { events, day }));

it("OVL replay replaces an overlapping away span and ends it on back", () => {
  // A second span of the same person that overlaps an open one replaces it; another person's span and a span that does not overlap stay.
  const o = overloadOfLog(9,
    away("a1", "u_hs", 3, 8), away("b1", "u_tv", 3, 8), away("a2", "u_hs", 6, 12), away("a3", "u_hs", 20, 25));
  expect(o.away.map((s) => [s.awayId, s.userId, s.from, s.to, s.endedDay])).toEqual([["b1", "u_tv", 3, 8, null], ["a2", "u_hs", 6, 12, null], ["a3", "u_hs", 20, 25, null]]);
  // setBy is the user id of whoever set it; an away span carries no reason and no text.
  expect(overloadOfLog(9, away("a1", "u_hs", 3, 8, "u_head")).away[0]).toEqual({ awayId: "a1", userId: "u_hs", from: 3, to: 8, setBy: "u_head", endedDay: null });
  // back ends the span on that day, and only that span.
  const back = overloadOfLog(9, away("a1", "u_hs", 3, 12), away("b1", "u_tv", 3, 12), ev("person.back", "u_hs", null, { userId: "u_hs", awayId: "a1" }, 7));
  expect(back.away.map((s) => [s.awayId, s.endedDay])).toEqual([["a1", 7], ["b1", null]]);
  // A span that was ended does not block a new one on the same days.
  const again = overloadOfLog(9, away("a1", "u_hs", 3, 12), ev("person.back", "u_hs", null, { userId: "u_hs", awayId: "a1" }, 5), away("a2", "u_hs", 6, 9));
  expect(again.away.map((s) => [s.awayId, s.endedDay])).toEqual([["a1", 5], ["a2", null]]);
  // A span with its last day before its first, or without a whole day, is no span.
  expect(overloadOfLog(9, away("bad", "u_hs", 8, 3)).away).toEqual([]);
  expect(overloadOfLog(9, ev("person.away", "u_hs", null, { userId: "u_hs", from: 1.5, to: 4, awayId: "x" }, 1)).away).toEqual([]);
});

it("OVL replay ignores a back whose awayId belongs to another user", () => {
  const o = overloadOfLog(9, away("a1", "u_hs", 3, 12), ev("person.back", "u_tv", null, { userId: "u_tv", awayId: "a1" }, 5), ev("person.back", "u_hs", null, { userId: "u_hs", awayId: "nope" }, 5));
  expect(o.away).toEqual([{ awayId: "a1", userId: "u_hs", from: 3, to: 12, setBy: "u_hs", endedDay: null }]);
  // The right pair ends it, a second back on the same span changes nothing.
  const ended = overloadOfLog(9, away("a1", "u_hs", 3, 12), ev("person.back", "u_hs", null, { userId: "u_hs", awayId: "a1" }, 5), ev("person.back", "u_hs", null, { userId: "u_hs", awayId: "a1" }, 8));
  expect(ended.away[0].endedDay).toBe(5);
});

it("OVL replay opens an episode at 20, raises it to 30, sets its cover and clears it", () => {
  const over = (level: 20 | 30, day: number) => ev("desk.overloaded", null, "role_owner", { roleId: "role_owner", level, perHolder: level + 1, holders: 2 }, day);
  const covered = (seatId: string, day: number) => ev("desk.covered", "u_head", "role_owner", { roleId: "role_owner", seatId }, day);
  const cleared = (day: number) => ev("desk.cleared", null, "role_owner", { roleId: "role_owner" }, day);
  // A cover with no open episode changes nothing.
  expect(overloadOfLog(9, covered("s_dep", 3)).desks).toEqual([]);
  const opened = overloadOfLog(9, over(20, 4));
  expect(opened.desks).toEqual([{ roleId: "role_owner", since: 4, level: 20, coverSeatId: null, clearedDay: null }]);
  // 30 raises the open episode, it does not open a second one; the cover is set on it.
  const raised = overloadOfLog(9, over(20, 4), over(30, 6), covered("s_dep", 7));
  expect(raised.desks).toEqual([{ roleId: "role_owner", since: 4, level: 30, coverSeatId: "s_dep", clearedDay: null }]);
  // 20 again does not lower it.
  expect(overloadOfLog(9, over(20, 4), over(30, 6), over(20, 7)).desks[0].level).toBe(30);
  // Cleared closes it; the next overload opens a new episode with its own since.
  const done = overloadOfLog(12, over(20, 4), over(30, 6), covered("s_dep", 7), cleared(9));
  expect(done.desks).toEqual([{ roleId: "role_owner", since: 4, level: 30, coverSeatId: "s_dep", clearedDay: 9 }]);
  const next = overloadOfLog(12, over(20, 4), cleared(9), over(20, 11));
  expect(next.desks.map((d) => [d.since, d.clearedDay])).toEqual([[4, 9], [11, null]]);
  // org.seat.vacant changes no state, and none of the six reaches a case.
  const vacant = ev("org.seat.vacant", null, "s_dep", { seatId: "s_dep", roleId: "role_deputy", userId: "u_hs" }, 5);
  const plain = reduce(SEED, logFromRows(REPLAY_ROWS, DAY));
  const withOvl = reduce(SEED, { events: [...logFromRows(REPLAY_ROWS, DAY).events, vacant, over(20, 5), cleared(6)], day: DAY });
  expect(withOvl.cases).toEqual(plain.cases);
  expect(withOvl.projects).toEqual(plain.projects);
});
