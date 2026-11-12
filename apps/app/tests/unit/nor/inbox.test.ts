// Plan NOR, NOR-C1 (B2): the inbox shows a pending second look to the desk that may answer it, and why a case came to a desk (D26).
// The reducer fills the second look in NOR-A1, so the appeal is set by hand on a reduced case.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import { meFor } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type ReducedCase, type State } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { inboxItems } from "@/features/inbox";
import type { InboxItem } from "@/features/inbox/types";

const seats: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "Owner", userId: "u_own", sort: 0 },
  { id: "s_dep", roleId: "role_deputy", label: "Deputy", userId: "u_dep", sort: 1 },
  { id: "s_third", roleId: "role_third", label: "Third", userId: "u_third", sort: 2 },
];
const routes = LOCAL_SEED.routes.map((r) => (r.id === "r1" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_own", deputyRoleId: "role_deputy", deputySeatId: "s_dep" } : r));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats };

let n = 0;
const ev = (type: CaseEventType, payload: EventPayload = {}, by = "u_own", target = "c_a"): CaseEvent =>
  ({ id: "i" + n++, ts: 0, type, actor: by, actorUserId: by, target, payload, day: 0 });
const raised = ev("case.raised", { kind: "idea", title: "Shorter changeover", body: "text", routeId: "r1", assignee: "Owner", assigneeRoleHolderId: "s_own" }, "u_au");

const stateOf = (...events: CaseEvent[]): State => reduce(SEED, { events: [raised, ...events], day: 3 });
const itemsFor = (state: State, userId: string, role: "manager" | "leader" | "member" = "leader", discussion = true): InboxItem[] =>
  inboxItems({ state, me: meFor(userId, seats), seats, today: state.day, demo: false, role, flags: { projects: false, discussion } } as Parameters<typeof inboxItems>[0]);
const ofKind = (items: InboxItem[], kind: InboxItem["kind"]) => items.filter((i) => i.kind === kind);

/** A decided case with a pending second look, as NOR-A1's reducer will leave it; `seatId` is the desk the server named. */
function appealed(seatId: string | null): State {
  const state = stateOf(ev("case.decided", { answer: "no", reason: "not now" }));
  const c = state.cases[0];
  c.appeal = { text: "Please look again; the cost is lower than you thought.", day: 2, by: "R. Raiser", byUserId: "u_au", seatId, decided: null };
  c.dueDay = 8;
  return state;
}

describe("NOR inbox items", () => {
  it("gives the holders of the second-look desk an appeal item, due on the answer date, and nobody else", () => {
    const state = appealed("s_dep");
    const deputy = itemsFor(state, "u_dep");
    expect(ofKind(deputy, "appeal")).toEqual([{
      id: "appeal:c_a", ask: "decide", kind: "appeal", caseId: "c_a", title: "Shorter changeover", href: "/cases/c_a", dueDay: 8, late: false, dueSoon: false, pinned: false, deskRoleId: "role_deputy",
    }]);
    // The person who said no, a holder of another desk, the raiser and a manager while the desk can answer: no item.
    expect(ofKind(itemsFor(state, "u_own"), "appeal")).toEqual([]);
    expect(ofKind(itemsFor(state, "u_third"), "appeal")).toEqual([]);
    expect(ofKind(itemsFor(state, "u_au", "member"), "appeal")).toEqual([]);
    expect(ofKind(itemsFor(state, "u_boss", "manager"), "appeal")).toEqual([]);
  });

  it("asks a manager only when nobody holds the roles; the person who said no is never asked", () => {
    const state = appealed(null); // no occupied seat could take it
    const manager = ofKind(itemsFor(state, "u_boss", "manager"), "appeal");
    expect(manager).toHaveLength(1);
    expect(manager[0]).toMatchObject({ ask: "decide", kind: "appeal", href: "/cases/c_a", dueDay: 8, deskRoleId: null });
    expect(ofKind(itemsFor(state, "u_dep"), "appeal")).toEqual([]);
    // A manager who said the no cannot answer it.
    const own = ofKind(itemsFor(state, "u_own", "manager"), "appeal");
    expect(own).toEqual([]);
  });

  it("no item once the second look is answered, or when there is none", () => {
    const state = appealed("s_dep");
    state.cases[0].appeal!.decided = { uphold: true, reason: "Agreed", by: "Deputy", byUserId: "u_dep", day: 3 };
    expect(ofKind(itemsFor(state, "u_dep"), "appeal")).toEqual([]);
    expect(ofKind(itemsFor(stateOf(ev("case.decided", { answer: "no", reason: "not now" })), "u_dep"), "appeal")).toEqual([]);
  });

  it("a case that came back carries the cause reopened, until something happens on it", () => {
    const state = stateOf(ev("case.decided", { answer: "no", reason: "not now" }));
    const c = state.cases[0];
    // The clock reopened it on its revisit day: the reducer (NOR-A1) leaves it open on the desk with reopenSeq at that event.
    c.history = [...c.history, ev("case.reopened", { why: "revisit" }, "system:clock")];
    c.reopenSeq = c.history.length - 1;
    c.status = "open"; c.open = true; c.decided = null; c.archived = false;
    expect(ofKind(itemsFor(state, "u_own"), "case")[0].cause).toBe("reopened");
    // The clock's fact after it changes nothing; a read of the desk does.
    c.history = [...c.history, ev("clock.due", { kind: "deadline", dueDay: 9 }, "system:clock")];
    expect(ofKind(itemsFor(state, "u_own"), "case")[0].cause).toBe("reopened");
    c.history = [...c.history, ev("case.read", {}, "u_own")];
    expect(ofKind(itemsFor(state, "u_own"), "case")[0].cause).toBeUndefined();
  });

  it("a case passed to my seat says so: passed, not mine back to me, sent up to me", () => {
    const pass = (extra: EventPayload) => stateOf(ev("case.handed", { to: "Deputy", toRoleHolderId: "s_dep", why: "It is not my area at all", ...extra }));
    const cause = (state: State, user: string) => ofKind(itemsFor(state, user), "case")[0]?.cause;
    expect(cause(pass({}), "u_dep")).toBe("passed");
    expect(cause(pass({ back: true }), "u_dep")).toBe("back");
    expect(cause(pass({ up: true }), "u_dep")).toBe("up");
    // The seat it left has it no longer; an ordinary case on my desk has no cause.
    expect(ofKind(itemsFor(pass({}), "u_own"), "case")).toEqual([]);
    expect(cause(stateOf(), "u_own")).toBeUndefined();
  });

  it("a case a manager moved to me says moved", () => {
    const state = stateOf(ev("case.override", { chosen: "r1", proposed: "r1" }, "u_boss"));
    const c = state.cases[0];
    expect(c.history[c.history.length - 1].type).toBe("case.override");
    expect(ofKind(itemsFor(state, "u_own"), "case")[0].cause).toBe("moved");
  });

  it("a declined invitee gets no view item, the others still do", () => {
    const state = stateOf(ev("case.discussion", { invited: [], invitedUserIds: ["u_dep", "u_third"], missing: "A number" }));
    const c = state.cases[0] as ReducedCase;
    expect(c.discussion).not.toBeNull();
    c.discussion!.invitedUserIds = ["u_dep", "u_third"];
    expect(ofKind(itemsFor(state, "u_dep"), "view")).toHaveLength(1);
    c.discussion!.declinedUserIds = ["u_dep"];
    expect(ofKind(itemsFor(state, "u_dep"), "view")).toEqual([]);
    expect(ofKind(itemsFor(state, "u_third"), "view")).toHaveLength(1);
  });
});
