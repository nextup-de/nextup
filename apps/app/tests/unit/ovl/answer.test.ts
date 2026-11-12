// OVL-R1 (B1): the desk a new raise really reaches (plan OVL, D25): its holders, the cover of an away single holder, the deputy at overflow or at up with a cover, the
// deputy of a vacant desk, the seat above, and the sent line of each reason. Fixed days, no clock. Flat tests (D32).
import { expect, it } from "vitest";
import { answeringDesk, SENT_LINE } from "@/features/overload/answer";
import { translate } from "@/i18n";
import { away, ev, raise, ROUTES, SEATS, stateOf } from "./fixture";

const up = (roleId: string): string | null => (roleId === "role_owner" || roleId === "role_deputy" ? "s_head" : roleId === "role_head" ? null : "s_head");
const SINGLE = SEATS.filter((s) => s.id !== "s_own2"); // the owner desk with one holder
const VACANT = SEATS.map((s) => (s.roleId === "role_owner" ? { ...s, userId: null } : s)); // the owner desk with nobody on it
const TIGHT = { overloadAt: { triage: 1, up: 2, overflow: 3, late: 9 } }; // three cases on two holders are at overflow
const cases = (n: number) => Array.from({ length: n }, (_, i) => raise("c" + i));

it("OVL answer names the holders of a normal desk", () => {
  const s = stateOf(5, cases(1));
  expect(answeringDesk(s, "r1", 5, up)).toEqual({ roleId: "role_owner", why: "holder", names: ["T. Vogel", "N. Keller"] });
  // One of two away: the other answers, nobody is covered for.
  const one = stateOf(5, [away("a1", "u_own", 3, 9)]);
  expect(answeringDesk(one, "r1", 5, up)).toEqual({ roleId: "role_owner", why: "holder", names: ["N. Keller"] });
  // The same absence has ended by day 10; no route and a route without an owner role reach nobody.
  expect(answeringDesk(stateOf(10, [away("a1", "u_own", 3, 9)]), "r1", 10, up)?.names).toEqual(["T. Vogel", "N. Keller"]);
  expect(answeringDesk(s, "nope", 5, up)).toBeNull();
  expect(answeringDesk(s, null, 5, up)).toBeNull();
  expect(answeringDesk(stateOf(5, [], { routes: [{ ...ROUTES[0], ownerRoleId: null }] }), "r1", 5, up)).toBeNull();
});

it("OVL answer names the cover of an away single holder", () => {
  const s = stateOf(5, [away("a1", "u_own", 3, 9)], { seats: SINGLE });
  // No other holder of the role: the route's deputy role covers.
  expect(answeringDesk(s, "r1", 5, up)).toEqual({ roleId: "role_deputy", why: "away", names: ["H. Sander"] });
  // The deputy is away too: the seat above covers, one hop.
  const both = stateOf(5, [away("a1", "u_own", 3, 9), away("a2", "u_dep", 4, 8)], { seats: SINGLE });
  expect(answeringDesk(both, "r1", 5, up)).toEqual({ roleId: "role_head", why: "away", names: ["K. Head"] });
  // Nobody present to cover: the holder keeps it and the line stays the normal one.
  const none = stateOf(5, [away("a1", "u_own", 3, 9), away("a2", "u_dep", 4, 8)], { seats: SINGLE }, {});
  expect(answeringDesk(none, "r1", 5, () => null)).toEqual({ roleId: "role_owner", why: "holder", names: ["T. Vogel"] });
});

it("OVL answer names the deputy of a desk at overflow and never the source role", () => {
  const s = stateOf(5, cases(6), {}, TIGHT);
  expect(answeringDesk(s, "r1", 5, up)).toEqual({ roleId: "role_deputy", why: "overflow", names: ["H. Sander"] });
  // A route whose deputy role is the owner's own never answers for it: the holders keep the raise.
  const same = stateOf(5, cases(6), { routes: [{ ...ROUTES[0], deputyRoleId: "role_owner" }] }, TIGHT);
  expect(answeringDesk(same, "r1", 5, up)).toEqual({ roleId: "role_owner", why: "holder", names: ["T. Vogel", "N. Keller"] });
  // The deputy is away: nobody to take the overflow, the owner desk keeps it.
  const gone = stateOf(5, [...cases(6), away("a1", "u_dep", 3, 9)], {}, TIGHT);
  expect(answeringDesk(gone, "r1", 5, up)?.why).toBe("holder");
  // Below the overflow line the desk answers itself.
  expect(answeringDesk(stateOf(5, cases(2), {}, TIGHT), "r1", 5, up)?.why).toBe("holder");
});

it("OVL answer names the appointed cover of a desk at 20", () => {
  const log = [...cases(1), ev("desk.overloaded", null, "role_owner", { roleId: "role_owner", level: 20, perHolder: 21, holders: 2 }, 2), ev("desk.covered", "u_head", "role_owner", { roleId: "role_owner", seatId: "s_plant" }, 3)];
  expect(answeringDesk(stateOf(5, log), "r1", 5, up)).toEqual({ roleId: "role_plant", why: "overflow", names: ["P. Plant"] });
  // Before a cover is appointed the desk at 20 still answers itself.
  expect(answeringDesk(stateOf(5, log.slice(0, 2)), "r1", 5, up)?.why).toBe("holder");
  // The cover is away: the deputy takes it, one hop (D24).
  expect(answeringDesk(stateOf(5, [...log, away("a1", "u_plant", 4, 9)]), "r1", 5, up)).toEqual({ roleId: "role_deputy", why: "overflow", names: ["H. Sander"] });
});

it("OVL answer names the deputy of a vacant desk", () => {
  const s = stateOf(5, [], { seats: VACANT });
  expect(answeringDesk(s, "r1", 5, up)).toEqual({ roleId: "role_deputy", why: "vacant", names: ["H. Sander"] });
  // The deputy is away: the seat above answers instead.
  expect(answeringDesk(stateOf(5, [away("a1", "u_dep", 3, 9)], { seats: VACANT }), "r1", 5, up)).toEqual({ roleId: "role_head", why: "above", names: ["K. Head"] });
});

it("OVL answer names the seat above when nobody is below", () => {
  const noDeputy = stateOf(5, [], { seats: VACANT, routes: [{ ...ROUTES[0], deputyRoleId: null }] });
  expect(answeringDesk(noDeputy, "r1", 5, up)).toEqual({ roleId: "role_head", why: "above", names: ["K. Head"] });
  const empty = stateOf(5, [], { seats: VACANT.map((s) => (s.roleId === "role_deputy" ? { ...s, userId: null } : s)) });
  expect(answeringDesk(empty, "r1", 5, up)?.why).toBe("above");
  // Nobody at all answers: the desk is not named.
  expect(answeringDesk(empty, "r1", 5, () => null)).toBeNull();
});

it("OVL answer picks the sent line key for each why", () => {
  expect(SENT_LINE).toEqual({
    holder: "ideas.deskSent", away: "ideas.deskSentAway", overflow: "ideas.deskSentOverflow", vacant: "ideas.deskSentDeputy", above: "ideas.deskSentVacant",
  });
  // Every line exists in both languages and takes the desk and the date; all but the seat-above line also name who answers.
  for (const locale of ["en", "de"] as const) {
    for (const [why, key] of Object.entries(SENT_LINE)) {
      const line = translate(locale, key, { role: "ROLE", names: "NAMES", date: "DATE" });
      expect(line, `${locale} ${why}`).toContain("ROLE");
      expect(line, `${locale} ${why}`).toContain("DATE");
      if (why !== "above") expect(line, `${locale} ${why}`).toContain("NAMES");
    }
  }
  // Nobody who can answer has a line of its own (it waits), in both languages and without a date or a name.
  expect(translate("en", "ideas.deskSentNobody", { role: "Quality lead" })).toBe("Sent to Quality lead. Nobody can answer this yet; it waits until the desk is staffed.");
  expect(translate("de", "ideas.deskSentNobody", { role: "Qualitätsleitung" })).toContain("Ihnen"); // the formal Sie, as everywhere
  // The corrected line says who answers a vacant desk, not that it waits.
  expect(translate("en", "ideas.deskSentVacant", { role: "Quality lead", date: "3 Mar" })).toBe("Nobody holds Quality lead right now; the person above it answers by 3 Mar.");
});
