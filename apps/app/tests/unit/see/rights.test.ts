// SEE-B1: who may merge a duplicate and link related cases, and what a merged case refuses (plan SEE, D17, D23). States are cases from a
// raise, reduced (the reducer of SEE-G1 applies a merge and a link), then given an escalation by hand.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { mayAppend, needsCaseAccess, type Actor } from "@/features/cases/permissions";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";

const seats: SeatRow[] = [
  { id: "s_own1", roleId: "role_owner", label: "Owner One", userId: "u_o1", sort: 0 },
  { id: "s_own2", roleId: "role_owner", label: "Owner Two", userId: "u_o2", sort: 1 },
  { id: "s_up", roleId: "role_up", label: "Above", userId: "u_up", sort: 2 },
  { id: "s_other", roleId: "role_other", label: "Other", userId: "u_other", sort: 3 },
  { id: "s_raiser", roleId: "role_member", label: "Raiser", userId: "u_raiser", sort: 4 },
];
const routes = LOCAL_SEED.routes.map((r) => (r.id === "r2" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_own1", deputyRoleId: null, deputySeatId: null } : r));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, clock: { mode: "workdays", calendar: DEFAULT_CALENDAR } };
const TODAY = 400;

let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string, payload: EventPayload = {}, day = TODAY): CaseEvent =>
  ({ id: "sr" + n++, ts: 0, day, type, actor, actorUserId, target, payload });
const raise = (id: string, who = "u_raiser") => ev("case.raised", "Raiser", who, id, { kind: "idea", title: `Idea ${id}`, routeId: "r2", assignee: "Owner One", assigneeRoleHolderId: "s_own1" }, TODAY - 5);
const state = (...events: CaseEvent[]): State => reduce(SEED, { events: [raise("c_a"), raise("c_b"), raise("c_c", "u_other"), ...events], day: TODAY });

const person = (userId: string, role: Actor["role"] = "leader"): Actor => ({ role, name: userId, handle: null, userId, me: meFor(userId, seats) });
const owner = person("u_o1");
const colleague = person("u_o2"); // the same desk, another seat
const above = person("u_up");
const raiser = person("u_raiser", "member");
const member = person("u_m", "member");
const outsider = person("u_other");
const manager = person("u_mgr", "manager");

const ask = (who: Actor, type: string, payload: EventPayload, s: State, target = "c_a") => mayAppend(who, { type, target, payload }, s);
const merge = (who: Actor, s: State, into = "c_b", target = "c_a") => ask(who, "case.merged", { into }, s, target).ok;
const link = (who: Actor, s: State, to = "c_b", target = "c_a") => ask(who, "case.linked", { to }, s, target).ok;
const errorOf = (who: Actor, type: string, payload: EventPayload, s: State, target = "c_a"): string => {
  const v = ask(who, type, payload, s, target);
  return v.ok ? "" : v.error;
};

describe("SEE rights", () => {
  it("accepts a merge and a link from a holder of the case's desk, of its escalated role, and from a manager", () => {
    const s = state();
    for (const who of [owner, colleague, manager]) {
      expect(merge(who, s), `merge ${who.name}`).toBe(true);
      expect(link(who, s), `link ${who.name}`).toBe(true);
    }
    // The escalated role: the seat above holds the case after the clock passed it up.
    const up = state();
    up.cases.find((c) => c.id === "c_a")!.escalated = { to: "Above", from: "Owner One", day: TODAY, live: true, toSeatId: "s_up", toRoleId: "role_up" };
    expect(merge(above, up)).toBe(true);
    expect(link(above, up)).toBe(true);
    expect(merge(above, s)).toBe(false);
  });

  it("refuses the raiser, another member and a leader of another desk", () => {
    const s = state();
    for (const who of [raiser, member, outsider]) {
      expect(merge(who, s), who.name).toBe(false);
      expect(link(who, s), who.name).toBe(false);
    }
    expect(errorOf(raiser, "case.merged", { into: "c_b" }, s)).toBe("Only the person this case sits with can do that.");
    // A case nobody knows is no case.
    expect(errorOf(owner, "case.merged", { into: "c_b" }, s, "c_nope")).toBe("No such case.");
  });

  it("refuses a merge of a decided, withdrawn or merged case, and lets an asked one and one in discussion go", () => {
    const decided = state(ev("case.decided", "Owner One", "u_o1", "c_a", { answer: "no" }));
    const withdrawn = state(ev("case.withdrawn", "Raiser", "u_raiser", "c_a", {}));
    const merged = state(ev("case.merged", "Owner One", "u_o1", "c_a", { into: "c_c" }));
    for (const [name, s] of [["decided", decided], ["withdrawn", withdrawn], ["merged", merged]] as const) expect(merge(manager, s), name).toBe(false);
    expect(merge(owner, state(ev("case.asked", "Owner One", "u_o1", "c_a", { text: "Which line?" })))).toBe(true);
    expect(merge(owner, state(ev("case.discussion", "Owner One", "u_o1", "c_a", { invited: ["x"], invitedUserIds: ["u_x"], missing: "?" })))).toBe(true);
  });

  it("refuses a merge into the case itself, an unknown case, a merged or withdrawn case, and one that absorbed repeats", () => {
    const s = state();
    expect(merge(owner, s, "c_a")).toBe(false);
    expect(merge(owner, s, "c_unknown")).toBe(false);
    expect(errorOf(owner, "case.merged", { into: "c_unknown" }, s)).toBe(errorOf(owner, "case.merged", { into: "c_a" }, s)); // the same answer for every case it cannot take
    expect(merge(owner, state(ev("case.merged", "Owner One", "u_o1", "c_b", { into: "c_c" })))).toBe(false); // into a merged case
    expect(merge(owner, state(ev("case.withdrawn", "Raiser", "u_raiser", "c_b", {})))).toBe(false);
    // c_c merged into c_a: c_a absorbed it and stays; it cannot be merged away itself, and c_c cannot take it back (no cycle).
    const absorbed = state(ev("case.merged", "Owner One", "u_o1", "c_c", { into: "c_a" }));
    expect(merge(manager, absorbed, "c_b", "c_a")).toBe(false);
    expect(merge(manager, absorbed, "c_c", "c_a")).toBe(false);
    expect(merge(manager, absorbed, "c_a", "c_c")).toBe(false);
    expect(merge(manager, absorbed, "c_a", "c_b")).toBe(true);
  });

  it("refuses a second link, a link to itself, to an unknown or a merged case, and from a withdrawn or merged one", () => {
    const linked = state(ev("case.linked", "Owner One", "u_o1", "c_a", { to: "c_b" }));
    expect(linked.cases.find((c) => c.id === "c_a")?.links).toEqual(["c_b"]);
    expect(link(owner, linked)).toBe(false); // the second one
    expect(link(owner, linked, "c_a", "c_b")).toBe(false); // the other direction: both pages show it
    expect(errorOf(owner, "case.linked", { to: "c_b" }, linked)).toContain("cannot be linked");
    const s = state();
    expect(link(owner, s, "c_a")).toBe(false);
    expect(link(owner, s, "c_unknown")).toBe(false);
    expect(link(owner, state(ev("case.merged", "Owner One", "u_o1", "c_b", { into: "c_c" })))).toBe(false);
    expect(link(owner, state(ev("case.withdrawn", "Raiser", "u_raiser", "c_a", {})))).toBe(false);
    expect(link(owner, state(ev("case.merged", "Owner One", "u_o1", "c_a", { into: "c_c" })))).toBe(false);
    // A decided case may be linked, and may be the one linked to.
    expect(link(owner, state(ev("case.decided", "Owner One", "u_o1", "c_a", { answer: "yes" })))).toBe(true);
    expect(link(owner, state(ev("case.decided", "Owner One", "u_o1", "c_b", { answer: "no" })))).toBe(true);
  });

  it("needs the note of a merge to be text", () => {
    const s = state();
    expect(ask(owner, "case.merged", { into: "c_b", note: "The same line, raised twice" }, s).ok).toBe(true);
    expect(ask(owner, "case.merged", { into: "c_b", note: 5 as never }, s).ok).toBe(false);
  });

  it("refuses every other person's case event on a merged case, as a closed case does not move", () => {
    const merged = state(ev("case.merged", "Owner One", "u_o1", "c_a", { into: "c_b" }));
    expect(merged.cases.find((c) => c.id === "c_a")?.status).toBe("merged");
    const attempts: [string, EventPayload][] = [
      ["case.read", {}], ["case.decided", { answer: "no", category: "no-fit", reason: "x".repeat(60) }], ["case.decided", { answer: "yes" }],
      ["case.handed", { to: "Other", toRoleHolderId: "s_other", why: "It is the other desk's area" }], ["case.asked", { text: "Which line?" }],
      ["case.answered", { text: "Line 3" }], ["case.discussion", { invited: ["x"], invitedUserIds: ["u_x"], missing: "?" }], ["case.revised", { body: "A better version" }],
      ["case.override", { chosen: "r3" }], ["case.commented", { text: "One more thought" }], ["case.affected", {}], ["case.withdrawn", {}],
      ["case.merged", { into: "c_c" }], ["case.linked", { to: "c_c" }], ["case.appealed", { text: "x".repeat(30) }],
    ];
    for (const who of [owner, manager, raiser, outsider]) {
      for (const [type, payload] of attempts) {
        const verdict = ask(who, type, payload, merged);
        expect(verdict, `${who.name} ${type}`).toMatchObject({ ok: false });
        if (!verdict.ok) expect(verdict.error, `${who.name} ${type}`).toBe("This case was merged into another one: nothing can be added to it.");
      }
    }
    // Another case is untouched, and so is the case it was merged into.
    expect(ask(owner, "case.asked", { text: "Which line?" }, merged, "c_b").ok).toBe(true);
    expect(ask(manager, "case.linked", { to: "c_c" }, merged, "c_b").ok).toBe(true);
    // ... which absorbed the repeat and so stays: it is not merged away itself.
    expect(ask(manager, "case.merged", { into: "c_c" }, merged, "c_b").ok).toBe(false);
    // A raise on the same id is still refused as a duplicate raise, not as a merged case.
    expect(errorOf(raiser, "case.raised", {}, merged)).toBe("That case already exists.");
  });

  it("a merge and a link need the second case's access from the server, so both are on the list of events that load it", () => {
    expect(needsCaseAccess("case.merged")).toBe(true);
    expect(needsCaseAccess("case.linked")).toBe(true);
    expect(needsCaseAccess("case.commented")).toBe(true);
    expect(needsCaseAccess("case.handed")).toBe(false);
  });
});
