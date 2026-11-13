// SEE-G1 (B3): the pure helpers of plan SEE answer as D12 to D17 say. Cases are reduced from literal events.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { followDraft, followHref, mayFollow, mayLink, mayMerge, MERGE_NOTE_MAX } from "@/features/cases/links";
import { reduce, type ReduceSeed, type ReducedCase } from "@/features/cases/reducer";
import { decidedWhileAsked, expectedByDay, noBlockOf } from "@/features/cases/raiser-view";
import type { Route } from "@/features/demo/types";
import { createT } from "@/i18n";

const SEATS: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "T. Vogel", userId: "u_own", sort: 0 },
  { id: "s_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_dep", sort: 1 },
  { id: "s_up", roleId: "role_head", label: "K. Head", userId: "u_up", sort: 2 },
];
const ROUTES: Route[] = [{
  id: "r1", type: "Type", keys: ["k"], owner: { name: "T. Vogel", role: "Owner", dept: "PRD" }, deputy: "H. Sander", buddy: "B", wait: "2 days",
  ownerSeatId: "s_own", ownerRoleId: "role_owner", deputySeatId: "s_dep", deputyRoleId: "role_deputy",
}];
const SEED: ReduceSeed = { cases: [], ideas: [], problems: [], routes: ROUTES, promiseDays: 5, seats: SEATS };
const NAME: Record<string, string> = { u_own: "T. Vogel", u_dep: "H. Sander", u_up: "K. Head", u_ra: "J. Schmidt", u_rb: "M. Roth" };

let n = 0;
const ev = (type: CaseEventType, by: string, target: string, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "h" + n++, ts: 0, type, actor: NAME[by] ?? by, actorUserId: by, target, payload, day });
const raise = (id = "ca", by = "u_ra", title = "Case " + id) => ev("case.raised", by, id, { kind: "problem", title, routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "s_own" }, 0);
const kase = (events: CaseEvent[], day = 10, id = "ca"): ReducedCase => reduce(SEED, { events: [raise(id), ...events], day }).cases.find((c) => c.id === id)!;
const no = (payload: EventPayload = {}, day = 2) => ev("case.decided", "u_own", "ca", { answer: "no", category: "no-fit", reason: "It does not fit any goal of ours", ...payload }, day);
const yes = (day = 2) => ev("case.decided", "u_own", "ca", { answer: "yes", projectId: "p_ca", lead: "T. Vogel", leadUserId: "u_own" }, day);
const appealed = (day = 3) => ev("case.appealed", "u_ra", "ca", { text: "Please look again, the numbers changed", toRoleHolderId: "s_dep" }, day);
const answered = (uphold: boolean, day = 4) => ev("case.appeal.decided", "u_dep", "ca", { uphold, reason: uphold ? "The no stands" : "New numbers change it" }, day);
/** An event the clock wrote: its actor is system:clock and it carries no user id. */
const byTheClock = (type: CaseEventType, target: string, payload: EventPayload, day: number): CaseEvent =>
  ({ id: "h" + n++, ts: 0, type, actor: "system:clock", actorUserId: null, target, payload, day });
const t = createT("en");

describe("SEE helpers", () => {
  describe("mayFollow, followHref and followDraft (D15)", () => {
    it("the raiser of a case whose latest decision is a no, any category, any time - also while a second look runs", () => {
      for (const category of ["not-now", "no-budget", "no-fit", "duplicate", "risk", "not-feasible"] as const) {
        expect(mayFollow(kase([no({ category, ...(category === "not-now" ? { revisitDay: 30 } : {}) })]), "u_ra"), category).toBe(true);
      }
      expect(mayFollow(kase([no(), appealed()]), "u_ra")).toBe(true); // a second look is pending
      expect(mayFollow(kase([no(), appealed(), answered(true)]), "u_ra")).toBe(true);
      expect(mayFollow(kase([ev("case.decided", "u_own", "ca", { answer: "no", reason: "no time", note: "Plan is full" })]), "u_ra")).toBe(true); // an old no
    });

    it("not for anyone else, a yes, an undecided, withdrawn, merged or reopened case, or a person without an id", () => {
      const noCase = kase([no()]);
      expect(mayFollow(noCase, "u_rb")).toBe(false);
      expect(mayFollow(noCase, "u_own")).toBe(false);
      expect(mayFollow(noCase, null)).toBe(false);
      expect(mayFollow(kase([yes()]), "u_ra")).toBe(false);
      expect(mayFollow(kase([]), "u_ra")).toBe(false);
      expect(mayFollow(kase([ev("case.withdrawn", "u_ra", "ca", {}, 1)]), "u_ra")).toBe(false);
      expect(mayFollow({ ...noCase, status: "withdrawn" }, "u_ra")).toBe(false);
      expect(mayFollow({ ...noCase, status: "merged" }, "u_ra")).toBe(false);
      expect(mayFollow(kase([no(), appealed(), answered(false)]), "u_ra")).toBe(false); // reopened by the second look: it is on the desk again
    });

    it("followHref is the raise page with the case, after the company prefix", () => {
      expect(followHref("ca")).toBe("/raise?follows=ca");
      expect(followHref("c a&b")).toBe("/raise?follows=c%20a%26b");
    });

    it("followDraft starts with the old title and the context; the last sentence only with a changeIf", () => {
      const withIf = followDraft(kase([no({ category: "not-now", revisitDay: 30, reason: "Not before the audit is over", changeIf: "  A free week  " })]), t);
      expect(withIf.text).toBe("Case ca");
      expect(withIf.context).toBe("Follows up on “Case ca”. The answer was: Not now: Not before the audit is over. What would make it a yes: A free week.");
      const without = followDraft(kase([no({ category: "duplicate", reason: "Already in work under another case", duplicateOf: "cb" })]), t);
      expect(without.context).toBe("Follows up on “Case ca”. The answer was: Already solved or in work: Already in work under another case.");
      // an old no: the picked id's label and the note
      const old = followDraft(kase([ev("case.decided", "u_own", "ca", { answer: "no", reason: "no time", note: "The plan is full" })]), t);
      expect(old.context).toBe("Follows up on “Case ca”. The answer was: No time this quarter: The plan is full.");
      // German
      expect(followDraft(kase([no({ category: "risk", reason: "Too risky for the line", changeIf: "A safer design" })]), createT("de")).context).toContain("Folgt auf „Case ca“. Die Antwort war: ");
      expect(followDraft(kase([no({ category: "risk", reason: "Too risky for the line", changeIf: "A safer design" })]), createT("de")).context).toContain("Was daraus ein Ja machen würde: A safer design.");
    });
  });

  describe("mayMerge and mayLink (D17)", () => {
    const ca = () => kase([]);
    const target = (events: CaseEvent[] = []) => kase(events, 10, "cb");
    const cb = () => target();
    const desk = meFor("u_own", SEATS); // holds the case's desk role
    const other = meFor("u_up", SEATS);
    const raiser = meFor("u_ra", SEATS);

    it("the desk and a manager may merge an undecided case into another; the raiser and any other member may not", () => {
      expect(mayMerge(ca(), cb(), desk, false)).toBe(true);
      expect(mayMerge(ca(), cb(), other, true)).toBe(true); // a manager
      expect(mayMerge(ca(), cb(), other, false)).toBe(false);
      expect(mayMerge(ca(), cb(), raiser, false)).toBe(false);
      expect(mayMerge(ca(), cb(), meFor(null, SEATS), false)).toBe(false);
      // an asked case and a case in discussion too; the escalated-to role holds the desk
      expect(mayMerge(kase([ev("case.asked", "u_own", "ca", { text: "?" }, 1)]), cb(), desk, false)).toBe(true);
      expect(mayMerge(kase([ev("case.discussion", "u_own", "ca", { invited: ["x"], missing: "y" }, 1)]), cb(), desk, false)).toBe(true);
      const escalated = { ...ca(), assigneeRoleId: "role_deputy", escalated: { to: "K. Head", toSeatId: "s_up", toRoleId: "role_head", from: "H. Sander", day: 7, live: true } };
      expect(mayMerge(escalated, cb(), other, false)).toBe(true);
    });

    it("not a decided, withdrawn or merged case, not into itself, a merged or withdrawn case, nothing, or a case the person may not open", () => {
      expect(mayMerge(kase([no()]), cb(), desk, true)).toBe(false);
      expect(mayMerge(kase([yes()]), cb(), desk, true)).toBe(false);
      expect(mayMerge(kase([ev("case.withdrawn", "u_ra", "ca", {}, 1)]), cb(), desk, true)).toBe(false);
      expect(mayMerge({ ...ca(), status: "merged", merged: { into: "cb", day: 1, by: "x", byUserId: null, note: "" } }, cb(), desk, true)).toBe(false);
      expect(mayMerge(ca(), ca(), desk, true)).toBe(false);
      expect(mayMerge(ca(), { ...cb(), status: "merged", merged: { into: "cc", day: 1, by: "x", byUserId: null, note: "" } }, desk, true)).toBe(false);
      expect(mayMerge(ca(), { ...cb(), status: "withdrawn", withdrawn: { day: 1, by: "x", byUserId: null, note: "" } }, desk, true)).toBe(false);
      expect(mayMerge(ca(), null, desk, true)).toBe(false);
      expect(mayMerge(ca(), cb(), desk, true, false)).toBe(false); // the caller says the person may not open the target
      // a decided target is allowed: an idea already in a project absorbs the repeat
      expect(mayMerge(ca(), target([ev("case.decided", "u_own", "cb", { answer: "yes", projectId: "p_cb", lead: "T. Vogel", leadUserId: "u_own" }, 1)]), desk, false)).toBe(true);
      expect(MERGE_NOTE_MAX).toBe(300);
    });

    it("a case that absorbed repeats stays a destination: it may not be merged into another", () => {
      const absorbed = { ...ca(), mergedIn: [{ id: "cz", userId: "u_rb", day: 1 }] };
      expect(mayMerge(absorbed, cb(), desk, true)).toBe(false);
    });

    it("the same people may link two cases that are not merged, not withdrawn (this one) and not linked yet", () => {
      expect(mayLink(ca(), cb(), desk, false)).toBe(true);
      expect(mayLink(ca(), cb(), other, true)).toBe(true);
      expect(mayLink(ca(), cb(), other, false)).toBe(false);
      expect(mayLink(ca(), cb(), raiser, false)).toBe(false);
      expect(mayLink(kase([no()]), cb(), desk, false)).toBe(true); // a decided case may be linked
      expect(mayLink(ca(), ca(), desk, true)).toBe(false);
      expect(mayLink(ca(), null, desk, true)).toBe(false);
      expect(mayLink(ca(), cb(), desk, true, false)).toBe(false);
      expect(mayLink({ ...ca(), links: ["cb"] }, cb(), desk, true)).toBe(false);
      expect(mayLink(kase([ev("case.withdrawn", "u_ra", "ca", {}, 1)]), cb(), desk, true)).toBe(false);
      expect(mayLink({ ...ca(), merged: { into: "cc", day: 1, by: "x", byUserId: null, note: "" } }, cb(), desk, true)).toBe(false);
      expect(mayLink(ca(), { ...cb(), merged: { into: "cc", day: 1, by: "x", byUserId: null, note: "" } }, desk, true)).toBe(false);
      // a withdrawn target may still be linked to
      expect(mayLink(ca(), kase([ev("case.withdrawn", "u_ra", "cb", {}, 1)], 10, "cb"), desk, true)).toBe(true);
    });
  });

  describe("noBlockOf (D12)", () => {
    it("is null unless the latest decision is a no", () => {
      expect(noBlockOf(kase([]), 10, 10)).toBeNull();
      expect(noBlockOf(kase([yes()]), 10, 10)).toBeNull();
      expect(noBlockOf(kase([no({ category: "not-now", revisitDay: 20 }), byTheClock("case.reopened", "ca", { why: "revisit" }, 20)]), 21, 10)).toBeNull(); // came back on its own: no live no
    });

    it("gives the category, its label, the reason, what would make it a yes, the revisit day and the duplicate", () => {
      const b = noBlockOf(kase([no({ category: "not-now", revisitDay: 20, reason: "Not before the audit is over", changeIf: "A free week" })]), 3, 10)!;
      expect(b).toMatchObject({ category: "not-now", categoryLabel: "caseNo.catNotNow", reason: "Not before the audit is over", changeIf: "A free week", revisitDay: 20, duplicateOf: null, decidedWhileAsked: false });
      const plain = noBlockOf(kase([no({ category: "risk" })]), 3, 10)!;
      expect(plain).toMatchObject({ category: "risk", changeIf: "", revisitDay: null });
      const dup = noBlockOf(kase([no({ category: "duplicate", duplicateOf: "cb" })]), 3, 10)!;
      expect(dup).toMatchObject({ category: "duplicate", duplicateOf: "cb" });
      // an old no keeps today's label and reads its text from the note
      expect(noBlockOf(kase([ev("case.decided", "u_own", "ca", { answer: "no", reason: "no time", note: "The plan is full" })]), 3, 10)).toMatchObject({
        category: "no-time", categoryLabel: "shell.noNoTime", reason: "The plan is full",
      });
    });

    it("the second look is open until the no's day plus appeal_days, then closed", () => {
      const c = kase([no({}, 2)]);
      expect(noBlockOf(c, 5, 10)!.secondLook).toEqual({ state: "open", until: 12, askedDay: null, answer: null });
      expect(noBlockOf(c, 12, 10)!.secondLook.state).toBe("open"); // the last day
      expect(noBlockOf(c, 13, 10)!.secondLook).toEqual({ state: "closed", until: null, askedDay: null, answer: null });
    });

    it("a pending second look says when it was asked; a kept one says why; a reopened one says so", () => {
      expect(noBlockOf(kase([no(), appealed(3)]), 5, 10)!.secondLook).toEqual({ state: "asked", until: null, askedDay: 3, answer: null });
      expect(noBlockOf(kase([no(), appealed(3), answered(true, 4)]), 5, 10)!.secondLook).toEqual({
        state: "kept", until: null, askedDay: 3, answer: { uphold: true, reason: "The no stands", day: 4 },
      });
      const reopened = noBlockOf(kase([no(), appealed(3), answered(false, 4)]), 5, 10)!;
      expect(reopened.secondLook).toEqual({ state: "reopened", until: null, askedDay: 3, answer: { uphold: false, reason: "New numbers change it", day: 4 } });
      expect(reopened.category).toBe("no-fit");
      // decided again after the reopen: the one second look is used
      const again = noBlockOf(kase([no(), appealed(3), answered(false, 4), no({ category: "risk" }, 6)]), 7, 10)!;
      expect(again).toMatchObject({ category: "risk" });
      expect(again.secondLook.state).toBe("closed");
    });

    it("says when the desk decided before the raiser answered", () => {
      expect(noBlockOf(kase([ev("case.asked", "u_own", "ca", { text: "Which line?" }, 1), no({}, 2)]), 3, 10)!.decidedWhileAsked).toBe(true);
      expect(noBlockOf(kase([ev("case.asked", "u_own", "ca", { text: "Which line?" }, 1), ev("case.answered", "u_ra", "ca", { text: "Line 3" }, 2), no({}, 3)]), 4, 10)!.decidedWhileAsked).toBe(false);
    });
  });

  describe("expectedByDay (D13)", () => {
    const talk = (...more: CaseEvent[]) => kase([ev("case.discussion", "u_own", "ca", { invited: ["x"], missing: "y" }, 1), ...more], 3);
    it("is the last day of the discussion while the case is in one, before and after that day", () => {
      const c = talk();
      expect(c.status).toBe("discussion");
      expect(c.discussion!.lastDay).toBeGreaterThan(0);
      expect(expectedByDay(c)).toBe(c.discussion!.lastDay);
      const late = kase([ev("case.discussion", "u_own", "ca", { invited: ["x"], missing: "y" }, 1)], 400);
      expect(expectedByDay(late)).toBe(late.discussion!.lastDay); // past it the page reads "was expected by"
      expect(late.discussion!.lastDay).toBeLessThan(400);
    });

    it("is null outside a discussion and while its last day is not known", () => {
      expect(expectedByDay(kase([]))).toBeNull();
      expect(expectedByDay(talk(ev("case.decided", "u_own", "ca", { answer: "no", reason: "no time", note: "x" }, 2)))).toBeNull();
      expect(expectedByDay({ status: "discussion", discussion: { ...talk().discussion!, lastDay: 0 } })).toBeNull();
      expect(expectedByDay({ status: "discussion", discussion: null })).toBeNull();
    });
  });

  describe("decidedWhileAsked (D14)", () => {
    const asked = (day = 1) => ev("case.asked", "u_own", "ca", { text: "Which line?" }, day);
    const answer = (day = 2) => ev("case.answered", "u_ra", "ca", { text: "Line 3" }, day);
    it("is true when the latest decision came after a question that nobody answered", () => {
      expect(decidedWhileAsked(kase([asked(), no({}, 2)]))).toBe(true);
      expect(decidedWhileAsked(kase([asked(), yes(2)]))).toBe(true);
      expect(decidedWhileAsked(kase([asked(), answer(), asked(3), no({}, 4)]))).toBe(true); // the second question is open
      expect(decidedWhileAsked(kase([asked(1), no({}, 1)]))).toBe(true); // the same day: by place in the history
    });
    it("is false without a question, after an answer or a return without an answer, and when the question came after the decision", () => {
      expect(decidedWhileAsked(kase([no()]))).toBe(false);
      expect(decidedWhileAsked(kase([]))).toBe(false);
      expect(decidedWhileAsked(kase([asked(), answer(), no({}, 3)]))).toBe(false);
      expect(decidedWhileAsked(kase([asked(), byTheClock("case.unanswered", "ca", {}, 6), no({}, 7)]))).toBe(false);
      expect(decidedWhileAsked(kase([no({}, 1), asked(2)]))).toBe(false);
    });
  });
});
