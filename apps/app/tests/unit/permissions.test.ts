import { describe, expect, it } from "vitest";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import { appendEvent } from "@/features/cases/events";
import { handPayload } from "@/features/cases/hand";
import { reduce } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { meOfSeat, NOBODY } from "@/features/auth/identity";

const state = reduce(LOCAL_SEED, { day: 0, events: [] });
const open = state.cases.find((c) => c.open && c.fromUserId !== null && c.assigneeSeatId !== null)!;
const holderMe = meOfSeat(open.assigneeSeatId!, state.seats);
const idea = state.ideas[0];

const member: Actor = { role: "member", name: "J. Schmidt", handle: "Anonymous #1" };
const leader = (name: string, me = NOBODY): Actor => ({ role: "leader", name, handle: null, userId: me.userId, me });
const manager: Actor = { role: "manager", name: "B. Hartmann", handle: null };
const ev = (type: string, target: string | null, payload: Record<string, unknown> = {}) => ({ type, target, payload });

describe("mayAppend", () => {
  it("lets anyone raise a new case, but never re-raise an existing one", () => {
    expect(mayAppend(member, ev("case.raised", "c_new"), state).ok).toBe(true);
    expect(mayAppend(manager, ev("case.raised", open.id), state).ok).toBe(false);
    expect(mayAppend(member, ev("case.raised", idea.id), state).ok).toBe(false);
  });

  it("keeps deciding, handing and asking with the person the case sits with", () => {
    for (const type of ["case.decided", "case.handed", "case.asked", "case.read"]) {
      const payload = type === "case.handed" ? { toRoleHolderId: state.seats[0].id } : {};
      expect(mayAppend(leader("Holder", holderMe), ev(type, open.id, payload), state).ok).toBe(true);
      expect(mayAppend(member, ev(type, open.id, payload), state).ok).toBe(false);
      expect(mayAppend(leader("Somebody Else"), ev(type, open.id, payload), state).ok).toBe(false);
      expect(mayAppend(manager, ev(type, open.id, payload), state).ok).toBe(true);
    }
  });

  it("allows one decision per case: a second one, or a question after it, is refused for the holder and a manager (K3, TMS-L1)", () => {
    const holder = leader("Holder", holderMe);
    const decided = reduce(LOCAL_SEED, appendEvent({ day: 0, events: [] }, {
      type: "case.decided", actor: "Holder", actorUserId: holderMe.userId, target: open.id, payload: { answer: "no", reason: "wrong department" },
    }));
    expect(decided.cases.find((c) => c.id === open.id)?.decided?.reason).toBe("wrong department");
    for (const who of [holder, manager]) {
      expect(mayAppend(who, ev("case.decided", open.id, { answer: "no", reason: "another reason" }), decided)).toEqual({ ok: false, error: "This case is already decided." });
      expect(mayAppend(who, ev("case.decided", open.id, { answer: "yes" }), decided).ok).toBe(false);
      expect(mayAppend(who, ev("case.asked", open.id, { text: "Why?" }), decided).ok).toBe(false);
      expect(mayAppend(who, ev("case.read", open.id), decided).ok).toBe(true);
    }
    expect(mayAppend(holder, ev("case.decided", open.id, { answer: "no", reason: "x" }), decided, "de")).toEqual({ ok: false, error: "Dieser Fall ist bereits entschieden." });
  });

  it("refuses a hand-over that borrows the clock's reason, from the desk holder and from a manager (FX8)", () => {
    const to = { toRoleHolderId: state.seats[0].id };
    for (const why of ["deadline", "escalation"]) {
      const holder = mayAppend(leader("Holder", holderMe), ev("case.handed", open.id, { ...to, why }), state);
      expect(holder).toEqual({ ok: false, error: "The system sets this reason when a deadline passes. Write the reason in your own words." });
      expect(mayAppend(manager, ev("case.handed", open.id, { ...to, why }), state).ok).toBe(false);
    }
    expect(mayAppend(leader("Holder", holderMe), ev("case.handed", open.id, { ...to, why: "deadline" }), state, "de")).toMatchObject({ ok: false, error: expect.stringContaining("Frist") });
    // A reason in the person's own words is theirs to give, also when it mentions the deadline.
    expect(mayAppend(leader("Holder", holderMe), ev("case.handed", open.id, { ...to, why: "The deadline is close and I am away" }), state).ok).toBe(true);
    expect(mayAppend(leader("Holder", holderMe), ev("case.handed", open.id, to), state).ok).toBe(true);
  });

  it("Q4.21 pass refused while a question is open", () => {
    const holder = leader("Holder", holderMe);
    const pass = handPayload(state.seats, state.seats[0].id, "Belongs to purchasing");
    const asked = appendEvent({ day: 0, events: [] }, {
      type: "case.asked", actor: "Holder", actorUserId: holderMe.userId, target: open.id, payload: { text: "Which machine?" },
    });
    const waiting = reduce(LOCAL_SEED, asked);
    expect(waiting.cases.find((c) => c.id === open.id)?.status).toBe("asked");
    for (const who of [holder, manager]) {
      expect(mayAppend(who, ev("case.handed", open.id, pass), waiting)).toEqual({ ok: false, error: "A question on this case is still open. Pass it on once it is answered." });
    }
    expect(mayAppend(holder, ev("case.handed", open.id, pass), waiting, "de")).toMatchObject({ ok: false, error: expect.stringContaining("Frage") });
    // The reducer would have dropped it: a pass accepted here used to change nothing.
    const dropped = reduce(LOCAL_SEED, appendEvent(asked, { type: "case.handed", actor: "Holder", actorUserId: holderMe.userId, target: open.id, payload: pass }));
    expect(dropped.cases.find((c) => c.id === open.id)?.handed).toEqual([]);
    // Once the raiser answers, the case is open again and the pass goes through.
    const answered = reduce(LOCAL_SEED, appendEvent(asked, { type: "case.answered", actor: open.from, actorUserId: open.fromUserId, target: open.id, payload: { text: "Line 3" } }));
    expect(mayAppend(holder, ev("case.handed", open.id, pass), answered).ok).toBe(true);
    // A decided case does not move either.
    const decided = reduce(LOCAL_SEED, appendEvent({ day: 0, events: [] }, { type: "case.decided", actor: "Holder", actorUserId: holderMe.userId, target: open.id, payload: { answer: "yes" } }));
    expect(mayAppend(manager, ev("case.handed", open.id, pass), decided)).toEqual({ ok: false, error: "Only an open case can be passed on." });
  });

  it("lets only the raiser answer a question", () => {
    expect(mayAppend({ role: "member", name: "x", handle: open.from, userId: open.fromUserId, me: { ...NOBODY, userId: open.fromUserId } }, ev("case.answered", open.id), state).ok).toBe(true);
    expect(mayAppend(leader("Somebody Else"), ev("case.answered", open.id), state).ok).toBe(false);
  });

  it("keeps re-routing with managers and approving ideas away from members", () => {
    expect(mayAppend(leader("Holder", holderMe), ev("case.override", open.id), state).ok).toBe(false);
    expect(mayAppend(manager, ev("case.override", open.id), state).ok).toBe(true);
    expect(mayAppend(member, ev("idea.funded", idea.id), state).ok).toBe(false);
    expect(mayAppend(leader("T. Vogel"), ev("idea.approved", idea.id), state).ok).toBe(true);
  });

  it("allows comments and co-signs on things that exist, and nothing on things that do not", () => {
    // FX4: commenting takes being able to open the case, which the manager can; a member with no seat here cannot.
    expect(mayAppend(manager, ev("case.commented", open.id), state).ok).toBe(true);
    expect(mayAppend(member, ev("case.commented", open.id), state).ok).toBe(false);
    expect(mayAppend(member, ev("idea.cosigned", idea.id), state).ok).toBe(true);
    expect(mayAppend(member, ev("case.commented", "nope"), state).ok).toBe(false);
    expect(mayAppend(manager, ev("case.decided", "nope"), state).ok).toBe(false);
  });

  it("moves the demo clock for managers only, 1 to 30 days", () => {
    expect(mayAppend(manager, ev("day.advanced", null, { by: 1 }), state).ok).toBe(true);
    expect(mayAppend(manager, ev("day.advanced", null), state).ok).toBe(true);
    expect(mayAppend(leader("Holder", holderMe), ev("day.advanced", null, { by: 1 }), state).ok).toBe(false);
    for (const by of [0, -5, 31, 1.5, "2"]) expect(mayAppend(manager, ev("day.advanced", null, { by }), state).ok).toBe(false);
  });
});
