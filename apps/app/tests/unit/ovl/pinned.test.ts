// OVL-G1 (B4): the pinned case (plan OVL, D12, D20): what the seat above left alone for escalationDays is pinned for every holder of the desk it sits on and
// counted there. One predicate for the load and the inbox. Fixed days, no clock. Flat tests (D32).
import { expect, it } from "vitest";
import { inboxItems } from "@/features/inbox";
import { isPinned } from "@/features/overload/pinned";
import { deskLoads } from "@/features/overload/load";
import { ev, handed, inboxInput, raise, stateOf } from "./fixture";

// ca is raised on day 0 (answer date 5) and the clock passes it to the seat above on day 6: the seat above has escalationDays (3) from then on.
const ESCALATED = [raise("ca"), handed("ca", "s_head", "escalation", 6)];
const pinnedAt = (today: number, ...more: ReturnType<typeof ev>[]) => {
  const s = stateOf(today, [...ESCALATED, ...more]);
  return isPinned(s.cases.find((c) => c.id === "ca")!, s, today);
};

it("OVL pinned pins a case the seat above left alone for escalationDays", () => {
  // Not before three working days have passed since the hand-over (day 6): 6, 7 and 8 are not enough, 9 is.
  expect([6, 7, 8, 9, 10].map((d) => pinnedAt(d))).toEqual([false, false, false, true, true]);
  // Only an escalation counts: a hand-over for another reason, a person's pass and a case nobody handed are not pinned.
  const other = (why: string) => {
    const s = stateOf(12, [raise("ca"), handed("ca", "s_head", why, 6)]);
    return isPinned(s.cases[0], s, 12);
  };
  expect([other("deadline"), other("away"), other("overflow")]).toEqual([false, false, false]);
  const byPerson = stateOf(12, [raise("ca"), ev("case.handed", "u_own", "ca", { to: "K. Head", toRoleHolderId: "s_head", why: "escalation" }, 6)]);
  expect(isPinned(byPerson.cases[0], byPerson, 12)).toBe(false);
  const plain = stateOf(12, [raise("ca")]);
  expect(isPinned(plain.cases[0], plain, 12)).toBe(false);
  // With escalation switched off (0 days) nothing is ever pinned; with 5 days the seat above has longer.
  const off = stateOf(12, ESCALATED, {}, { escalationDays: 0 });
  expect(isPinned(off.cases[0], off, 12)).toBe(false);
  const five = stateOf(12, ESCALATED, {}, { escalationDays: 5 });
  expect([10, 11].map((d) => isPinned(five.cases[0], five, d))).toEqual([false, true]);
  // A decided case is not pinned any more.
  const decided = stateOf(12, [...ESCALATED, ev("case.decided", "u_head", "ca", { answer: "yes", projectId: "p1", lead: "K. Head", leadUserId: "u_head", title: "Case ca" }, 9)]);
  expect(isPinned(decided.cases[0], decided, 12)).toBe(false);
});

it("OVL pinned does not pin a case a person acted on after the escalation", () => {
  // The seat above looked at it: a discussion, a question, a pass to somebody else, a person's decision; each ends the pin.
  expect(pinnedAt(12, ev("case.discussion", "u_head", "ca", { invited: [], missing: "The saving" }, 7))).toBe(false);
  expect(pinnedAt(12, ev("case.handed", "u_head", "ca", { to: "H. Sander", toRoleHolderId: "s_dep", why: "Their machine" }, 7))).toBe(false);
  // The clock's own later facts and a system actor do not count as a person: still pinned.
  expect(pinnedAt(12, ev("clock.due", null, "ca", { kind: "escalation", dueDay: 9, toRoleHolderId: "s_head" }, 9))).toBe(true);
  expect(pinnedAt(12, ev("case.handed", null, "ca", { to: "H. Sander", toRoleHolderId: "s_dep", why: "away" }, 9))).toBe(false); // a later hand-over is the last one, and it is not an escalation
  // A person's act BEFORE the escalation does not matter: the pin counts from the clock's hand-over.
  const early = stateOf(12, [raise("ca"), ev("case.discussion", "u_own", "ca", { invited: [], missing: "x" }, 2), handed("ca", "s_head", "escalation", 6)]);
  expect(isPinned(early.cases[0], early, 12)).toBe(true);
});

it("OVL pinned lists the pinned case first for both holders of the seat above", () => {
  // The seat above's role has two holders; its desk has an older case that is late and the pinned one. Both holders see the pinned one first.
  const events = [
    raise("cold", 0, "u_ra", "s_head"), // on the director's desk since day 0, late
    ...ESCALATED,
  ];
  const s = stateOf(10, events);
  for (const user of ["u_head", "u_head2"]) {
    const items = inboxItems(inboxInput(s, user, 10)).filter((i) => i.kind === "case");
    expect(items.map((i) => [i.caseId, i.pinned]), user).toEqual([["ca", true], ["cold", false]]);
  }
  // The holders of the desk the case came from do not have it; nobody else has it pinned.
  expect(inboxItems(inboxInput(s, "u_own", 10)).filter((i) => i.caseId === "ca")).toEqual([]);
  // Before the days are up it is an ordinary item, in the ordinary order.
  const early = stateOf(8, events);
  expect(inboxItems(inboxInput(early, "u_head", 8)).filter((i) => i.kind === "case").every((i) => !i.pinned)).toBe(true);
  // Nothing is mailed for it: pinning writes no event.
  expect(s.cases.find((c) => c.id === "ca")!.history.map((e) => e.type)).toEqual(["case.raised", "case.handed"]);
});

it("OVL pinned counts the pinned case on the desk it sits on", () => {
  const s = stateOf(10, [...ESCALATED, raise("cb", 8, "u_rb")]);
  const loads = deskLoads(s, 10);
  const head = loads.find((l) => l.roleId === "role_head");
  expect(head).toMatchObject({ open: 1, pinned: 1 });
  const owner = loads.find((l) => l.roleId === "role_owner");
  expect(owner).toMatchObject({ open: 1, pinned: 0 }); // cb, raised on the owner desk, is no pin
  // Before the days are up the case is counted on the same desk, but not pinned.
  expect(deskLoads(stateOf(8, [...ESCALATED, raise("cb", 8, "u_rb")]), 8).find((l) => l.roleId === "role_head")).toMatchObject({ open: 1, pinned: 0 });
  // A pinned case does not change who holds the load: the pinned count is a part of open, never more.
  for (const l of loads) expect(l.pinned).toBeLessThanOrEqual(l.open);
});
