import { describe, expect, it } from "vitest";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import { reduce } from "@/features/cases/reducer";
import { SEED } from "@/features/demo/seed";

const state = reduce(SEED, { day: 0, events: [] });
const open = state.cases.find((c) => c.open)!;
const holder = open.assignee;
const idea = state.ideas[0];

const member: Actor = { role: "member", name: "J. Schmidt", handle: "Anonymous #1" };
const leader = (name: string): Actor => ({ role: "leader", name, handle: null });
const manager: Actor = { role: "manager", name: "B. Hartmann", handle: null };
const ev = (type: string, target: string | null, payload: { by?: unknown } = {}) => ({ type, target, payload });

describe("mayAppend", () => {
  it("lets anyone raise a new case, but never re-raise an existing one", () => {
    expect(mayAppend(member, ev("case.raised", "c_new"), state).ok).toBe(true);
    expect(mayAppend(manager, ev("case.raised", open.id), state).ok).toBe(false);
    expect(mayAppend(member, ev("case.raised", idea.id), state).ok).toBe(false);
  });

  it("keeps deciding, handing and asking with the person the case sits with", () => {
    for (const type of ["case.decided", "case.handed", "case.asked", "case.read"]) {
      expect(mayAppend(leader(holder), ev(type, open.id), state).ok).toBe(true);
      expect(mayAppend(member, ev(type, open.id), state).ok).toBe(false);
      expect(mayAppend(leader("Somebody Else"), ev(type, open.id), state).ok).toBe(false);
      expect(mayAppend(manager, ev(type, open.id), state).ok).toBe(true);
    }
  });

  it("lets only the raiser answer a question", () => {
    expect(mayAppend({ role: "member", name: "x", handle: open.from }, ev("case.answered", open.id), state).ok).toBe(true);
    expect(mayAppend(leader("Somebody Else"), ev("case.answered", open.id), state).ok).toBe(false);
  });

  it("keeps re-routing with managers and approving ideas away from members", () => {
    expect(mayAppend(leader(holder), ev("case.override", open.id), state).ok).toBe(false);
    expect(mayAppend(manager, ev("case.override", open.id), state).ok).toBe(true);
    expect(mayAppend(member, ev("idea.funded", idea.id), state).ok).toBe(false);
    expect(mayAppend(leader("T. Vogel"), ev("idea.approved", idea.id), state).ok).toBe(true);
  });

  it("allows comments and co-signs on things that exist, and nothing on things that do not", () => {
    expect(mayAppend(member, ev("case.commented", open.id), state).ok).toBe(true);
    expect(mayAppend(member, ev("idea.cosigned", idea.id), state).ok).toBe(true);
    expect(mayAppend(member, ev("case.commented", "nope"), state).ok).toBe(false);
    expect(mayAppend(manager, ev("case.decided", "nope"), state).ok).toBe(false);
  });

  it("moves the demo clock for managers only, 1 to 30 days", () => {
    expect(mayAppend(manager, ev("day.advanced", null, { by: 1 }), state).ok).toBe(true);
    expect(mayAppend(manager, ev("day.advanced", null), state).ok).toBe(true);
    expect(mayAppend(leader(holder), ev("day.advanced", null, { by: 1 }), state).ok).toBe(false);
    for (const by of [0, -5, 31, 1.5, "2"]) expect(mayAppend(manager, ev("day.advanced", null, { by }), state).ok).toBe(false);
  });
});
