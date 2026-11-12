// OVL-G1 (B3): who is away, who answers for them, where an overloaded desk's cases go, what a person may take back, and how loaded a desk is (plan OVL, D18,
// D19, D24). Fixed days, no clock; every result is a seat id, a case or a count per desk and carries no person. Flat tests (D32).
import { expect, it } from "vitest";
import type { ReducedProject } from "@/features/projects/types";
import { awayCoverSeat, awayOn, overflowSeat, seatPresent, takeBackable } from "@/features/overload/away";
import { deskLoads, deskWork } from "@/features/overload/load";
import { above, away, back, ev, handed, raise, stateOf } from "./fixture";

const TIGHT = { overloadAt: { triage: 2, up: 4, overflow: 6, late: 2 } }; // thresholds a test can reach with a few cases
const open = (n: number, seat = "s_own") => Array.from({ length: n }, (_, i) => raise(`c${i}`, 0, "u_ra", seat));
const work = (state: ReturnType<typeof stateOf>, today: number) => deskWork(state, today).map((i) => i.key).sort();

it("OVL helpers is away on the from and the to day and not after a back", () => {
  const s = stateOf(10, [away("a1", "u_own", 3, 6)]);
  expect([2, 3, 4, 6, 7].map((d) => awayOn(s, "u_own", d))).toEqual([false, true, true, true, false]);
  expect(awayOn(s, "u_dep", 4)).toBe(false); // somebody else is not away
  // A back on day 5 ends it that day: away on 4, present on 5 and after.
  const ended = stateOf(10, [away("a1", "u_own", 3, 8), back("a1", "u_own", 5)]);
  expect([3, 4, 5, 6, 8].map((d) => awayOn(ended, "u_own", d))).toEqual([true, true, false, false, false]);
  // A state without the overload field is nobody away.
  expect(awayOn({}, "u_own", 4)).toBe(false);
  // A seat is present when it has a user who is not away; an empty seat is not.
  expect([seatPresent(s, "s_own", 4), seatPresent(s, "s_own", 7), seatPresent(s, "s_dep", 4), seatPresent(s, "s_nope", 4)]).toEqual([false, true, true, false]);
  expect(seatPresent({ ...s, seats: s.seats.map((x) => (x.id === "s_dep" ? { ...x, userId: null } : x)) }, "s_dep", 4)).toBe(false);
});

it("OVL helpers covers an away seat with another present holder, then the deputy role, then the seat above", () => {
  const cover = (events: ReturnType<typeof away>[], seat = "s_own") => awayCoverSeat(stateOf(10, events), seat, "r1", 4, above);
  // Another holder of the same role, present and not the away user.
  expect(cover([away("a1", "u_own", 3, 6)])).toBe("s_own2");
  // The other holder is away too: the route's deputy role.
  expect(cover([away("a1", "u_own", 3, 6), away("a2", "u_own2", 3, 6)])).toBe("s_dep");
  // The deputy is away as well: the seat above, one hop.
  expect(cover([away("a1", "u_own", 3, 6), away("a2", "u_own2", 3, 6), away("a3", "u_dep", 3, 6)])).toBe("s_head");
  // Nobody present anywhere: no cover, and the seat above is not looked past.
  expect(cover([away("a1", "u_own", 3, 6), away("a2", "u_own2", 3, 6), away("a3", "u_dep", 3, 6), away("a4", "u_head", 3, 6)])).toBeNull();
  // No route: no deputy role, so the seat above. A seat that does not exist has no cover.
  expect(awayCoverSeat(stateOf(10, [away("a1", "u_own", 3, 6), away("a2", "u_own2", 3, 6)]), "s_own", null, 4, above)).toBe("s_head");
  expect(awayCoverSeat(stateOf(10, []), "s_nope", "r1", 4, above)).toBeNull();
  // A seat that holds its role alone and is covered by the deputy: the deputy's own seat has the seat above.
  expect(awayCoverSeat(stateOf(10, [away("a1", "u_dep", 3, 6)]), "s_dep", "r1", 4, above)).toBe("s_head");
});

it("OVL helpers never overflows to the source role", () => {
  const cover = (roleId: string, coverSeatId: string) => stateOf(10, [ev("desk.overloaded", null, roleId, { roleId, level: 30, perHolder: 31, holders: 1 }, 2), ev("desk.covered", "u_head", roleId, { roleId, seatId: coverSeatId }, 3)]);
  // A cover seat of the source role itself is ignored; with the deputy desk as the source role there is no deputy to go to either.
  expect(overflowSeat(cover("role_owner", "s_own2"), "role_owner", "r1", 4)).toBe("s_dep");
  expect(overflowSeat(cover("role_deputy", "s_dep"), "role_deputy", "r1", 4)).toBeNull();
  // The route's deputy role is the source role: nowhere to go (one hop, no seat above).
  expect(overflowSeat(stateOf(10, []), "role_deputy", "r1", 4)).toBeNull();
  // No route and no cover: the case stays.
  expect(overflowSeat(stateOf(10, []), "role_owner", null, 4)).toBeNull();
  // The first present seat of the deputy role, never a seat of the source role.
  expect(overflowSeat(stateOf(10, []), "role_owner", "r1", 4)).toBe("s_dep");
  expect(overflowSeat(stateOf(10, [away("a1", "u_dep", 3, 6)]), "role_owner", "r1", 4)).toBeNull();
});

it("OVL helpers overflows to the appointed cover before the deputy", () => {
  const log = [ev("desk.overloaded", null, "role_owner", { roleId: "role_owner", level: 30, perHolder: 31, holders: 1 }, 2), ev("desk.covered", "u_head", "role_owner", { roleId: "role_owner", seatId: "s_plant" }, 3)];
  expect(overflowSeat(stateOf(10, log), "role_owner", "r1", 4)).toBe("s_plant");
  // A cover whose user is away is passed over: the deputy.
  expect(overflowSeat(stateOf(10, [...log, away("a1", "u_plant", 3, 6)]), "role_owner", "r1", 4)).toBe("s_dep");
  // A cleared episode has no cover any more.
  const cleared = [...log, ev("desk.cleared", null, "role_owner", { roleId: "role_owner" }, 5)];
  expect(overflowSeat(stateOf(10, cleared), "role_owner", "r1", 6)).toBe("s_dep");
});

it("OVL helpers does not overflow when the deputy desk is at overflow", () => {
  // Six open cases on the deputy desk, one present holder, overflow from 6: the desk the cases would go to is full.
  const full = stateOf(10, open(6, "s_dep"), {}, TIGHT);
  expect(deskLoads(full, 4).find((l) => l.roleId === "role_deputy")?.level).toBe("overflow");
  expect(overflowSeat(full, "role_owner", "r1", 4)).toBeNull();
  // One case fewer and it is not at overflow: the deputy takes the case.
  const room = stateOf(10, open(5, "s_dep"), {}, TIGHT);
  expect(deskLoads(room, 4).find((l) => l.roleId === "role_deputy")?.level).toBe("up");
  expect(overflowSeat(room, "role_owner", "r1", 4)).toBe("s_dep");
});

it("OVL helpers drops a case a person touched from take back", () => {
  const events = [
    raise("ca"), raise("cb"), raise("cc"), raise("cd"),
    away("a1", "u_own", 3, 6),
    handed("ca", "s_own2", "away", 4), handed("cb", "s_own2", "away", 4), handed("cc", "s_own2", "away", 4), handed("cd", "s_own2", "away", 4),
    ev("clock.due", null, "ca", { kind: "deadline", dueDay: 8, toRoleHolderId: "s_own2" }, 5), // the clock's own fact does not count
    ev("case.discussion", "u_own2", "cb", { invited: ["H. Sander"], invitedUserIds: ["u_dep"], missing: "The saving" }, 5), // a person acted on it (a comment is no part of a case's history)
    ev("case.handed", "u_own2", "cc", { to: "H. Sander", toRoleHolderId: "s_dep", why: "Their machine" }, 5), // the cover passed it on
  ];
  const s = stateOf(10, events);
  // Only the case nobody touched and that still sits where the clock put it; and for the person's own seat only. A case handed away on a day outside the span is not listed.
  expect(takeBackable(s, "u_own", 8).map((c) => c.id)).toEqual(["ca", "cd"]);
  // Still away: nothing yet. Somebody else: nothing.
  expect(takeBackable(s, "u_own", 5)).toEqual([]);
  expect(takeBackable(s, "u_own2", 8)).toEqual([]);
  // Back early: the cases are takeable from that day.
  const early = stateOf(10, [...events.slice(0, 5).filter((e) => e.type !== "person.away"), away("a1", "u_own", 3, 9), ...events.slice(5), back("a1", "u_own", 6)]);
  expect(takeBackable(early, "u_own", 6).map((c) => c.id)).toEqual(["ca", "cd"]);
  // A case the take-back's own actor moved, or one the cover decided, is no longer the clock's to give back.
  const decided = stateOf(10, [...events, ev("case.decided", "u_own2", "cd", { answer: "no", category: "no-fit", reason: "It does not serve a goal of this year and would break the gauge standard" }, 6)]);
  expect(takeBackable(decided, "u_own", 8).map((c) => c.id)).toEqual(["ca"]);
});

it("OVL helpers counts decide, approval and confirm items once each", () => {
  const prov = ev("case.provisional", "u_own", "cb", { approvals: [{ kind: "budget", roleId: "role_plant", coversUpToEur: 25_000 }], stepDueDay: 9, costEur: 12_000, decidingRoleId: "role_owner", projectId: "p1", lead: "T. Vogel", leadUserId: "u_own", title: "Case cb", draft: true }, 2);
  const s = stateOf(10, [raise("ca"), raise("cb"), prov]);
  // A project result that waits for a second person; two checks wait, the project counts once, on the route's deputy desk.
  const waiting = { id: "p1", routeId: "r1", stopped: null, history: [], measures: [
    { check: 30, day: 4, confirmed: null, sourceKind: "typed", sentBack: false }, { check: 90, day: 6, confirmed: null, sourceKind: "typed", sentBack: false },
  ] } as unknown as ReducedProject;
  const withProject = { ...s, projects: [waiting] };
  expect(deskWork(withProject, 4).map((i) => [i.key, i.roleId, i.late])).toEqual([["case:ca", "role_owner", false], ["approval:" + prov.id + ":" + prov.id + ":0", "role_plant", false], ["confirm:p1", "role_deputy", false]]);
  // A result is on time for five working days after it was typed (day 4 + 5), late the day after.
  expect(deskWork(withProject, 9).find((i) => i.key === "confirm:p1")?.late).toBe(false);
  expect(deskWork(withProject, 10).find((i) => i.key === "confirm:p1")?.late).toBe(true);
  // Each item once even when read twice.
  expect(work(withProject, 4)).toEqual(work(withProject, 4));
  expect(new Set(deskWork(withProject, 4).map((i) => i.key)).size).toBe(3);
  // A confirmed or system result, a stopped project and one sent back wait for nobody on a desk.
  const done = { ...waiting, measures: [{ check: 30, day: 4, confirmed: { day: 5 }, sourceKind: "typed", sentBack: false }, { check: 90, day: 4, confirmed: null, sourceKind: "system", sentBack: false }, { check: 7, day: 4, confirmed: null, sourceKind: "typed", sentBack: true }] } as unknown as ReducedProject;
  expect(deskWork({ ...s, projects: [done] }, 4).filter((i) => i.key.startsWith("confirm:"))).toEqual([]);
  expect(deskWork({ ...s, projects: [{ ...waiting, stopped: { day: 3 } } as unknown as ReducedProject] }, 4).filter((i) => i.key.startsWith("confirm:"))).toEqual([]);
});

it("OVL helpers counts only the current approval step and no later step", () => {
  const steps = [{ kind: "budget", roleId: "role_plant", coversUpToEur: 25_000 }, { kind: "council", councilId: "k1" }, { kind: "role", roleId: "role_head" }];
  const prov = ev("case.provisional", "u_own", "ca", { approvals: steps, stepDueDay: 9, costEur: 12_000, decidingRoleId: "role_owner", projectId: "p1", lead: "T. Vogel", leadUserId: "u_own", title: "Case ca", draft: true }, 2);
  const first = stateOf(5, [raise("ca"), prov]);
  expect(deskWork(first, 5).map((i) => [i.key, i.roleId])).toEqual([[`approval:${prov.id}:${prov.id}:0`, "role_plant"]]);
  // After the first yes the council step is the only one: its secretary's role holds it, the later role step is not counted.
  const yes = ev("case.approval", "u_plant", "ca", { runId: prov.id, stepId: `${prov.id}:0`, dueRev: 0, step: 0, approvalAnswer: "yes", reason: "", nextStepDueDay: 13 }, 6);
  const second = stateOf(6, [raise("ca"), prov, yes]);
  expect(deskWork(second, 6).map((i) => [i.key, i.roleId, i.late])).toEqual([[`approval:${prov.id}:${prov.id}:1`, "role_plant", false]]);
  expect(deskWork(stateOf(14, [raise("ca"), prov, yes]), 14)[0].late).toBe(true); // due day 13 is past
  // A finished run is no work at all.
  const done = stateOf(8, [raise("ca"), prov, yes, ev("case.approval", "u_plant", "ca", { runId: prov.id, stepId: `${prov.id}:1`, dueRev: 0, step: 1, approvalAnswer: "yes", reason: "", nextStepDueDay: 14 }, 7), ev("case.approval", "u_head", "ca", { runId: prov.id, stepId: `${prov.id}:2`, dueRev: 0, step: 2, approvalAnswer: "yes", reason: "" }, 8), ev("case.decided", null, "ca", { answer: "yes", projectId: "p1" }, 8, "system:approvals")]);
  expect(deskWork(done, 8)).toEqual([]);
});

it("OVL helpers counts a late approval step on the desk it was handed to", () => {
  const prov = ev("case.provisional", "u_own", "ca", { approvals: [{ kind: "budget", roleId: "role_plant", coversUpToEur: 25_000 }], stepDueDay: 9, costEur: 12_000, decidingRoleId: "role_owner", projectId: "p1", lead: "T. Vogel", leadUserId: "u_own", title: "Case ca", draft: true }, 2);
  const late = ev("clock.due", null, "ca", { kind: "approval", check: 2, toRoleHolderId: "s_head", originEventId: prov.id, stepId: `${prov.id}:0@0`, dueDay: 9 }, 14);
  const s = stateOf(14, [raise("ca"), prov, late]);
  // The step now sits on the role of the seat it was handed to, and no longer counts on the role it was for.
  expect(deskWork(s, 14).map((i) => [i.roleId, i.late])).toEqual([["role_head", true]]);
  expect(deskLoads(s, 14).map((l) => [l.roleId, l.open, l.late])).toEqual([["role_head", 1, 1]]);
  // A fact for another revision of the step hands nothing over.
  const stale = ev("clock.due", null, "ca", { kind: "approval", check: 2, toRoleHolderId: "s_head", originEventId: prov.id, stepId: `${prov.id}:0@4`, dueDay: 9 }, 14);
  expect(deskWork(stateOf(14, [raise("ca"), prov, stale]), 14).map((i) => i.roleId)).toEqual(["role_plant"]);
});

it("OVL helpers does not count asked cases", () => {
  const s = stateOf(5, [raise("ca"), raise("cb"), ev("case.asked", "u_own", "cb", { text: "Which line?" }, 1)]);
  expect(work(s, 5)).toEqual(["case:ca"]);
  // Answered, it is on the desk again.
  const answered = stateOf(5, [raise("ca"), raise("cb"), ev("case.asked", "u_own", "cb", { text: "Which line?" }, 1), ev("case.answered", "u_ra", "cb", { text: "Line 3" }, 2)]);
  expect(work(answered, 5)).toEqual(["case:ca", "case:cb"]);
  // A decided case is no work.
  const decided = stateOf(5, [raise("ca"), ev("case.decided", "u_own", "ca", { answer: "yes", projectId: "p1", lead: "T. Vogel", leadUserId: "u_own", title: "Case ca" }, 2)]);
  expect(work(decided, 5)).toEqual([]);
});

it("OVL helpers counts a person on two seats of a role once", () => {
  const seats = [...stateOf(0, []).seats.map((s) => (s.id === "s_own2" ? { ...s, userId: "u_own" } : s))];
  const s = { ...stateOf(5, open(4)), seats };
  const load = deskLoads(s, 5).find((l) => l.roleId === "role_owner");
  expect([load?.open, load?.holders, load?.perHolder]).toEqual([4, 1, 4]);
  // Two different people: two holders.
  const two = deskLoads(stateOf(5, open(4)), 5).find((l) => l.roleId === "role_owner");
  expect([two?.open, two?.holders, two?.perHolder]).toEqual([4, 2, 2]);
});

it("OVL helpers does not count an away holder", () => {
  const present = deskLoads(stateOf(5, open(4)), 5).find((l) => l.roleId === "role_owner");
  const gone = deskLoads(stateOf(5, [...open(4), away("a1", "u_own2", 3, 8)]), 5).find((l) => l.roleId === "role_owner");
  expect([present?.holders, present?.perHolder, gone?.holders, gone?.perHolder]).toEqual([2, 2, 1, 4]);
  // Everybody away: the desk still counts its work, divided by one.
  const all = deskLoads(stateOf(5, [...open(4), away("a1", "u_own", 3, 8), away("a2", "u_own2", 3, 8)]), 5).find((l) => l.roleId === "role_owner");
  expect([all?.holders, all?.perHolder]).toEqual([0, 4]);
  // Back: counted again.
  const returned = deskLoads(stateOf(6, [...open(4), away("a1", "u_own2", 3, 8), ev("person.back", "u_own2", null, { userId: "u_own2", awayId: "a1" }, 6)]), 6).find((l) => l.roleId === "role_owner");
  expect(returned?.holders).toBe(2);
});

it("OVL helpers reaches triage, up and overflow and ends overflow under up", () => {
  const level = (n: number, extra: ReturnType<typeof ev>[] = [], today = 5) => deskLoads(stateOf(today, [...open(n, "s_dep"), ...extra], {}, TIGHT), today).find((l) => l.roleId === "role_deputy")?.level;
  // One present holder, thresholds 2, 4 and 6.
  expect([1, 2, 3, 4, 5, 6, 7].map((n) => level(n))).toEqual(["normal", "triage", "triage", "up", "up", "overflow", "overflow"]);
  // Late items alone make it triage: two late cases are enough, though one holder carries only two.
  expect(deskLoads(stateOf(30, open(1, "s_dep"), {}, { overloadAt: { triage: 5, up: 9, overflow: 14, late: 1 } }), 30).find((l) => l.roleId === "role_deputy")).toMatchObject({ late: 1, level: "triage" });
  // An open episode at 30 keeps the desk at overflow while it is at up; under up it ends (Q3.16).
  const at30 = [ev("desk.overloaded", null, "role_deputy", { roleId: "role_deputy", level: 30, perHolder: 6, holders: 1 }, 4)];
  expect([3, 4, 5].map((n) => level(n, at30))).toEqual(["triage", "overflow", "overflow"]);
  // At level 20 the same cases stay at up: overflow needs its own threshold.
  const at20 = [ev("desk.overloaded", null, "role_deputy", { roleId: "role_deputy", level: 20, perHolder: 4, holders: 1 }, 4)];
  expect(level(4, at20)).toBe("up");
  // A role with an open episode but no work is listed, as normal.
  const quiet = deskLoads(stateOf(5, at30, {}, TIGHT), 5);
  expect(quiet).toEqual([{ roleId: "role_deputy", open: 0, late: 0, pinned: 0, holders: 1, perHolder: 0, level: "normal" }]);
});

it("OVL helpers returns no user id or name in a desk load", () => {
  const s = stateOf(5, [...open(5), away("a1", "u_own2", 3, 8)], {}, TIGHT);
  const loads = deskLoads(s, 5);
  expect(loads.length).toBeGreaterThan(0);
  for (const l of loads) expect(Object.keys(l).sort()).toEqual(["holders", "late", "level", "open", "pinned", "perHolder", "roleId"].sort());
  const text = JSON.stringify([loads, deskWork(s, 5)]);
  for (const person of ["u_own", "u_own2", "u_dep", "u_head", "u_ra", "T. Vogel", "N. Keller", "H. Sander", "K. Head", "J. Schmidt"]) expect(text, person).not.toContain(person);
  // The cover and the take-back lists carry seat ids and cases, never a name of a person who is away.
  expect(String(awayCoverSeat(s, "s_own", "r1", 5, above))).not.toMatch(/Vogel|Keller/);
});
