// NOR-D1: what the clock brings to a case in "The reasoned no": a not-now back on its date, a second look chased, an invitee's view,
// a late check-in escalated, and every once-per-case rule once per cycle (plan NOR, D11, D12, D14, D18, D19, D23, D24).
// The NOR fields of a case are written by hand on a case the reducer made (NOR-A1 fills them in the real reducer), so a later
// change of the reducer cannot move these cases. Everything is pure: dueNow on a literal state.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type ReducedCase, type State } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR, DEMO_CLOCK, type ClockSpec } from "@/features/clock";
import { dueNow, type Due, type SeatAbove } from "@/features/clock/due";
import { caseDues, type CaseClockExtra } from "@/features/clock/kinds/case";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS } from "@/features/demo/seed";

const WORKDAYS: ClockSpec = { mode: "workdays", calendar: DEFAULT_CALENDAR };
const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 1 },
  { id: "seat_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 2 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner", deputySeatId: "seat_dep", deputyRoleId: "role_deputy" } : x));
/** The seat above a role: the head is above the owner's and the deputy's desk. */
const UP: Record<string, string> = { role_owner: "seat_head", role_deputy: "seat_head" };
const asked: [string, readonly string[]][] = [];
const above: SeatAbove = (roleId, skip) => { asked.push([roleId, skip]); return skip.includes(roleId) ? null : UP[roleId] ?? null; };
const PROMISE = 5;
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE, seats, clock: WORKDAYS };

let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "n" + n++, ts: 0, type, actor, actorUserId, target, payload, day });
const raised = (id: string, day = 0) => ev("case.raised", "C. Ilg", "u_ci", id, { kind: "problem", title: "Case " + id, routeId: "r1", assignee: "T. Vogel" }, day);
const fact = (target: string, payload: EventPayload, day = 0) => ev("clock.due", "system:clock", null, target, payload, day);

/** The reducer's state, with `patch` on one case and that case's history replaced by the complete list (the reducer keeps only the events it knows). */
function world(events: CaseEvent[], day: number, patch: (c: ReducedCase) => void = () => {}, seed: ReduceSeed = SEED, id = "c_a"): State {
  const state = reduce(seed, { events, day });
  const c = state.cases.find((x) => x.id === id);
  if (!c) throw new Error("no case");
  c.history = events.filter((e) => e.target === id);
  patch(c);
  return state;
}
const dues = (state: State, today = state.day, up: SeatAbove = above) => dueNow(state, today, up);
const kinds = (d: Due[]) => d.map((x) => x.kind);

const decision = (over: Partial<NonNullable<ReducedCase["decided"]>> = {}): NonNullable<ReducedCase["decided"]> => ({
  answer: "no", reason: "Not this quarter", note: "", by: "T. Vogel", byUserId: "u_tv", day: 10, category: "not-now", changeIf: "", revisitDay: 30, duplicateOf: null, ...over,
});
/** A case that was decided no at history index `seq`, archived. */
const decidedNo = (seq: number, d = decision(), more: (c: ReducedCase) => void = () => {}) => (c: ReducedCase) => {
  c.status = "decided"; c.open = false; c.archived = true;
  c.decided = d; c.decisions = [d]; c.decidedSeq = seq;
  more(c);
};
const no = (target = "c_a", day = 10) => ev("case.decided", "T. Vogel", "u_tv", target, { answer: "no", category: "not-now", reason: "Not this quarter", revisitDay: 30 }, day);

describe("NOR clock", () => {
  describe("revisit", () => {
    const log = [raised("c_a"), no()];

    it("a not-now with a revisit day gives one revisit Due once its day has come, to the route owner's seat", () => {
      const at = (day: number) => dues(world(log, day, decidedNo(1)), day);
      expect(at(29)).toEqual([]);
      expect(at(30)).toEqual([{ kind: "revisit", target: "c_a", dueDay: 30, toRoleHolderId: "seat_tv", idemKey: "clk:revisit:c_a:1:0" }]);
      // Whenever the clock first sees it, it is the same Due.
      expect(at(41)).toEqual(at(30));
    });

    it("the key is the decision's place in the history and the cycle, never its day", () => {
      const first = dues(world(log, 30, decidedNo(1)))[0];
      const sameDay = [raised("c_a"), no(), ev("case.appeal.decided", "H. Sander", "u_hs", "c_a", { uphold: false, reason: "x".repeat(40) }, 10), no("c_a", 10)];
      // Two noes of one day, with a second look that reopened the case between them: two decisions, two keys.
      const again = dues(world(sameDay, 30, decidedNo(3, decision(), (c) => { c.reopens = [{ why: "appeal", day: 10, by: "H. Sander" }]; c.reopenSeq = 2; })))[0];
      expect(first.idemKey).toBe("clk:revisit:c_a:1:0");
      expect(again.idemKey).toBe("clk:revisit:c_a:3:1");
      expect(again.dueDay).toBe(30);
    });

    it("none once the case reopened after that decision, also on the same day; the later no's revisit fires once", () => {
      const reopened = decidedNo(1, decision(), (c) => { c.reopens = [{ why: "revisit", day: 30, by: "system:clock" }]; c.reopenSeq = 2; c.decided = null; });
      // The reopen came after the decision: the case is open on a desk again and has no decision of this cycle.
      expect(dues(world([...log, ev("case.reopened", "system:clock", null, "c_a", { why: "revisit" }, 30)], 31, reopened))).toEqual([]);
      const second = decision({ day: 31, revisitDay: 45 });
      const log2 = [...log, ev("case.reopened", "system:clock", null, "c_a", { why: "revisit" }, 30), no("c_a", 31)];
      const cycle2 = decidedNo(3, second, (c) => { c.reopens = [{ why: "revisit", day: 30, by: "system:clock" }]; c.reopenSeq = 2; });
      expect(dues(world(log2, 44, cycle2))).toEqual([]);
      expect(dues(world(log2, 45, cycle2))).toEqual([{ kind: "revisit", target: "c_a", dueDay: 45, toRoleHolderId: "seat_tv", idemKey: "clk:revisit:c_a:3:1" }]);
      // Two reopens: the third cycle's key.
      const third = decidedNo(5, second, (c) => { c.reopens = [{ why: "revisit", day: 30, by: "system:clock" }, { why: "appeal", day: 40, by: "H. Sander" }]; c.reopenSeq = 4; });
      expect(dues(world([...log2, ev("case.reopened", "system:clock", null, "c_a", { why: "revisit" }, 40), no("c_a", 41)], 50, third))[0].idemKey).toBe("clk:revisit:c_a:5:2");
    });

    it("a yes, a no without a revisit day and a no that is only a decision of an earlier cycle give none", () => {
      expect(dues(world(log, 99, decidedNo(1, decision({ answer: "yes", revisitDay: null }))))).toEqual([]);
      expect(dues(world(log, 99, decidedNo(1, decision({ category: "no-fit", revisitDay: null }))))).toEqual([]);
      expect(dues(world(log, 99, decidedNo(1, decision(), (c) => { c.reopenSeq = 5; })))).toEqual([]);
    });

    it("a route that is gone or has nobody on its owner role sends the case to the fallback desk", () => {
      const gone = (c: ReducedCase) => { c.route = null; c.routeId = "r_gone"; };
      // Given by the scheduler (features/cases/stamp.ts fallbackSeat) ...
      const given = (extra: CaseClockExtra) => caseDues(world(log, 30, decidedNo(1, decision(), gone)), 30, above, extra)[0];
      expect(given({ fallbackSeatId: "seat_dep" })).toMatchObject({ kind: "revisit", toRoleHolderId: "seat_dep" });
      expect(given({ fallbackSeatId: null })).toMatchObject({ kind: "revisit", toRoleHolderId: null });
      // ... and without one (a company with no org chart) nobody: the reducer then decides.
      expect(dues(world(log, 30, decidedNo(1, decision(), gone)))[0]).toMatchObject({ kind: "revisit", toRoleHolderId: null });
      const empty = SEED.seats?.map((s) => (s.id === "seat_tv" ? { ...s, userId: null } : s));
      expect(caseDues(world(log, 30, decidedNo(1), { ...SEED, seats: empty }), 30, above, { fallbackSeatId: "seat_head" })[0]).toMatchObject({ kind: "revisit", toRoleHolderId: "seat_head" });
    });

    it("the revisit goes behind the facts, as the other events the clock writes", () => {
      const state = world(log, 30, decidedNo(1));
      const talk = [raised("c_b"), ev("case.discussion", "T. Vogel", "u_tv", "c_b", { invited: ["N"], invitedUserIds: ["u_a"], missing: "x" }, 28)];
      state.cases.push(...reduce(SEED, { events: talk, day: 30 }).cases);
      const out = dues(state, 30);
      expect(kinds(out)).toContain("view");
      expect(kinds(out).at(-1)).toBe("revisit");
    });
  });

  describe("second look", () => {
    const appealOn = (day = 10, seatId: string | null = "seat_dep") => ({ text: "x".repeat(30), day, by: "C. Ilg", byUserId: "u_ci", seatId, decided: null });
    const pending = (c: ReducedCase) => { decidedNo(1)(c); c.appeal = appealOn(); };
    const log = [raised("c_a"), no(), ev("case.appealed", "C. Ilg", "u_ci", "c_a", { text: "x".repeat(30), toRoleHolderId: "seat_dep" }, 10)];
    const FIRST = 10 + PROMISE;
    const SECOND = FIRST + 3; // escalation_days defaults to 3

    it("reminds the appeal's seat on the day the answer is due, once, and asks nothing before", () => {
      const at = (day: number, extra: CaseClockExtra = { promiseDays: PROMISE }) => caseDues(world(log, day, pending), day, above, extra).filter((d) => d.kind === "appeal");
      expect(at(FIRST - 1)).toEqual([]);
      expect(at(FIRST)).toEqual([{ kind: "appeal", target: "c_a", dueDay: FIRST, toRoleHolderId: "seat_dep", idemKey: `clk:appeal:c_a:${FIRST}` }]);
      // The company's own answer length counts, and the reducer's 5 is the default.
      expect(at(FIRST, {})).toEqual(at(FIRST));
      expect(at(14, { promiseDays: 4 }).map((d) => d.dueDay)).toEqual([14]);
      const done = [...log, fact("c_a", { kind: "appeal", dueDay: FIRST, toRoleHolderId: "seat_dep" }, FIRST)];
      expect(caseDues(world(done, FIRST + 1, pending), FIRST + 1, above, { promiseDays: PROMISE })).toEqual([]);
    });

    it("escalation_days later brings in the seat above the appeal's desk, skipping the roles the no-sayer holds; check 2", () => {
      asked.length = 0;
      const out = dues(world([...log, fact("c_a", { kind: "appeal", dueDay: FIRST, toRoleHolderId: "seat_dep" }, FIRST)], SECOND, pending), SECOND);
      expect(out).toEqual([{ kind: "appeal", target: "c_a", dueDay: SECOND, check: 2, toRoleHolderId: "seat_head", idemKey: `clk:appeal:c_a:${SECOND}:2` }]);
      // The overload area computes the case area's Dues again (plan OVL, D29): the same question comes twice.
      expect([...new Set(asked.map((a) => JSON.stringify(a)))].map((a) => JSON.parse(a))).toEqual([["role_deputy", ["role_owner"]]]);
      const both = dues(world(log, SECOND, pending), SECOND);
      expect(both.map((d) => [d.dueDay, d.check ?? null])).toEqual([[FIRST, null], [SECOND, 2]]);
      expect(dues(world([...log, fact("c_a", { kind: "appeal", dueDay: FIRST, toRoleHolderId: "seat_dep" }), fact("c_a", { kind: "appeal", dueDay: SECOND, check: 2 })], SECOND + 3, pending), SECOND + 3)).toEqual([]);
      expect(dues(world(log, SECOND - 1, pending), SECOND - 1).map((d) => d.dueDay)).toEqual([FIRST]);
    });

    it("without a seat the route's deputy role is the desk; an answered second look and a case without a no ask nothing", () => {
      asked.length = 0;
      const out = dues(world(log, SECOND, (c) => { decidedNo(1)(c); c.appeal = appealOn(10, null); }), SECOND).filter((d) => d.check === 2);
      expect(out[0]).toMatchObject({ toRoleHolderId: "seat_head" });
      // The overload area computes the case area's Dues again (plan OVL, D29): the same question comes twice.
      expect([...new Set(asked.map((a) => JSON.stringify(a)))].map((a) => JSON.parse(a))).toEqual([["role_deputy", ["role_owner"]]]);
      const answered = (c: ReducedCase) => { decidedNo(1)(c); c.appeal = { ...appealOn(), decided: { uphold: true, reason: "r", by: "H. Sander", byUserId: "u_hs", day: 12 } }; };
      expect(dues(world(log, SECOND + 5, answered))).toEqual([]);
      expect(dues(world(log, SECOND + 5, (c) => { pending(c); c.decided = null; }))).toEqual([]);
    });
  });

  describe("view", () => {
    const disc = (invited: string[], day = 0) => ev("case.discussion", "T. Vogel", "u_tv", "c_a", { invited: invited.map((u) => "N " + u), invitedUserIds: invited, missing: "x" }, day);
    const comment = (by: string, day: number) => ev("case.commented", "N " + by, by, "c_a", { text: "my view" }, day);
    const declined = (by: string, day: number) => ev("case.invite.declined", "N " + by, by, "c_a", { why: "not for me" }, day);
    const checkin = (day: number, next: "round" | "decide" = "round") => ev("case.checkin", "T. Vogel", "u_tv", "c_a", { next, open: [], note: "" }, day);
    const base = [raised("c_a"), disc(["u_a", "u_b"])];
    const CHECK_IN = 3; // discussion started on day 0, a round is discuss_every_days (3) long
    const viewAt = (events: CaseEvent[], day: number) => dues(world(events, day), day).filter((d) => d.kind === "view");

    it("one view Due on the working day before the check-in day and on that day, never before and never after", () => {
      expect(viewAt(base, CHECK_IN - 2)).toEqual([]);
      expect(viewAt(base, CHECK_IN - 1)).toEqual([{ kind: "view", target: "c_a", dueDay: CHECK_IN, idemKey: `clk:view:c_a:${CHECK_IN}` }]);
      expect(viewAt(base, CHECK_IN)).toEqual(viewAt(base, CHECK_IN - 1));
      // The day after, the check-in reminder is what is left.
      expect(viewAt(base, CHECK_IN + 1)).toEqual([]);
      expect(kinds(dues(world(base, CHECK_IN + 1), CHECK_IN + 1))).toEqual(["checkin"]);
    });

    it("once per check-in day, however often the clock runs", () => {
      const done = [...base, fact("c_a", { kind: "view", dueDay: CHECK_IN }, CHECK_IN - 1)];
      expect(viewAt(done, CHECK_IN - 1)).toEqual([]);
      expect(viewAt(done, CHECK_IN)).toEqual([]);
    });

    it("nothing when every invitee commented in the round or declined; an invitee with no view keeps it", () => {
      expect(viewAt([...base, comment("u_a", 1), declined("u_b", 2)], CHECK_IN - 1)).toEqual([]);
      expect(viewAt([...base, comment("u_a", 1)], CHECK_IN - 1)).toHaveLength(1);
      expect(viewAt([raised("c_a"), disc([])], CHECK_IN - 1)).toEqual([]);
    });

    it("the next round asks again: a comment or a decline of an earlier round does not stand for the new one", () => {
      const round1 = [...base, comment("u_a", 1), declined("u_b", 2), checkin(CHECK_IN)];
      // Round 2 ends on day 6; nobody has said anything in it yet, though u_a spoke in round 1 ...
      expect(viewAt([...round1, fact("c_a", { kind: "view", dueDay: CHECK_IN }, 2)], 5)).toEqual([{ kind: "view", target: "c_a", dueDay: 6, idemKey: "clk:view:c_a:6" }]);
      // ... and u_b, who declined in round 1, is asked again once the desk invites them anew.
      const reinvited = [...round1, ev("case.invited", "T. Vogel", "u_tv", "c_a", { invited: ["N u_b"], invitedUserIds: ["u_b"] }, CHECK_IN), comment("u_a", 4)];
      expect(viewAt(reinvited, 5)).toHaveLength(1);
      expect(viewAt([...reinvited, comment("u_b", 5)], 5)).toEqual([]);
      // A decline after the new invitation does count.
      expect(viewAt([...reinvited, declined("u_b", 5)], 5)).toEqual([]);
    });

    it("none once the discussion is ready to decide, and none for a case that is not in a discussion", () => {
      expect(viewAt([...base, checkin(CHECK_IN - 1, "decide")], CHECK_IN)).toEqual([]);
      expect(dues(world([raised("c_a")], 3), 3).filter((d) => d.kind === "view")).toEqual([]);
    });
  });

  describe("late check-in", () => {
    const disc = ev("case.discussion", "T. Vogel", "u_tv", "c_a", { invited: [], invitedUserIds: [], missing: "x" }, 0);
    const base = [raised("c_a"), disc];
    const CHECK_IN = 3;
    const LATE = CHECK_IN + 3; // escalation_days defaults to 3
    const deadline = fact("c_a", { kind: "deadline", dueDay: CHECK_IN, toRoleHolderId: "seat_dep" }, LATE);
    const at = (events: CaseEvent[], day: number, patch?: (c: ReducedCase) => void) => dues(world(events, day, patch), day);

    it("escalation_days after the check-in day, exactly, the case is handled like a late answer: a deadline Due for that check-in day", () => {
      expect(kinds(at(base, CHECK_IN + 1))).toEqual(["checkin"]);
      expect(kinds(at(base, LATE - 1))).toEqual(["checkin"]);
      expect(at(base, LATE)).toEqual([
        { kind: "checkin", target: "c_a", dueDay: CHECK_IN, idemKey: `clk:checkin:c_a:${CHECK_IN}` },
        { kind: "deadline", target: "c_a", dueDay: CHECK_IN, toRoleHolderId: "seat_dep", idemKey: `clk:deadline:c_a:${CHECK_IN}` },
      ]);
    });

    it("then the deputy takes the case, and the seat above comes escalation_days after the check-in day", () => {
      const withFact = [...base, fact("c_a", { kind: "checkin", dueDay: CHECK_IN }), deadline];
      expect(at(withFact, LATE)).toEqual([{ kind: "handover", target: "c_a", dueDay: CHECK_IN, toRoleHolderId: "seat_dep", idemKey: "clk:handover:c_a" }]);
      const handed = [...withFact, ev("case.handed", "system:clock", null, "c_a", { to: "H. Sander", toRoleHolderId: "seat_dep", why: "deadline" }, LATE)];
      // The escalation counts from the check-in day, strictly after escalation_days (as for every late answer).
      expect(at(handed, LATE)).toEqual([]);
      expect(at(handed, LATE + 1)).toEqual([{ kind: "escalation", target: "c_a", dueDay: CHECK_IN, toRoleHolderId: "seat_head", idemKey: "clk:escalate:c_a" }]);
      // Without the deputy hand-over rule it goes straight to the seat above.
      const off = (c: ReducedCase) => void c;
      void off;
      const noHandover = reduce({ ...SEED, loop: { deadlineHandover: false } }, { events: [...withFact], day: LATE + 1 });
      noHandover.cases[0].history = withFact.filter((e) => e.target === "c_a");
      expect(kinds(dues(noHandover, LATE + 1))).toEqual(["escalation"]);
    });

    it("a check-in after the deadline fact, also on the same day, ends it: the new round's day is what is due", () => {
      const again = [...base, fact("c_a", { kind: "checkin", dueDay: CHECK_IN }), deadline, ev("case.checkin", "T. Vogel", "u_tv", "c_a", { next: "round", open: [], note: "" }, LATE)];
      expect(at(again, LATE)).toEqual([]);
      expect(at(again, LATE + 1)).toEqual([]);
    });

    it("escalation_days 0 switches it off, as it does for every second level", () => {
      const state = reduce({ ...SEED, loop: { escalationDays: 0 } }, { events: base, day: 50 });
      expect(kinds(dueNow(state, 50, above))).toEqual(["checkin"]);
    });
  });

  describe("a reopened case runs its clock again, once per cycle", () => {
    const DUE = PROMISE; // answer date of the first cycle
    const old = [
      raised("c_a"),
      fact("c_a", { kind: "deadline", dueDay: DUE, toRoleHolderId: "seat_dep" }, DUE + 1),
      ev("case.handed", "system:clock", null, "c_a", { to: "H. Sander", toRoleHolderId: "seat_dep", why: "deadline" }, DUE + 2),
      fact("c_a", { kind: "escalation", dueDay: DUE, toRoleHolderId: "seat_head" }, DUE + 5),
      ev("case.handed", "system:clock", null, "c_a", { to: "K. Head", toRoleHolderId: "seat_head", why: "escalation" }, DUE + 6),
      no("c_a", DUE + 7),
      ev("case.reopened", "system:clock", null, "c_a", { why: "revisit", dueDay: DUE + 30 }, DUE + 30),
    ];
    const REOPEN = old.length - 1;
    const NEW_DUE = DUE + 30 + PROMISE;
    let held = { seat: "seat_tv", role: "role_owner" };
    const reopened = (c: ReducedCase) => { c.reopens = [{ why: "revisit", day: DUE + 30, by: "system:clock" }]; c.reopenSeq = REOPEN; c.dueDay = NEW_DUE; c.status = "open"; c.open = true; c.decided = null; c.assigneeSeatId = held.seat; c.assigneeRoleId = held.role; };
    // (the reopen puts the case back on the route owner's desk, NOR-A1)
    const at = (events: CaseEvent[], day: number) => dues(world(events, day, reopened), day);

    it("the old cycle's facts and hand-overs do not stand for the new one, and the keys carry the cycle", () => {
      const day = NEW_DUE + 1;
      expect(at(old, day)).toEqual([{ kind: "deadline", target: "c_a", dueDay: NEW_DUE, toRoleHolderId: "seat_dep", idemKey: `clk:deadline:c_a:${NEW_DUE}` }]);
      const deadline = fact("c_a", { kind: "deadline", dueDay: NEW_DUE, toRoleHolderId: "seat_dep" }, day);
      expect(at([...old, deadline], day)).toEqual([{ kind: "handover", target: "c_a", dueDay: NEW_DUE, toRoleHolderId: "seat_dep", idemKey: "clk:handover:c_a:1" }]);
      const handed = ev("case.handed", "system:clock", null, "c_a", { to: "H. Sander", toRoleHolderId: "seat_dep", why: "deadline" }, day);
      const esc = NEW_DUE + 4;
      held = { seat: "seat_dep", role: "role_deputy" }; // the deputy has it now
      expect(at([...old, deadline, handed], esc)).toEqual([{ kind: "escalation", target: "c_a", dueDay: NEW_DUE, toRoleHolderId: "seat_head", idemKey: "clk:escalate:c_a:1" }]);
      const escFact = fact("c_a", { kind: "escalation", dueDay: NEW_DUE, toRoleHolderId: "seat_head" }, esc);
      expect(at([...old, deadline, handed, escFact], esc)).toEqual([{ kind: "handover", why: "escalation", target: "c_a", dueDay: NEW_DUE, toRoleHolderId: "seat_head", idemKey: "clk:escalate:c_a:handover:1" }]);
    });

    it("a fact of the old cycle written before the reopen on the same day is not this cycle's", () => {
      // The reopen came on the day of an old fact for the very same answer date: by event order the fact is older.
      held = { seat: "seat_tv", role: "role_owner" };
      const sameDay = [...old.slice(0, REOPEN), fact("c_a", { kind: "deadline", dueDay: NEW_DUE, toRoleHolderId: "seat_dep" }, DUE + 30), old[REOPEN]];
      const state = world(sameDay, NEW_DUE + 1, (c) => { reopened(c); c.reopenSeq = sameDay.length - 1; });
      expect(kinds(dues(state))).toEqual(["deadline"]);
    });

    it("cycle 0 keeps today's keys", () => {
      const state = world([raised("c_a"), fact("c_a", { kind: "deadline", dueDay: DUE, toRoleHolderId: "seat_dep" })], DUE + 1);
      expect(dues(state).map((d) => d.idemKey)).toEqual(["clk:handover:c_a"]);
    });
  });

  describe("the question returns after question_days", () => {
    const asked = ev("case.asked", "T. Vogel", "u_tv", "c_a", { text: "Which line?" }, 10);
    const log = [raised("c_a"), asked];
    const at = (day: number, questionDays?: number) =>
      dueNow(reduce({ ...SEED, ...(questionDays === undefined ? {} : { loop: { questionDays } }) }, { events: log, day }), day, above).filter((d) => d.kind === "question" || d.kind === "unanswered");

    it("the default is today's 3 and 5 working days", () => {
      expect(at(12)).toEqual([]);
      expect(at(13)).toEqual([{ kind: "question", target: "c_a", dueDay: 13, idemKey: "clk:question:c_a:10" }]);
      expect(at(14).map((d) => d.kind)).toEqual(["question"]);
      expect(at(15)).toEqual([{ kind: "unanswered", target: "c_a", dueDay: 15, idemKey: "clk:unanswered:c_a:10" }]);
    });

    it("question_days moves the return, and the reminder is one day before it when that is earlier than 3", () => {
      expect(at(11, 2)).toEqual([{ kind: "question", target: "c_a", dueDay: 11, idemKey: "clk:question:c_a:10" }]);
      expect(at(12, 2)).toEqual([{ kind: "unanswered", target: "c_a", dueDay: 12, idemKey: "clk:unanswered:c_a:10" }]);
      expect(at(13, 4).map((d) => [d.kind, d.dueDay])).toEqual([["question", 13]]);
      expect(at(14, 4).map((d) => [d.kind, d.dueDay])).toEqual([["unanswered", 14]]);
      expect(at(15, 10).map((d) => d.kind)).toEqual(["question"]);
      expect(at(20, 10).map((d) => [d.kind, d.dueDay])).toEqual([["unanswered", 20]]);
    });
  });

  it("demo mode gives nothing, whatever the state", () => {
    const demo: ReduceSeed = { ...SEED, clock: DEMO_CLOCK };
    const state = world([raised("c_a"), no()], 99, decidedNo(1, decision(), (c) => { c.appeal = { text: "x".repeat(30), day: 10, by: "C. Ilg", byUserId: "u_ci", seatId: "seat_dep", decided: null }; }), demo);
    expect(dues(state)).toEqual([]);
    const talk = world([raised("c_a"), ev("case.discussion", "T. Vogel", "u_tv", "c_a", { invited: ["N"], invitedUserIds: ["u_a"], missing: "x" })], 2, undefined, demo);
    expect(dues(talk, 2)).toEqual([]);
  });
});
