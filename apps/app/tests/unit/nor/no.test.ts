// NOR-G1 (B2): the helpers of the reasoned no (plan NOR, D12, D13, D17, D18). Cases are plain literals of the fields the
// helpers read: the reducer fills them in NOR-A1.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent } from "@/features/cases/events";
import { passPayload, routeOfSeat } from "@/features/cases/hand";
import {
  APPEAL_TEXT_MAX, APPEAL_TEXT_MIN, appealDeskRoles, appealOpen, appealRouting, CHANGE_IF_MAX, cycleEvents, decidedThisCycle, decisionKey,
  LEGACY_NO_CATEGORIES, mayAnswerAppeal, noCategoryLabel, noCategoryOf, noCategorySub, noReasonOf, NO_CATEGORIES, NOT_NOW_MAX_IN_ROW, PASS_LIMIT,
  PASS_MIN_DAYS, PASS_REASON_MIN, passDueDay, REASON_MAX, revisitAllowed, revisitRequired, REVISIT_MAX_AHEAD, type AnyNoCategory,
} from "@/features/cases/no";
import type { Appeal, Decision, ReducedCase } from "@/features/cases/reducer";
import type { Route } from "@/features/demo/types";
import { translate } from "@/i18n";

describe("NOR no helpers", () => {
  describe("noCategoryOf and noReasonOf", () => {
    it("a new no is its own category, with its text in reason", () => {
      for (const c of NO_CATEGORIES) {
        expect(noCategoryOf({ answer: "no", reason: "A reason of enough length to count as one", category: c })).toBe(c);
        expect(noReasonOf({ reason: "A reason of enough length to count as one", note: "", category: c })).toBe("A reason of enough length to count as one");
      }
      // a note on a new no is not part of its text
      expect(noReasonOf({ reason: "The text", note: "ignored", category: "risk" })).toBe("The text");
    });

    it("an old no's picked id maps to a category: not now to not-now, the other four to the legacy ones", () => {
      expect(noCategoryOf({ answer: "no", reason: "not now" })).toBe("not-now");
      expect(noCategoryOf({ answer: "no", reason: "wrong department" })).toBe("wrong-department");
      expect(noCategoryOf({ answer: "no", reason: "not responsible" })).toBe("not-responsible");
      expect(noCategoryOf({ answer: "no", reason: "no time" })).toBe("no-time");
      expect(noCategoryOf({ answer: "no", reason: "is it important" })).toBe("no-rank");
      expect(noCategoryOf({ answer: "no", reason: " Wrong Department " })).toBe("wrong-department");
    });

    it("anything else, the Teams card's free text included, is other", () => {
      expect(noCategoryOf({ answer: "no", reason: "Too costly" })).toBe("other");
      expect(noCategoryOf({ answer: "no", reason: "" })).toBe("other");
      expect(noCategoryOf({ answer: "no", reason: "Q4 at the earliest", category: "made-up" })).toBe("other");
    });

    it("a yes has no category, and a reduced decision that already carries one keeps it", () => {
      expect(noCategoryOf({ answer: "yes", reason: "" })).toBeNull();
      expect(noCategoryOf({ answer: "yes", reason: "not now" })).toBeNull();
      for (const c of LEGACY_NO_CATEGORIES) expect(noCategoryOf({ answer: "no", reason: "whatever", category: c })).toBe(c);
    });

    it("an old no with a known id has its text in note; free text in reason is joined with the note", () => {
      expect(noReasonOf({ reason: "no time", note: "The plan is full until Q4" })).toBe("The plan is full until Q4");
      expect(noReasonOf({ reason: "not now", note: "" })).toBe("");
      expect(noReasonOf({ reason: "Too costly", note: "" })).toBe("Too costly");
      expect(noReasonOf({ reason: "Too costly", note: "Ask again in spring" })).toBe("Too costly - Ask again in spring");
      // a reduced old no carries a legacy category; its text is still read the old way
      expect(noReasonOf({ reason: "no time", note: "Plan is full", category: "no-time" })).toBe("Plan is full");
      expect(noReasonOf({ reason: "Too costly", note: "", category: "other" })).toBe("Too costly");
    });
  });

  describe("labels and revisit", () => {
    it("every new category has a label and a sub in the catalog; the legacy ones point at today's labels", () => {
      for (const c of NO_CATEGORIES) {
        expect(translate("en", noCategoryLabel(c)), c).toBeTruthy();
        expect(translate("de", noCategoryLabel(c)), c).toBeTruthy();
        expect(translate("en", noCategorySub(c)), c).toBeTruthy();
      }
      expect(noCategoryLabel("wrong-department")).toBe("shell.noWrongDept");
      expect(noCategoryLabel("not-responsible")).toBe("shell.noNobody");
      expect(noCategoryLabel("no-time")).toBe("shell.noNoTime");
      expect(noCategoryLabel("no-rank")).toBe("shell.noNoRank");
      expect(translate("en", noCategoryLabel("other"))).toBe("Other reason");
      expect(translate("de", noCategoryLabel("other"))).toBe("Anderer Grund");
      for (const c of LEGACY_NO_CATEGORIES) expect(translate("en", noCategoryLabel(c)), c).toBeTruthy();
    });

    it("a revisit day is required for not-now, allowed for no-budget, and for no other category", () => {
      const all: (AnyNoCategory | null)[] = [...NO_CATEGORIES, ...LEGACY_NO_CATEGORIES, null];
      expect(all.filter(revisitRequired)).toEqual(["not-now"]);
      expect(all.filter(revisitAllowed)).toEqual(["not-now", "no-budget"]);
    });

    it("the limits are the decided ones", () => {
      expect([NOT_NOW_MAX_IN_ROW, PASS_LIMIT, PASS_REASON_MIN, PASS_MIN_DAYS, CHANGE_IF_MAX, REASON_MAX, REVISIT_MAX_AHEAD, APPEAL_TEXT_MIN, APPEAL_TEXT_MAX])
        .toEqual([2, 2, 8, 2, 400, 2000, 250, 20, 1000]);
    });
  });

  describe("passes", () => {
    it("passDueDay is null when the answer date is at least 2 working days away, else today + 2", () => {
      expect(passDueDay({ dueDay: 10 }, 10)).toBe(12); // 0 days left
      expect(passDueDay({ dueDay: 11 }, 10)).toBe(12); // 1 day left
      expect(passDueDay({ dueDay: 12 }, 10)).toBeNull(); // 2 days left
      expect(passDueDay({ dueDay: 15 }, 10)).toBeNull(); // 5 days left
      expect(passDueDay({ dueDay: 8 }, 10)).toBe(12); // already late
    });

    const seats: SeatRow[] = [{ id: "seat_hs", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 0 }];
    it("passPayload is handPayload plus the fields that are set, nothing else", () => {
      expect(passPayload(seats, "seat_hs", "It belongs to Quality")).toStrictEqual({ to: "H. Sander", toRoleHolderId: "seat_hs", why: "It belongs to Quality" });
      expect(passPayload(seats, "seat_hs", "Not mine, wrong desk", { back: true, up: false, keepsQuestion: false })).toStrictEqual({ to: "H. Sander", toRoleHolderId: "seat_hs", why: "Not mine, wrong desk", back: true });
      expect(passPayload(seats, "seat_hs", "Send it up please", { up: true, routeId: "r2", dueDay: 12, keepsQuestion: true })).toStrictEqual({
        to: "H. Sander", toRoleHolderId: "seat_hs", why: "Send it up please", up: true, routeId: "r2", dueDay: 12, keepsQuestion: true,
      });
      // a due day of 0 is a day, not "unset"
      expect(passPayload(seats, "seat_hs", "Take it for now", { dueDay: 0 })).toMatchObject({ dueDay: 0 });
    });

    it("routeOfSeat is the first route the seat owns, else the first it is deputy of, else null", () => {
      const r = (id: string, owner: string | null, deputy: string | null) => ({ id, ownerSeatId: owner, deputySeatId: deputy }) as Route;
      const routes = [r("r1", "s_a", "s_b"), r("r2", "s_b", "s_c"), r("r3", "s_b", null)];
      expect(routeOfSeat(routes, "s_a")?.id).toBe("r1");
      expect(routeOfSeat(routes, "s_b")?.id).toBe("r2"); // owner of r2 before deputy of r1
      expect(routeOfSeat(routes, "s_c")?.id).toBe("r2");
      expect(routeOfSeat(routes, "s_none")).toBeNull();
      expect(routeOfSeat([], "s_a")).toBeNull();
    });
  });

  const no = (over: Partial<Decision> = {}): Decision => ({
    answer: "no", reason: "A reason", note: "", by: "T. Vogel", byUserId: "u_tv", day: 10, category: "no-fit", changeIf: "", revisitDay: null, duplicateOf: null, ...over,
  });
  const appeal = (over: Partial<Appeal> = {}): Appeal => ({ text: "Please look again", day: 11, by: "J. Schmidt", byUserId: "u_js", seatId: "seat_dep", decided: null, ...over });

  describe("the second look", () => {
    it("appealOpen: the latest decision is a no, nobody asked yet, and today is within appeal_days of the no", () => {
      expect(appealOpen({ decided: no(), appeal: null }, 10, 10)).toBe(true);
      expect(appealOpen({ decided: no(), appeal: null }, 20, 10)).toBe(true); // the last day
      expect(appealOpen({ decided: no(), appeal: null }, 21, 10)).toBe(false); // one day too late
      expect(appealOpen({ decided: no(), appeal: null }, 21, 11)).toBe(true);
      expect(appealOpen({ decided: no(), appeal: appeal() }, 11, 10)).toBe(false); // once per case
      expect(appealOpen({ decided: no({ answer: "yes" }), appeal: null }, 11, 10)).toBe(false);
      expect(appealOpen({ decided: null, appeal: null }, 11, 10)).toBe(false);
    });

    const seats: SeatRow[] = [
      { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
      { id: "seat_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 1 },
      { id: "seat_dep2", roleId: "role_deputy", label: "D. Two", userId: "u_d2", sort: 2 },
      { id: "seat_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 3 },
    ];
    const due = (payload: CaseEvent["payload"]): CaseEvent => ({ id: "f1", ts: 0, day: 13, type: "clock.due", actor: "system:clock", actorUserId: null, target: "c1", payload });
    const kase = (over: Partial<Pick<ReducedCase, "appeal" | "decided" | "history">> = {}) => ({ appeal: appeal(), decided: no(), history: [] as CaseEvent[], ...over });

    it("the desk roles are the appeal seat's role and the seat above's from the check-2 fact, minus the no-sayer's roles", () => {
      expect(appealDeskRoles(kase(), seats)).toEqual(["role_deputy"]);
      const escalated = kase({ history: [due({ kind: "appeal", dueDay: 13 }), due({ kind: "appeal", check: 2, toRoleHolderId: "seat_head" })] });
      expect(appealDeskRoles(escalated, seats)).toEqual(["role_deputy", "role_head"]);
      // the first fact (no check 2) names nobody
      expect(appealDeskRoles(kase({ history: [due({ kind: "appeal", dueDay: 13, toRoleHolderId: "seat_head" })] }), seats)).toEqual(["role_deputy"]);
      expect(appealDeskRoles(kase({ appeal: null }), seats)).toEqual([]);
      expect(appealDeskRoles(kase({ appeal: appeal({ decided: { uphold: true, reason: "Final", by: "H. Sander", byUserId: "u_hs", day: 12 } }) }), seats)).toEqual([]);
    });

    it("the no-sayer's roles are taken out: a deputy who said no does not answer, the seat above does", () => {
      const deputySaidNo = kase({ decided: no({ by: "H. Sander", byUserId: "u_hs" }), appeal: appeal({ seatId: "seat_dep" }) });
      expect(appealDeskRoles(deputySaidNo, seats)).toEqual([]);
      const up = kase({ decided: no({ by: "H. Sander", byUserId: "u_hs" }), appeal: appeal({ seatId: "seat_head" }) });
      expect(appealDeskRoles(up, seats)).toEqual(["role_head"]);
    });

    it("mayAnswerAppeal: a holder of a desk role or a manager, never the no-sayer", () => {
      const me = (userId: string) => meFor(userId, seats);
      expect(mayAnswerAppeal(kase(), me("u_hs"), false, seats)).toBe(true);
      expect(mayAnswerAppeal(kase(), me("u_d2"), false, seats)).toBe(true); // another holder of the role
      expect(mayAnswerAppeal(kase(), me("u_head"), false, seats)).toBe(false); // the seat above is brought in only by the check-2 fact
      expect(mayAnswerAppeal(kase(), me("u_head"), true, seats)).toBe(true); // a manager
      expect(mayAnswerAppeal(kase(), me("u_tv"), false, seats)).toBe(false); // the no-sayer
      expect(mayAnswerAppeal(kase(), me("u_tv"), true, seats)).toBe(false); // ... also as a manager
      expect(mayAnswerAppeal(kase(), meFor(null, seats), true, seats)).toBe(false);
      const escalated = kase({ history: [due({ kind: "appeal", check: 2, toRoleHolderId: "seat_head" })] });
      expect(mayAnswerAppeal(escalated, me("u_head"), false, seats)).toBe(true);
      expect(mayAnswerAppeal(kase({ appeal: null }), me("u_hs"), true, seats)).toBe(false);
    });

    it("the no-sayer is refused by user id even after a role change", () => {
      // T. Vogel said no as the owner; now holds the deputy seat too: the role is out of the list and the id is refused anyway
      const moved: SeatRow[] = [...seats, { id: "seat_tv2", roleId: "role_deputy", label: "T. Vogel", userId: "u_tv", sort: 4 }];
      expect(appealDeskRoles(kase(), moved)).toEqual([]);
      expect(mayAnswerAppeal(kase(), meFor("u_tv", moved), false, moved)).toBe(false);
      // the person who said no moved to the deputy role alone: the other deputy holders still may
      expect(mayAnswerAppeal(kase({ decided: no({ byUserId: "u_hs" }) }), meFor("u_hs", seats), false, seats)).toBe(false);
      expect(mayAnswerAppeal(kase({ decided: no({ byUserId: "u_hs" }) }), meFor("u_d2", seats), false, seats)).toBe(false); // role excluded with its holder
    });

    it("a second look nobody but the no-sayer could answer is unroutable, not pending: only a manager assigns it", () => {
      const lone: SeatRow[] = [
        { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
        { id: "seat_dep", roleId: "role_deputy", label: "Vacant", userId: null, sort: 1 },
        { id: "seat_x", roleId: "role_other", label: "X", userId: "u_x", sort: 2 },
      ];
      const c = kase({ appeal: appeal({ seatId: "seat_dep" }) });
      expect(appealRouting(c, lone)).toEqual({ state: "unroutable", roleIds: [] });
      expect(appealDeskRoles(c, lone)).toEqual([]);
      expect(mayAnswerAppeal(c, meFor("u_x", lone), false, lone)).toBe(false);
      expect(mayAnswerAppeal(c, meFor("u_x", lone), true, lone)).toBe(true); // a manager who is not the no-sayer
      expect(appealRouting(kase({ appeal: appeal({ seatId: null }) }), lone)).toEqual({ state: "unroutable", roleIds: [] });
      expect(appealRouting(kase(), seats)).toEqual({ state: "routed", roleIds: ["role_deputy"] });
      expect(appealRouting(kase({ appeal: null }), seats).state).toBe("none");
      expect(appealRouting(kase({ appeal: appeal({ decided: { uphold: false, reason: "r", by: "H", byUserId: "u_hs", day: 12 } }) }), seats).state).toBe("decided");
    });
  });

  describe("events of one day are ordered by their place, not their day", () => {
    const e = (id: string, type: CaseEvent["type"]): CaseEvent => ({ id, ts: 0, day: 5, type, actor: "x", actorUserId: null, target: "c1", payload: {} });
    // one day: no (0), appeal (1), appeal not upheld = reopen (2), a new no (3)
    const history = [e("e0", "case.decided"), e("e1", "case.appealed"), e("e2", "case.appeal.decided"), e("e3", "case.decided")];

    it("the first no is not this cycle's once the case reopened; the second no is", () => {
      const afterNo = { id: "c1", decidedSeq: 0, reopenSeq: null };
      const reopened = { id: "c1", decidedSeq: 0, reopenSeq: 2 };
      const noAgain = { id: "c1", decidedSeq: 3, reopenSeq: 2 };
      expect(decidedThisCycle(afterNo)).toBe(true);
      expect(decidedThisCycle(reopened)).toBe(false);
      expect(decidedThisCycle(noAgain)).toBe(true);
      expect(decidedThisCycle({ decidedSeq: null, reopenSeq: null })).toBe(false);
    });

    it("the two noes of one day have two keys, and a case never decided has none", () => {
      expect(decisionKey({ id: "c1", decidedSeq: 0 })).toBe("c1:0");
      expect(decisionKey({ id: "c1", decidedSeq: 3 })).toBe("c1:3");
      expect(decisionKey({ id: "c1", decidedSeq: null })).toBeNull();
    });

    it("cycleEvents are the events after the latest reopen: the whole history before the first", () => {
      expect(cycleEvents({ history, reopenSeq: null }).map((x) => x.id)).toEqual(["e0", "e1", "e2", "e3"]);
      expect(cycleEvents({ history, reopenSeq: 2 }).map((x) => x.id)).toEqual(["e3"]);
      expect(cycleEvents({ history, reopenSeq: 3 })).toEqual([]);
    });
  });
});
