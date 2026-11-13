// SET-D1: the clock of the project draft (D11, D12, D15). Pure: state and today in, facts out. Projects are built from the
// SET-G1 types directly, so this does not wait for the reducer.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import { DEFAULT_CALENDAR, DEMO_CLOCK, type ClockSpec } from "@/features/clock";
import { dueNow, DRAFT_UP_DAYS, INVITE_LAPSE_DAYS, INVITE_REMIND_DAYS, LEAD_REMIND_DAYS, LEAD_RETURN_DAYS, type Due, type SeatAbove } from "@/features/clock/due";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import type { Invite, ReducedProject } from "@/features/projects/types";

const WORKDAYS: ClockSpec = { mode: "workdays", calendar: DEFAULT_CALENDAR };
const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_lb", roleId: "role_lead", label: "L. Brandt", userId: "u_lb", sort: 1 },
  { id: "seat_hs", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 2 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner", deputySeatId: "seat_hs", deputyRoleId: "role_deputy" } : x));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, clock: WORKDAYS };
// The seat above the lead's role is the owner's; nobody is above the owner.
const above: SeatAbove = (roleId) => (roleId === "role_lead" ? "seat_tv" : null);

const USERS: Record<string, string> = { "T. Vogel": "u_tv", "L. Brandt": "u_lb", "H. Sander": "u_hs", "J. Schmidt": "u_js" };
let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "d" + n++, ts: 0, type, actor, actorUserId: USERS[actor] ?? null, target, payload, day });
const raised = ev("case.raised", "J. Schmidt", "c_a", { kind: "idea", title: "Idea", routeId: "r1", assignee: "T. Vogel" });
const yesPayload: EventPayload = { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "P" };
// T. Vogel decides and asks L. Brandt to lead: the real reducer opens a draft with a pending lead.
const yes = ev("case.decided", "T. Vogel", "c_a", { ...yesPayload, draft: true });
const legacyYes = ev("case.decided", "T. Vogel", "c_a", yesPayload);
const fact = (payload: EventPayload) => ev("clock.due", "system:clock", "p_one", payload);
const invite = (id: string, userId: string, role: Invite["role"], day: number, state: Invite["state"] = "pending"): Invite => ({ id, userId, role, state, day, reason: "" });

/** The real reducer's project from the yes (a draft, or a legacy one), then the values a test needs set on it; `extra` is appended to its history. */
function stateWith(patch: Partial<ReducedProject>, extra: CaseEvent[] = [], legacy = false): State {
  const s = reduce(SEED, { events: [raised, legacy ? legacyYes : yes], day: 0 });
  const p = s.projects[0];
  Object.assign(p, patch);
  p.history.push(...extra);
  return s;
}
/** A draft whose lead has taken it and whose start day is far off, so a test sees only the work it is about. */
const draft = (patch: Partial<ReducedProject> = {}, extra: CaseEvent[] = []): State => stateWith({ leadState: "taken", leadAskedDay: null, startDay: 100, ...patch }, extra);
const pending = { leadState: "pending", leadAskedDay: 10, leadUserId: "u_lb", startDay: null } as const;
const scope = (xs: Due[]) => xs.map(({ kind, dueDay, check, lapse, userId, inviteId, toRoleHolderId }) => ({ kind, dueDay, ...(check === undefined ? {} : { check }), ...(lapse ? { lapse } : {}), ...(userId ? { userId } : {}), ...(inviteId ? { inviteId } : {}), ...(toRoleHolderId ? { toRoleHolderId } : {}) }));

describe("SET clock", () => {
  it("a pending lead is reminded after 2 working days and returned after 4, each once", () => {
    const s = draft(pending);
    expect(dueNow(s, 11, above)).toEqual([]);
    const remind = dueNow(s, 10 + LEAD_REMIND_DAYS, above);
    expect(scope(remind)).toEqual([{ kind: "lead", dueDay: 12, userId: "u_lb" }]);
    expect(remind[0]).toMatchObject({ target: "p_one", askId: yes.id });
    // the reminder is stored: nothing more until the return
    const stored = draft(pending, [fact({ kind: "lead", dueDay: 12, askId: yes.id, userId: "u_lb" })]);
    expect(dueNow(stored, 13, above)).toEqual([]);
    const back = dueNow(stored, 10 + LEAD_RETURN_DAYS, above);
    expect(scope(back)).toEqual([{ kind: "lead", dueDay: 14, lapse: true, userId: "u_lb" }]);
    // a late run (the clock was down) gives the return only, not a stale reminder first
    expect(scope(dueNow(s, 20, above))).toEqual([{ kind: "lead", dueDay: 14, lapse: true, userId: "u_lb" }]);
  });

  it("the lead's reminder and return are the draft's only lead work: not on a taken lead, not on a started draft", () => {
    expect(dueNow(draft({ leadState: "taken", leadAskedDay: 10 }), 30, above)).toEqual([]);
    expect(dueNow(draft({ ...pending, status: "running" }), 30, above)).toEqual([]);
    expect(dueNow(draft({ ...pending, status: "stopped" }), 30, above)).toEqual([]);
  });

  it("a hand-over starts a new ask: the old facts neither stop the new reminder nor bring its return forward", () => {
    const handed = ev("project.handed", "T. Vogel", "p_one", { to: "H. Sander", toUserId: "u_hs" });
    const old = fact({ kind: "lead", dueDay: 12, askId: yes.id, userId: "u_lb" });
    const s = draft({ leadState: "pending", leadAskedDay: 20, leadUserId: "u_hs" }, [old, handed]);
    expect(dueNow(s, 21, above)).toEqual([]); // the old ask's return day (14) has long gone; the new ask's is 24
    expect(dueNow(s, 23, above).map((d) => [d.kind, d.dueDay, d.lapse, d.askId, d.userId])).toEqual([["lead", 22, undefined, handed.id, "u_hs"]]);
    expect(dueNow(s, 24, above).map((d) => [d.kind, d.dueDay, d.lapse])).toEqual([["lead", 24, true]]);
    // asked again on the same day number: the key still names the new ask
    const away = ev("project.handed", "T. Vogel", "p_one", { to: "H. Sander", toUserId: "u_hs" });
    const back = ev("project.handed", "T. Vogel", "p_one", { to: "L. Brandt", toUserId: "u_lb" });
    const again = draft({ ...pending, leadAskedDay: 10 }, [old, away, back]);
    expect(dueNow(again, 12, above).map((d) => d.askId)).toEqual([back.id]);
    expect(dueNow(again, 12, above)[0].idemKey).not.toBe(dueNow(draft(pending), 12, above)[0].idemKey);
    // a hand-over to the lead who already has it asks nobody again: the ask stays the yes
    const same = draft(pending, [ev("project.handed", "T. Vogel", "p_one", { to: "L. Brandt", toUserId: "u_lb" })]);
    expect(dueNow(same, 12, above).map((d) => d.askId)).toEqual([yes.id]);
  });

  it("an invitation is reminded at 2 and lapses at 5; a follower and an answered one never", () => {
    const i = invite("i1", "u_hs", "contributor", 10);
    const s = draft({ invites: [i, invite("i2", "u_tv", "follower", 10, "accepted"), invite("i3", "u_tv", "member", 10, "declined")] });
    expect(dueNow(s, 11, above)).toEqual([]);
    expect(scope(dueNow(s, 10 + INVITE_REMIND_DAYS, above))).toEqual([{ kind: "invite", dueDay: 12, userId: "u_hs", inviteId: "i1" }]);
    const stored = draft({ invites: [i] }, [fact({ kind: "invite", dueDay: 12, inviteId: "i1", userId: "u_hs" })]);
    expect(dueNow(stored, 14, above)).toEqual([]);
    expect(scope(dueNow(stored, 10 + INVITE_LAPSE_DAYS, above))).toEqual([{ kind: "invite", dueDay: 15, lapse: true, userId: "u_hs", inviteId: "i1" }]);
  });

  it("a person invited twice, as another role, has one deadline per invitation", () => {
    const a = invite("i1", "u_hs", "member", 10);
    const b = invite("i2", "u_hs", "sponsor", 11);
    const s = draft({ invites: [a, b] }, [fact({ kind: "invite", dueDay: 12, inviteId: "i1", userId: "u_hs" })]);
    // day 13: the first is reminded already, the second is reminded now
    expect(dueNow(s, 13, above).map((d) => [d.inviteId, d.dueDay, d.lapse])).toEqual([["i2", 13, undefined]]);
    // day 15: only the first lapses; the second is still within its time (lapse at 16)
    const at15 = dueNow(s, 15, above);
    expect(at15.filter((d) => d.lapse).map((d) => d.inviteId)).toEqual(["i1"]);
    expect(at15.find((d) => d.lapse)?.idemKey).not.toBe(dueNow(s, 16, above).find((d) => d.lapse && d.inviteId === "i2")?.idemKey);
  });

  it("a re-invitation after a decline or lapse gets fresh reminders, whatever facts the first one left", () => {
    const first = invite("i1", "u_hs", "contributor", 10, "lapsed");
    const again = invite("i9", "u_hs", "contributor", 20);
    const old = fact({ kind: "invite", dueDay: 12, inviteId: "i1", userId: "u_hs" });
    const s = draft({ invites: [first, again] }, [old]);
    expect(dueNow(s, 21, above)).toEqual([]);
    expect(dueNow(s, 22, above).map((d) => [d.inviteId, d.dueDay])).toEqual([["i9", 22]]);
    expect(dueNow(s, 25, above).map((d) => [d.inviteId, d.dueDay, d.lapse])).toEqual([["i9", 25, true]]);
  });

  it("a started draft keeps its invitation clock but gets no lead or start work; a stopped or recognised one nothing", () => {
    const base = { invites: [invite("i1", "u_hs", "sponsor", 10)], leadState: "pending" as const, leadAskedDay: 1, startDay: 5 };
    const running = draft({ ...base, status: "running" });
    expect(dueNow(running, 12, above).map((d) => [d.kind, d.inviteId])).toEqual([["invite", "i1"]]);
    expect(dueNow(running, 15, above).map((d) => [d.kind, d.lapse])).toEqual([["invite", true]]);
    expect(dueNow(draft({ ...base, status: "measuring" }), 15, above)).toHaveLength(1);
    expect(dueNow(draft({ ...base, status: "stopped" }), 15, above)).toEqual([]);
    expect(dueNow(draft({ ...base, status: "recognised" }), 15, above)).toEqual([]);
  });

  it("on the start day the seat above the lead's seat is told; DRAFT_UP_DAYS later once more; nothing stops", () => {
    const s = draft({ leadState: "taken", startDay: 20 });
    expect(dueNow(s, 19, above)).toEqual([]);
    expect(scope(dueNow(s, 20, above))).toEqual([{ kind: "draft", dueDay: 20, toRoleHolderId: "seat_tv" }]);
    const first = fact({ kind: "draft", dueDay: 20, toRoleHolderId: "seat_tv" });
    const stored = draft({ leadState: "taken", startDay: 20 }, [first]);
    expect(dueNow(stored, 22, above)).toEqual([]);
    expect(scope(dueNow(stored, 20 + DRAFT_UP_DAYS, above))).toEqual([{ kind: "draft", dueDay: 23, check: DRAFT_UP_DAYS, toRoleHolderId: "seat_tv" }]);
    const both = draft({ leadState: "taken", startDay: 20 }, [first, fact({ kind: "draft", dueDay: 23, check: 3, toRoleHolderId: "seat_tv" })]);
    expect(dueNow(both, 60, above)).toEqual([]); // once each, and no third
    // a late run writes both at once, each with its own key
    const keys = dueNow(s, 30, above).map((d) => d.idemKey);
    expect(new Set(keys).size).toBe(2);
    // nobody above: the fact still goes out, to nobody
    expect(dueNow(s, 20, () => null).map((d) => d.toRoleHolderId)).toEqual([null]);
  });

  it("there is no start day before the lead takes it, and no `start` fact for a draft", () => {
    expect(dueNow(draft({ ...pending, startDay: null, dueDay: 12 }), 12, above).map((d) => d.kind)).toEqual(["lead"]);
    expect(dueNow(draft({ leadState: "taken", startDay: 20, dueDay: 20 }), 25, above).map((d) => d.kind)).toEqual(["draft", "draft"]);
  });

  it("a moved start is a new deadline: the old facts do not stop it, and it is not escalated early", () => {
    const taken = ev("project.lead.answered", "L. Brandt", "p_one", { take: true, askId: yes.id });
    const moved = ev("project.start.moved", "T. Vogel", "p_one", { dueDay: 30, why: "Waiting for the part" });
    const old = [fact({ kind: "draft", dueDay: 20, toRoleHolderId: "seat_tv" }), fact({ kind: "draft", dueDay: 23, check: 3, toRoleHolderId: "seat_tv" })];
    const s = draft({ startDay: 30 }, [taken, ...old, moved]);
    expect(dueNow(s, 29, above)).toEqual([]);
    expect(dueNow(s, 30, above).map((d) => [d.kind, d.dueDay, d.check])).toEqual([["draft", 30, undefined]]);
    expect(dueNow(s, 33, above).map((d) => [d.dueDay, d.check])).toEqual([[30, undefined], [33, 3]]);
    // moved to a day that already carries a fact of the earlier cycle: it still fires, under a key of its own
    const same = draft({ startDay: 20 }, [taken, ...old, moved]);
    const firstTime = dueNow(draft({ startDay: 20 }, [taken]), 20, above)[0];
    const again = dueNow(same, 20, above)[0];
    expect(again).toBeDefined();
    expect(again.idemKey).not.toBe(firstTime.idemKey);
  });

  it("nothing for a legacy project: its start fact stays as today; and nothing at all in demo mode", () => {
    const legacy = stateWith({ dueDay: 12 }, [], true); // draft: false, from a yes without draft
    expect(legacy.projects[0].draft).toBe(false);
    expect(dueNow(legacy, 30, above).map((d) => d.kind)).toEqual(["start"]);
    // a legacy project that carries stray draft values still gets none of the new kinds
    const stray = stateWith({ ...pending, invites: [invite("i1", "u_hs", "sponsor", 1)], startDay: 5, dueDay: 12 }, [], true);
    expect(dueNow(stray, 30, above).map((d) => d.kind)).toEqual(["start"]);
    const demo = reduce({ ...SEED, clock: DEMO_CLOCK }, { events: [raised, yes], day: 0 });
    Object.assign(demo.projects[0], { draft: true, ...pending, invites: [invite("i1", "u_hs", "sponsor", 1)] });
    expect(dueNow(demo, 30, above)).toEqual([]);
  });

  it("the lead's own seat is found by user id, not by name", () => {
    const s = draft({ leadState: "taken", startDay: 20, lead: "Somebody Else", leadUserId: "u_lb" });
    expect(dueNow(s, 20, above)[0].toRoleHolderId).toBe("seat_tv");
    expect(meFor("u_lb", seats).roleIds).toContain("role_lead");
  });

  it("end to end with the real reducer: the lapse the scheduler writes hands the draft to the decider and starts the start window", () => {
    const lapse = ev("project.lead.answered", "system:clock", "p_one", { take: false, lapsed: true, askId: yes.id }, LEAD_RETURN_DAYS);
    const asked = reduce(SEED, { events: [raised, yes], day: LEAD_RETURN_DAYS });
    const [due] = dueNow(asked, LEAD_RETURN_DAYS, above);
    expect(due).toMatchObject({ kind: "lead", lapse: true, askId: yes.id });
    const after = reduce(SEED, { events: [raised, yes, lapse], day: LEAD_RETURN_DAYS });
    expect(after.projects[0]).toMatchObject({ leadState: "taken", leadUserId: "u_tv" });
    expect(dueNow(after, LEAD_RETURN_DAYS, above)).toEqual([]);
    const startDay = after.projects[0].startDay!;
    const late = reduce(SEED, { events: [raised, yes, lapse], day: startDay });
    expect(dueNow(late, startDay, above).map((d) => [d.kind, d.dueDay])).toEqual([["draft", startDay]]);
  });
});
