// Plan NOR, NOR-P1 (B1): what the case page offers the viewer of a no (D14, D18, D20, D21). Cases are reduced from a log and the
// NOR fields set by hand where they are not the reducer's own yet.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import { meFor } from "@/features/auth/identity";
import { caseActions, questionOpen, reviseThenAnswer } from "@/features/cases/case-actions";
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
  ({ id: "a" + n++, ts: 0, type, actor: by, actorUserId: by, target: "c_a", payload, day });
const raised = ev("case.raised", { kind: "idea", title: "Shorter changeover", body: "text", routeId: "r1", assignee: "Owner", assigneeRoleHolderId: "s_own" }, "u_au");

function stateOf(day: number, ...events: CaseEvent[]): State {
  return reduce(SEED, { events: [raised, ...events], day });
}
const caseOf = (s: State): ReducedCase => s.cases[0];
const may = (s: State, userId: string, role: "manager" | "leader" | "member" = "leader") => caseActions(caseOf(s), meFor(userId, seats), role, s);

/** A decided no, with a second look pending when `seatId` is given. */
function noAt(day: number, seatId?: string | null): State {
  const s = stateOf(day, ev("case.decided", { answer: "no", reason: "not now" }, "u_own", 2));
  if (seatId !== undefined) caseOf(s).appeal = { text: "Please look again, the cost is lower.", day: 3, by: "R", byUserId: "u_au", seatId, decided: null };
  return s;
}

describe("NOR case actions", () => {
  it("gives the raiser Ask for a second look inside appeal_days of a no, with the last day, and only once", () => {
    const days = noAt(3).rules.appealDays; // the company's rule, 10 by default
    expect(may(noAt(3), "u_au").appeal).toEqual({ until: 2 + days });
    expect(may(noAt(2 + days), "u_au").appeal).toEqual({ until: 2 + days }); // the last day still counts
    expect(may(noAt(3 + days), "u_au").appeal).toBeNull(); // one day later it is over
    expect(may(noAt(3, "s_dep"), "u_au").appeal).toBeNull(); // asked once already
    // Nobody else asks for it: not the desk, not a manager, not another employee.
    for (const [user, role] of [["u_own", "leader"], ["u_dep", "leader"], ["u_boss", "manager"], ["u_third", "member"]] as const) expect(may(noAt(3), user, role).appeal, user).toBeNull();
  });

  it("no second look for a yes or an open case", () => {
    const yes = stateOf(3, ev("case.decided", { answer: "yes" }, "u_own", 2));
    expect(may(yes, "u_au").appeal).toBeNull();
    expect(may(stateOf(3), "u_au").appeal).toBeNull();
  });

  it("gives the second-look desk and managers Answer the second look, never the person who said no", () => {
    const pending = noAt(4, "s_dep");
    expect(may(pending, "u_dep").answerAppeal).toBe(true);
    expect(may(pending, "u_boss", "manager").answerAppeal).toBe(true);
    expect(may(pending, "u_own").answerAppeal).toBe(false); // said no
    expect(may(pending, "u_third").answerAppeal).toBe(false); // another desk
    expect(may(pending, "u_au", "member").answerAppeal).toBe(false); // the raiser
    // A manager who said the no cannot answer it either.
    expect(may(pending, "u_own", "manager").answerAppeal).toBe(false);
    // Nothing to answer without a pending second look, or once it is answered.
    expect(may(noAt(4), "u_dep").answerAppeal).toBe(false);
    caseOf(pending).appeal!.decided = { uphold: true, reason: "Agreed", by: "Deputy", byUserId: "u_dep", day: 4 };
    expect(may(pending, "u_dep").answerAppeal).toBe(false);
  });

  it("gives an invitee Not for me while the discussion is open, until they decline", () => {
    const talking = stateOf(3, ev("case.discussion", { invited: [], missing: "A number" }));
    caseOf(talking).discussion!.invitedUserIds = ["u_dep", "u_third"];
    expect(may(talking, "u_dep").declineInvite).toBe(true);
    expect(may(talking, "u_third", "member").declineInvite).toBe(true);
    // Not invited, the desk and the raiser have no such button.
    expect(may(talking, "u_boss", "manager").declineInvite).toBe(false);
    expect(may(talking, "u_au", "member").declineInvite).toBe(false);
    caseOf(talking).discussion!.declinedUserIds = ["u_dep"];
    expect(may(talking, "u_dep").declineInvite).toBe(false);
    // Once decided the discussion is over.
    const decided = stateOf(3, ev("case.discussion", { invited: [] }), ev("case.decided", { answer: "yes" }));
    caseOf(decided).discussion!.invitedUserIds = ["u_dep"];
    expect(may(decided, "u_dep").declineInvite).toBe(false);
  });

  it("gives a manager Move to a desk on an open or asked case, nobody else, and not on a decided one", () => {
    const open = stateOf(3);
    expect(may(open, "u_boss", "manager").moveToDesk).toBe(true);
    expect(may(open, "u_own").moveToDesk).toBe(false);
    expect(may(open, "u_au", "member").moveToDesk).toBe(false);
    const asked = stateOf(3, ev("case.asked", { text: "Which line?" }));
    expect(may(asked, "u_boss", "manager").moveToDesk).toBe(true);
    expect(may(noAt(3), "u_boss", "manager").moveToDesk).toBe(false);
  });

  it("gives nobody anything on a withdrawn case", () => {
    const gone = stateOf(3, ev("case.withdrawn", { note: "Solved" }, "u_au"));
    expect(caseOf(gone).withdrawn).not.toBeNull();
    for (const [user, role] of [["u_au", "member"], ["u_own", "leader"], ["u_dep", "leader"], ["u_boss", "manager"]] as const) {
      expect(may(gone, user, role), user).toEqual({ appeal: null, answerAppeal: false, declineInvite: false, moveToDesk: false });
    }
  });

  describe("revise, then answer", () => {
    const steps = (reviseResult: unknown) => {
      const calls: string[] = [];
      return {
        calls,
        step: {
          revise: async () => { calls.push("revise"); if (reviseResult instanceof Error) throw reviseResult; return reviseResult; },
          answer: async (text: string) => { calls.push("answer " + text); },
        },
      };
    };

    it("answers the open question with See v<n>, after the revision went through", async () => {
      const a = steps({ ok: true });
      expect(await reviseThenAnswer(a.step, 3, true)).toBe(true);
      expect(a.calls).toEqual(["revise", "answer See v3"]);
      // An append that hands back nothing counts as done (the local demo).
      const b = steps(undefined);
      expect(await reviseThenAnswer(b.step, 2, true)).toBe(true);
      expect(b.calls).toEqual(["revise", "answer See v2"]);
    });

    it("writes no answer after a refused or failed revision, or when no question is open", async () => {
      for (const result of [{ ok: false, error: "No" }, new Error("down")]) {
        const a = steps(result);
        expect(await reviseThenAnswer(a.step, 3, true)).toBe(false);
        expect(a.calls).toEqual(["revise"]);
      }
      const none = steps({ ok: true });
      expect(await reviseThenAnswer(none.step, 3, false)).toBe(true);
      expect(none.calls).toEqual(["revise"]);
    });

    it("a question is open while the case is asked and nobody answered", () => {
      const asked = stateOf(3, ev("case.asked", { text: "Which line?" }));
      expect(questionOpen(caseOf(asked))).toBe(true);
      const answered = stateOf(3, ev("case.asked", { text: "Which line?" }), ev("case.answered", { text: "Line 3" }, "u_au"));
      expect(questionOpen(caseOf(answered))).toBe(false);
      expect(questionOpen(caseOf(stateOf(3)))).toBe(false);
    });
  });
});
