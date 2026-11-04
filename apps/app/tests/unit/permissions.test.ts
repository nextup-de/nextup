import { describe, expect, it } from "vitest";
import { mayAppend, type Actor } from "@/features/cases/permissions";
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
