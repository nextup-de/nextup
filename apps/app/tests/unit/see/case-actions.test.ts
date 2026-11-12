// SEE-P1 (B1): what the case page offers around a case (plan SEE, D15 to D18): merge and link for the desk and managers, a better idea
// for the raiser of a no, revise for the raiser of an undecided case, the 'Maybe the same as' case only where the viewer may open it, and
// NOR's second look, Not for me and Move to a desk as they were. Cases are reduced from a log, with the SEE and NOR fields set by hand.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import { caseActions } from "@/features/cases/case-actions";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type ReducedCase, type State } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";

const seats: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "Owner", userId: "u_own", sort: 0 },
  { id: "s_dep", roleId: "role_deputy", label: "Deputy", userId: "u_dep", sort: 1 },
  { id: "s_third", roleId: "role_third", label: "Third", userId: "u_third", sort: 2 },
];
const routes = LOCAL_SEED.routes.map((r) => (r.id === "r1" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_own", deputyRoleId: "role_deputy", deputySeatId: "s_dep" } : r));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats };

let n = 0;
const ev = (type: CaseEventType, payload: EventPayload = {}, by = "u_own", day = 0): CaseEvent =>
  ({ id: "s" + n++, ts: 0, type, actor: by, actorUserId: by, target: "c_a", payload, day });
// The raiser u_au raised it on the owner's desk.
const raised = ev("case.raised", { kind: "idea", title: "Shorter changeover", body: "text", routeId: "r1", assignee: "Owner", assigneeRoleHolderId: "s_own" }, "u_au");

const stateOf = (day: number, ...events: CaseEvent[]): State => reduce(SEED, { events: [raised, ...events], day });
const caseOf = (s: State): ReducedCase => s.cases[0];
type Role = "manager" | "leader" | "member";
const may = (s: State, userId: string, role: Role = "leader", open: (id: string) => boolean = () => true) => caseActions(caseOf(s), meFor(userId, seats), role, s, open);

const open = () => stateOf(1);
const noState = () => stateOf(4, ev("case.decided", { answer: "no", reason: "not now" }, "u_own", 2));

describe("SEE case actions", () => {
  describe("merge and link", () => {
    it("the desk and a manager may on an undecided case; the raiser, a member and another desk may not", () => {
      const s = open();
      for (const [who, role] of [["u_own", "leader"], ["u_au", "leader"], ["u_x", "manager"]] as const) {
        const can = may(s, who, role);
        // u_au is the raiser: not on the desk, so no.
        const expected = who !== "u_au";
        expect([who, can.merge, can.link], who).toEqual([who, expected, expected]);
      }
      for (const [who, role] of [["u_au", "member"], ["u_third", "member"], ["u_dep", "member"]] as const) expect(may(s, who, role).merge, who).toBe(false);
      expect(may(s, "u_au", "member").link).toBe(false);
      // The deputy's seat is not the desk the case sits on.
      expect(may(s, "u_dep", "leader").merge).toBe(false);
    });

    it("merge needs an undecided case that is neither withdrawn nor merged, and not one that absorbed repeats; link survives a decision", () => {
      const decided = stateOf(3, ev("case.decided", { answer: "yes" }, "u_own", 2));
      expect(may(decided, "u_x", "manager")).toMatchObject({ merge: false, link: true });
      const withdrawn = stateOf(3, ev("case.withdrawn", {}, "u_au", 2));
      expect(may(withdrawn, "u_x", "manager")).toMatchObject({ merge: false, link: false });
      const merged = open();
      caseOf(merged).merged = { into: "c_b", day: 2, by: "Owner", byUserId: "u_own", note: "" };
      caseOf(merged).status = "merged";
      expect(may(merged, "u_x", "manager")).toMatchObject({ merge: false, link: false, betterIdea: false, revise: false });
      const absorbed = open();
      caseOf(absorbed).mergedIn = [{ id: "c_z", userId: "u_z", day: 1 }];
      expect(may(absorbed, "u_x", "manager")).toMatchObject({ merge: false, link: true });
    });

    it("a case asked or in a discussion may be merged too", () => {
      expect(may(stateOf(2, ev("case.asked", { text: "Which line?" }, "u_own", 1)), "u_own").merge).toBe(true);
      expect(may(stateOf(2, ev("case.discussion", { invited: [], missing: "x" }, "u_own", 1)), "u_own").merge).toBe(true);
    });
  });

  describe("the case it may be the same as", () => {
    const withSame = (id: string | null) => { const s = open(); caseOf(s).sameAs = id; return s; };

    it("is offered to the desk and managers when they may open that case", () => {
      expect(may(withSame("c_b"), "u_own").maybeSame).toBe("c_b");
      expect(may(withSame("c_b"), "u_x", "manager").maybeSame).toBe("c_b");
    });

    it("never when they may not open it: the target is not given at all", () => {
      expect(may(withSame("c_b"), "u_own", "leader", () => false).maybeSame).toBeNull();
      expect(may(withSame("c_b"), "u_x", "manager", (id) => id === "c_other").maybeSame).toBeNull();
      expect(caseActions(caseOf(withSame("c_b")), meFor("u_own", seats), "leader", withSame("c_b")).maybeSame).toBeNull(); // no opener handed in
    });

    it("never to the raiser or another member, and not when there is none", () => {
      expect(may(withSame("c_b"), "u_au", "member").maybeSame).toBeNull();
      expect(may(withSame("c_b"), "u_au", "leader").maybeSame).toBeNull();
      expect(may(withSame("c_b"), "u_third", "member").maybeSame).toBeNull();
      expect(may(withSame(null), "u_own").maybeSame).toBeNull();
    });
  });

  describe("a better idea", () => {
    it("the raiser after any no, also while a second look runs, and any time", () => {
      expect(may(noState(), "u_au", "member").betterIdea).toBe(true);
      const pending = noState();
      caseOf(pending).appeal = { text: "x".repeat(30), day: 3, by: "R", byUserId: "u_au", seatId: "s_dep", decided: null };
      expect(may(pending, "u_au", "member").betterIdea).toBe(true);
      expect(may(stateOf(400, ev("case.decided", { answer: "no", reason: "not now" }, "u_own", 2)), "u_au", "member").betterIdea).toBe(true);
    });

    it("not on a yes, an undecided case, a withdrawn or a merged case, and not for anyone but the raiser", () => {
      expect(may(stateOf(3, ev("case.decided", { answer: "yes" }, "u_own", 2)), "u_au", "member").betterIdea).toBe(false);
      expect(may(open(), "u_au", "member").betterIdea).toBe(false);
      expect(may(stateOf(3, ev("case.withdrawn", {}, "u_au", 2)), "u_au", "member").betterIdea).toBe(false);
      const merged = noState();
      caseOf(merged).status = "merged";
      expect(may(merged, "u_au", "member").betterIdea).toBe(false);
      for (const who of ["u_own", "u_dep", "u_x"]) expect(may(noState(), who, "leader").betterIdea, who).toBe(false);
      expect(may(noState(), "u_x", "manager").betterIdea).toBe(false);
    });
  });

  describe("revise", () => {
    it("the raiser of an undecided case outside a discussion", () => {
      expect(may(open(), "u_au", "member").revise).toBe(true);
      expect(may(stateOf(2, ev("case.asked", { text: "?" }, "u_own", 1)), "u_au", "member").revise).toBe(true);
    });

    it("not in a discussion (it has its own), not once decided, withdrawn or merged, and not for anyone else", () => {
      expect(may(stateOf(2, ev("case.discussion", { invited: [], missing: "x" }, "u_own", 1)), "u_au", "member").revise).toBe(false);
      expect(may(noState(), "u_au", "member").revise).toBe(false);
      expect(may(stateOf(3, ev("case.withdrawn", {}, "u_au", 2)), "u_au", "member").revise).toBe(false);
      for (const [who, role] of [["u_own", "leader"], ["u_x", "manager"], ["u_third", "member"]] as const) expect(may(open(), who, role).revise, who).toBe(false);
    });
  });

  describe("what NOR offered stays", () => {
    it("the second look for the raiser of a no, its answer for the desk of the appeal, Not for me for an invitee, Move to a desk for a manager", () => {
      const s = noState();
      expect(may(s, "u_au", "member").appeal).toEqual({ until: 2 + s.rules.appealDays });
      caseOf(s).appeal = { text: "x".repeat(30), day: 3, by: "R", byUserId: "u_au", seatId: "s_dep", decided: null };
      expect(may(s, "u_au", "member").appeal).toBeNull();
      expect(may(s, "u_dep", "leader").answerAppeal).toBe(true);
      expect(may(s, "u_own", "leader").answerAppeal).toBe(false); // said no
      const talk = stateOf(2, ev("case.discussion", { invited: ["Third"], invitedUserIds: ["u_third"], missing: "x" }, "u_own", 1));
      expect(may(talk, "u_third", "member").declineInvite).toBe(true);
      expect(may(open(), "u_x", "manager").moveToDesk).toBe(true);
      expect(may(noState(), "u_x", "manager").moveToDesk).toBe(false);
      expect(may(open(), "u_own", "leader").moveToDesk).toBe(false);
    });

    it("a withdrawn case offers nothing", () => {
      const s = stateOf(3, ev("case.withdrawn", {}, "u_au", 2));
      expect(may(s, "u_x", "manager")).toEqual({ appeal: null, answerAppeal: false, declineInvite: false, moveToDesk: false, merge: false, link: false, betterIdea: false, revise: false, maybeSame: null });
    });
  });
});
