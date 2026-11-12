// OVL-C1 (B1): what the clock lists for absence and overload (plan OVL, D24, D26, D29). Literal States in workdays mode, fixed days, no database. Every Due names a
// case or a desk (a role) and a seat, never a person. Flat tests (D32).
import { expect, it } from "vitest";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { dueNow, type Due } from "@/features/clock/due";
import { overloadAfterFacts, overloadDues } from "@/features/clock/kinds/overload";
import { above, away, ev, handed, NAME, raise, ROUTES, SEATS, stateOf } from "./fixture";

const TIGHT = { overloadAt: { triage: 2, up: 4, overflow: 6, late: 5 } }; // thresholds a test can reach with a few cases
const SOLE = SEATS.filter((s) => s.id !== "s_own2"); // the owner desk with one holder
const dues = (state: ReturnType<typeof stateOf>, today: number) => overloadDues(state, today, above);
const kinds = (list: Due[]) => list.map((d) => d.kind);
/** n cases raised on day 0 on the owner desk (or another seat). */
const open = (n: number, seat = "s_own") => Array.from({ length: n }, (_, i) => raise(`c${i}`, 0, "u_ra", seat));
const overloaded = (roleId: string, level: 20 | 30, day: number) => ev("desk.overloaded", null, roleId, { roleId, level, perHolder: level + 1, holders: 1 }, day);

it("OVL clock hands the case of an away holder to another present holder", () => {
  const s = stateOf(5, [raise("ca"), away("a1", "u_own", 3, 8)]);
  expect(dues(s, 5)).toEqual([{ kind: "away", target: "ca", dueDay: 5, toRoleHolderId: "s_own2", idemKey: "ovl:away:ca:a1" }]);
  // A case on the other holder's seat, and a case of a holder who is not away, wait for nobody's cover.
  expect(dues(stateOf(5, [raise("cb", 0, "u_ra", "s_own2"), away("a1", "u_own", 3, 8)]), 5)).toEqual([]);
  // Before the span and after it nothing is due.
  expect(dues(stateOf(2, [raise("ca"), away("a1", "u_own", 3, 8)]), 2)).toEqual([]);
  expect(dues(stateOf(9, [raise("ca"), away("a1", "u_own", 3, 8)]), 9)).toEqual([]);
});

it("OVL clock hands the case of a single away holder to the deputy role", () => {
  const s = stateOf(5, [raise("ca"), away("a1", "u_own", 3, 8)], { seats: SOLE });
  expect(dues(s, 5)).toEqual([{ kind: "away", target: "ca", dueDay: 5, toRoleHolderId: "s_dep", idemKey: "ovl:away:ca:a1" }]);
});

it("OVL clock hands to the seat above when there is no deputy", () => {
  const noDeputy = [{ ...ROUTES[0], deputySeatId: undefined, deputyRoleId: undefined }];
  const s = stateOf(5, [raise("ca"), away("a1", "u_own", 3, 8)], { seats: SOLE, routes: noDeputy });
  expect(dues(s, 5)).toEqual([{ kind: "away", target: "ca", dueDay: 5, toRoleHolderId: "s_head", idemKey: "ovl:away:ca:a1" }]);
});

it("OVL clock lists nothing when nobody can cover", () => {
  const everyone = [away("a1", "u_own", 3, 8), away("a2", "u_own2", 3, 8), away("a3", "u_dep", 3, 8), away("a4", "u_head", 3, 8)];
  expect(kinds(dues(stateOf(5, [raise("ca"), ...everyone]), 5))).toEqual([]);
  // The case is still counted on its desk: it is not handed, it waits (one hop, no further).
  expect(dues(stateOf(5, [raise("ca"), ...everyone]), 5)).toEqual([]);
});

it("OVL clock tells the seat above once at 20", () => {
  const s = stateOf(5, open(4), { seats: SOLE }, TIGHT);
  expect(dues(s, 5)).toEqual([{ kind: "overloaded", target: "role_owner", dueDay: 5, check: 20, idemKey: "ovl:up:role_owner:5:20" }]);
  // With the episode written it is not told again; the same load on a later day writes nothing.
  const told = stateOf(6, [...open(4), overloaded("role_owner", 20, 5)], { seats: SOLE }, TIGHT);
  expect(dues(told, 6)).toEqual([]);
  expect(dues(stateOf(9, [...open(4), overloaded("role_owner", 20, 5)], { seats: SOLE }, TIGHT), 9)).toEqual([]);
});

it("OVL clock raises the episode at 30 and overflows a new case in the same run", () => {
  // Six cases and a seventh raised today, one holder, overflow from 6: the desk reaches 30 in this run and the new case goes to the deputy seat.
  const s = stateOf(5, [...open(6), raise("cnew", 5)], { seats: SOLE }, TIGHT);
  expect(dues(s, 5)).toEqual([
    { kind: "overloaded", target: "role_owner", dueDay: 5, check: 30, idemKey: "ovl:up:role_owner:5:30" },
    { kind: "overflow", target: "cnew", dueDay: 5, toRoleHolderId: "s_dep", idemKey: "ovl:overflow:cnew:5" },
  ]);
  // An episode at 20 is raised to 30 once, keeping its own day: the cases raised since then overflow, the older ones stay.
  const raised = stateOf(7, [...open(6), overloaded("role_owner", 20, 3), raise("cmid", 4), raise("cnew", 7)], { seats: SOLE }, TIGHT);
  expect(dues(raised, 7).map((d) => [d.kind, d.target, d.check, d.idemKey])).toEqual([
    ["overloaded", "role_owner", 30, "ovl:up:role_owner:3:30"], ["overflow", "cmid", undefined, "ovl:overflow:cmid:3"], ["overflow", "cnew", undefined, "ovl:overflow:cnew:3"],
  ]);
  expect(dues(stateOf(8, [...open(6), overloaded("role_owner", 30, 3), raise("cmid", 4), raise("cnew", 7)], { seats: SOLE }, TIGHT), 8).map((d) => d.kind)).toEqual(["overflow", "overflow"]); // at 30 already: no second fact
});

it("OVL clock does not overflow an older case or one a person handed", () => {
  const people = ev("case.handed", "u_own", "cpass", { to: "N. Keller", toRoleHolderId: "s_own2", why: "Their machine" }, 5);
  const s = stateOf(5, [...open(6), raise("cold", 3), raise("cpass", 5), people, raise("cnew", 5)], { seats: SOLE, ...{} }, TIGHT);
  // The episode starts today: the cases raised before it stay, the one a person handed stays, only the new one goes.
  expect(dues(s, 5).filter((d) => d.kind === "overflow").map((d) => d.target)).toEqual(["cnew"]);
});

it("OVL clock never overflows to the source role", () => {
  // The route's deputy role is the deputy desk itself: when that desk overloads, the case has nowhere to go and stays (no seat above).
  const s = stateOf(5, [...open(6, "s_dep"), raise("cnew", 5, "u_ra", "s_dep")], {}, TIGHT);
  expect(kinds(dues(s, 5))).toEqual(["overloaded"]);
  // An appointed cover that sits on the source role itself is passed over for the deputy.
  const cover = stateOf(7, [...open(6), overloaded("role_owner", 30, 3), ev("desk.covered", "u_head", "role_owner", { roleId: "role_owner", seatId: "s_own2" }, 4), raise("cnew", 6)], { seats: SEATS }, TIGHT);
  expect(dues(cover, 7).filter((d) => d.kind === "overflow").every((d) => d.toRoleHolderId === "s_dep")).toBe(true);
});

it("OVL clock overflows at 20 to an appointed cover", () => {
  // The desk is at up, not at overflow: without a cover nothing overflows, with an appointed cover the new cases do (D24).
  const events = [...open(4), overloaded("role_owner", 20, 3), raise("cnew", 6)];
  expect(kinds(dues(stateOf(6, events, { seats: SOLE }, TIGHT), 6))).toEqual([]);
  const covered = stateOf(6, [...events, ev("desk.covered", "u_head", "role_owner", { roleId: "role_owner", seatId: "s_plant" }, 5)], { seats: SOLE }, TIGHT);
  expect(dues(covered, 6)).toEqual([{ kind: "overflow", target: "cnew", dueDay: 6, toRoleHolderId: "s_plant", idemKey: "ovl:overflow:cnew:3" }]);
});

it("OVL clock does not overflow when the deputy desk is at overflow", () => {
  const s = stateOf(5, [...open(6), raise("cnew", 5), ...Array.from({ length: 6 }, (_, i) => raise(`d${i}`, 0, "u_ra", "s_dep"))], { seats: SOLE }, TIGHT);
  const list = dues(s, 5);
  expect(list.filter((d) => d.kind === "overflow")).toEqual([]);
  expect(list.filter((d) => d.kind === "overloaded").map((d) => [d.target, d.check]).sort()).toEqual([["role_deputy", 30], ["role_owner", 30]]);
});

it("OVL clock clears the episode under 20", () => {
  const s = stateOf(9, [...open(3), overloaded("role_owner", 30, 4)], { seats: SOLE }, TIGHT);
  expect(dues(s, 9)).toEqual([{ kind: "cleared", target: "role_owner", dueDay: 9, idemKey: "ovl:clear:role_owner:4" }]);
  // Still at up: no clear. A cleared episode is not cleared again.
  expect(dues(stateOf(9, [...open(4), overloaded("role_owner", 20, 4)], { seats: SOLE }, TIGHT), 9)).toEqual([]);
  expect(dues(stateOf(9, [...open(3), overloaded("role_owner", 30, 4), ev("desk.cleared", null, "role_owner", { roleId: "role_owner" }, 8)], { seats: SOLE }, TIGHT), 9)).toEqual([]);
});

it("OVL clock gives no OVL hand-over to a case the case area hands in the same run", () => {
  // ca is past its answer date with the deadline fact written: the case area hands it to the deputy this run. Its holder is away, but the case area comes first.
  const deadline = ev("clock.due", null, "ca", { kind: "deadline", dueDay: 5, toRoleHolderId: "s_dep" }, 6);
  const s = stateOf(8, [raise("ca"), deadline, raise("cb", 7), away("a1", "u_own", 3, 12)]);
  const area = dueNow(s, 8, above);
  expect(area.filter((d) => d.kind === "handover").map((d) => d.target)).toEqual(["ca"]);
  expect(dues(s, 8).map((d) => [d.kind, d.target])).toEqual([["away", "cb"]]);
});

it("OVL clock gives a case away before overflow", () => {
  // The desk is at overflow and its only holder is away: the new case gets one hand-over, the away one, to the deputy.
  const s = stateOf(5, [...open(6), raise("cnew", 5), away("a1", "u_own", 3, 8)], { seats: SOLE }, TIGHT);
  const list = dues(s, 5);
  expect(list.filter((d) => d.target === "cnew").map((d) => [d.kind, d.toRoleHolderId])).toEqual([["away", "s_dep"]]);
  expect(new Set(list.filter((d) => d.kind === "away" || d.kind === "overflow").map((d) => d.target)).size).toBe(list.filter((d) => d.kind === "away" || d.kind === "overflow").length);
});

it("OVL clock lists nothing in demo mode", () => {
  const demo = stateOf(5, [raise("ca"), away("a1", "u_own", 3, 8), ...open(6, "s_dep")], { clock: { mode: "demo" } }, TIGHT);
  expect(dues(demo, 5)).toEqual([]);
  expect(dueNow(demo, 5, above)).toEqual([]);
  expect(DEFAULT_CALENDAR).toBeDefined();
});

it("OVL clock lists nothing twice", () => {
  // An absence: two cases are handed once, and the next run lists nothing for them, written by the clock or listed again from the same state.
  const base = [raise("ca"), raise("cb"), away("a1", "u_own", 3, 8)];
  const first = dues(stateOf(5, base, { seats: SOLE }), 5);
  expect(first.map((d) => [d.kind, d.target, d.toRoleHolderId])).toEqual([["away", "ca", "s_dep"], ["away", "cb", "s_dep"]]);
  expect(new Set(first.map((d) => d.idemKey)).size).toBe(first.length);
  const written = first.map((d) => handed(d.target, d.toRoleHolderId as string, d.kind, 5));
  expect(dues(stateOf(5, [...base, ...written], { seats: SOLE }), 5)).toEqual([]);
  // The case comes back to the away holder's seat in the same span (the cover gave it back): the clock does not hand it again, a person's pass does not stop it either.
  const back = [...base, ...written, ev("case.handed", "u_dep", "ca", { to: "T. Vogel", toRoleHolderId: "s_own", why: "Not mine" }, 6)];
  expect(dues(stateOf(6, back, { seats: SOLE }), 6)).toEqual([]);
  // An overflow: handed once, never again, also when the case comes back to the desk.
  const over = [...open(6), raise("cnew", 5)];
  expect(kinds(dues(stateOf(5, over, { seats: SOLE }, TIGHT), 5))).toEqual(["overloaded", "overflow"]);
  const done = stateOf(6, [...over, overloaded("role_owner", 30, 5), handed("cnew", "s_dep", "overflow", 5), handed("cnew", "s_own", "overflow", 5)], { seats: SOLE }, TIGHT);
  expect(dues(done, 6).filter((d) => d.target === "cnew")).toEqual([]);
  // The desk fact once per episode: written, it is not listed again, nor the level that is already open.
  expect(dues(stateOf(6, [...open(6), overloaded("role_owner", 30, 5)], { seats: SOLE }, TIGHT), 6)).toEqual([]);
});

it("OVL clock puts the hand-overs after every fact", () => {
  expect(overloadAfterFacts({ kind: "away" } as Due)).toBe(true);
  expect(overloadAfterFacts({ kind: "overflow" } as Due)).toBe(true);
  expect(overloadAfterFacts({ kind: "overloaded" } as Due)).toBe(false);
  expect(overloadAfterFacts({ kind: "cleared" } as Due)).toBe(false);
  // In the composed run order: the case area's deadline fact, the desk facts, then every hand-over.
  const events = [raise("cold"), ...open(6).slice(1), raise("cnew", 8), away("a1", "u_own", 3, 12), ev("clock.due", null, "cold", { kind: "deadline", dueDay: 5, toRoleHolderId: "s_dep" }, 6), ev("desk.overloaded", null, "role_deputy", { roleId: "role_deputy", level: 20, perHolder: 4, holders: 1 }, 2)];
  const list = dueNow(stateOf(8, events, { seats: SOLE }, TIGHT), 8, above);
  const at = (pred: (d: Due) => boolean) => list.flatMap((d, i) => (pred(d) ? [i] : []));
  const facts = at((d) => d.kind !== "away" && d.kind !== "overflow" && d.kind !== "handover");
  const moves = at((d) => d.kind === "away" || d.kind === "overflow" || d.kind === "handover");
  expect(facts.length).toBeGreaterThan(0);
  expect(moves.length).toBeGreaterThan(1);
  expect(Math.max(...facts)).toBeLessThan(Math.min(...moves));
  expect(list.map((d) => d.kind)).toContain("overloaded");
  expect(JSON.stringify(list)).not.toMatch(new RegExp(Object.values(NAME).join("|")));
});
