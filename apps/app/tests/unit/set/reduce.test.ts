// Plan SET, SET-A1: the reducer turns a yes with draft: true into a draft, and lead, team, template, goal and the
// clock's facts shape it (D8 to D17). Everything is derived from the log: no test reads "today" to get a day.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR, type ClockSpec } from "@/features/clock";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import type { LoopRules } from "@/features/loop/rules";
import type { ReducedProject } from "@/features/projects/types";
import { templateSteps } from "@/features/templates/library";

const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 1 },
  { id: "seat_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 2 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner", deputySeatId: "seat_dep", deputyRoleId: "role_deputy" } : x));
const WORKDAYS: ClockSpec = { mode: "workdays", calendar: DEFAULT_CALENDAR };
const seed = (loop?: Partial<LoopRules>, clock?: ClockSpec): ReduceSeed => ({ cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, ...(loop ? { loop } : {}), ...(clock ? { clock } : {}) });

const NAME: Record<string, string> = { u_tv: "T. Vogel", u_lb: "L. Brandt", u_hs: "H. Sander", u_ci: "C. Ilg", u_mr: "M. Roth", u_head: "K. Head" };
let n = 0;
/** An event by `by` (default the lead L. Brandt) on project p_one. */
const ev = (type: CaseEventType, target: string | null, payload: EventPayload = {}, day = 0, by: string | null = "u_lb"): CaseEvent =>
  ({ id: "a" + n++, ts: 0, type, actor: by === null ? "system:clock" : NAME[by] ?? by, actorUserId: by, target, payload, day });
const P = (type: CaseEventType, payload: EventPayload = {}, day = 0, by: string | null = "u_lb") => ev(type, "p_one", payload, day, by);

const raised = ev("case.raised", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" }, 0, "u_ci");
/** The yes of the decider u_tv; `lead` is who sets the project up. */
const yes = (lead: string | null, day = 0, more: EventPayload = {}) =>
  ev("case.decided", "c_a", { answer: "yes", projectId: "p_one", ...(lead ? { lead: NAME[lead], leadUserId: lead } : {}), draft: true, raiserNote: " Thanks, please lead it ", ...more }, day, "u_tv");
const reduced = (events: CaseEvent[], day: number, s: ReduceSeed = seed()): ReducedProject => reduce(s, { events: [raised, ...events], day }).projects[0];

const START = 10; // the default project_start_days

describe("SET reduce", () => {
  it("a yes with draft true opens a planning draft whose title is the case's; the decider leading takes it at the yes", () => {
    const yesEv = yes("u_tv", 2);
    const p = reduced([yesEv], 2);
    expect(p).toMatchObject({ draft: true, status: "planning", title: "Idea", raiserNote: "Thanks, please lead it", deciderUserId: "u_tv", leadUserId: "u_tv", leadState: "taken", leadAskedDay: null });
    expect(p.startDay).toBe(2 + START);
    expect(p.dueDay).toBe(2 + START);
    expect(p.history[0]).toBe(yesEv);
    expect(reduced([yes(null, 2)], 2)).toMatchObject({ leadUserId: "u_tv", leadState: "taken", startDay: 2 + START });
    expect(reduced([yes("u_tv", 2, { title: "A better title" })], 2).title).toBe("A better title");
  });

  it("another lead is asked: pending, asked on the yes day, no start day and no overdue however late", () => {
    const p = reduced([yes("u_lb", 1)], 60);
    expect(p).toMatchObject({ draft: true, leadUserId: "u_lb", leadState: "pending", leadAskedDay: 1, startDay: null, dueDay: null, overdue: false, escalated: null });
  });

  it("take on day 3 sets the start day to 13, on whatever day it is replayed; projectStartDays 5 gives 8", () => {
    const events = [yes("u_lb", 1), P("project.lead.answered", { take: true }, 3)];
    for (const day of [3, 20, 90]) expect(reduced(events, day)).toMatchObject({ leadState: "taken", startDay: 3 + START, dueDay: 3 + START });
    expect(reduced(events, 5, seed({ projectStartDays: 5 })).startDay).toBe(3 + 5);
    expect(reduced([yes("u_tv", 2)], 2, seed({ projectStartDays: 5 })).startDay).toBe(2 + 5);
    expect(reduced(events, 13).overdue).toBe(false);
    expect(reduced(events, 14).overdue).toBe(true);
  });

  it("a decline, and a lapse the clock wrote, give the draft back to the decider, who leads from that day", () => {
    for (const answer of [{ take: false, reason: "no time" }, { take: false, lapsed: true }]) {
      const p = reduced([yes("u_lb", 1), P("project.lead.answered", answer, 5, answer.lapsed ? null : "u_lb")], 30);
      expect(p).toMatchObject({ leadUserId: "u_tv", lead: "T. Vogel", leadState: "taken", startDay: 5 + START });
      expect(p.memberUserIds).toEqual([]);
    }
  });

  it("answers only count while the lead is pending and for the ask they name", () => {
    const first = yes("u_lb", 1);
    const handed = P("project.handed", { to: "H. Sander", toUserId: "u_hs" }, 2, "u_tv");
    // A lapse written for the first ask arrives after the draft was handed on: it does not touch the new ask.
    const stale = P("project.lead.answered", { take: false, lapsed: true, askId: first.id }, 4, null);
    expect(reduced([first, handed, stale], 10)).toMatchObject({ leadUserId: "u_hs", leadState: "pending", leadAskedDay: 2, startDay: null });
    const right = P("project.lead.answered", { take: true, askId: handed.id }, 4, "u_hs");
    expect(reduced([first, handed, right], 10)).toMatchObject({ leadUserId: "u_hs", leadState: "taken", startDay: 4 + START });
    // An answer when nobody is pending changes nothing, and neither does a second answer.
    expect(reduced([yes("u_tv", 0), P("project.lead.answered", { take: false }, 3)], 5)).toMatchObject({ leadUserId: "u_tv", startDay: START });
    expect(reduced([first, P("project.lead.answered", { take: true }, 3), P("project.lead.answered", { take: false }, 4)], 6)).toMatchObject({ leadUserId: "u_lb", startDay: 3 + START });
  });

  it("handed to someone else makes that person pending again with a new window; to oneself it stays taken", () => {
    const base = [yes("u_lb", 1), P("project.lead.answered", { take: true }, 3), P("project.start.moved", { dueDay: 40, why: "later" }, 4, "u_tv")];
    expect(reduced(base, 6)).toMatchObject({ startDay: 40 });
    const away = reduced([...base, P("project.handed", { to: "H. Sander", toUserId: "u_hs" }, 7, "u_tv")], 8);
    expect(away).toMatchObject({ leadUserId: "u_hs", leadState: "pending", leadAskedDay: 7, startDay: null, dueDay: null });
    expect(away.memberUserIds).toContain("u_lb"); // the old lead took it, so they join the team
    // The moved start day belongs to the old lead: the new lead's window starts when they take it.
    const taken = reduced([...base, P("project.handed", { to: "H. Sander", toUserId: "u_hs" }, 7, "u_tv"), P("project.lead.answered", { take: true }, 9, "u_hs")], 12);
    expect(taken).toMatchObject({ leadUserId: "u_hs", leadState: "taken", startDay: 9 + START });
    const self = reduced([yes("u_lb", 1), P("project.handed", { to: "T. Vogel", toUserId: "u_tv" }, 2, "u_tv")], 4);
    expect(self).toMatchObject({ leadUserId: "u_tv", leadState: "taken", startDay: 2 + START });
    expect(self.memberUserIds).toEqual([]); // the lead who never took it does not join the team
  });

  it("a template seeds the board steps with their role and, once the lead has taken it, their day", () => {
    const quick = templateSteps("quick-win", 1);
    const p = reduced([yes("u_lb", 1), P("project.lead.answered", { take: true }, 3), P("project.template", { key: "quick-win", version: 1, title: "Quicker changeover" }, 4)], 6);
    expect(p.template).toEqual({ key: "quick-win", version: 1 });
    expect(p.title).toBe("Quicker changeover");
    expect(p.steps.map((s) => [s.id, s.text, s.role, s.dueDay, s.owner, s.column])).toEqual(
      quick.map((t, i) => [`t:quick-win:1:${i}`, t.text, t.role, 3 + t.day, null, "todo"]),
    );
    // Still pending: no day yet; it comes with the day the lead takes it.
    const pending = reduced([yes("u_lb", 1), P("project.template", { key: "quick-win", version: 1 }, 2, "u_tv")], 3);
    expect(pending.steps.every((s) => s.dueDay === null)).toBe(true);
    const later = reduced([yes("u_lb", 1), P("project.template", { key: "quick-win", version: 1 }, 2, "u_tv"), P("project.lead.answered", { take: true }, 5)], 6);
    expect(later.steps.map((s) => s.dueDay)).toEqual(quick.map((t) => 5 + t.day));
  });

  it("changing the template swaps the steps nobody touched and keeps the touched ones; an unknown template changes nothing", () => {
    const quick = templateSteps("quick-win", 1);
    const eight = templateSteps("8d", 1);
    const p = reduced([
      yes("u_tv", 0), P("project.template", { key: "quick-win", version: 1 }, 1),
      P("project.step.moved", { stepId: "t:quick-win:1:0", to: "doing" }, 2),
      P("project.step.edited", { stepId: "t:quick-win:1:1", note: "ask night shift too" }, 2),
      P("project.step.added", { stepId: "mine", text: "My own step" }, 2),
      P("project.template", { key: "8d", version: 1 }, 3),
      P("project.template", { key: "nope", version: 1 }, 3),
      P("project.template", { key: "8d", version: 9 }, 3),
    ], 4);
    expect(p.template).toEqual({ key: "8d", version: 1 });
    expect(p.steps.map((s) => s.id)).toEqual([
      "t:quick-win:1:1", "t:quick-win:1:0", "mine", ...eight.map((_, i) => `t:8d:1:${i}`),
    ]);
    expect(p.steps.find((s) => s.id === "t:quick-win:1:0")).toMatchObject({ text: quick[0].text, column: "doing", role: quick[0].role });
    expect(p.steps.find((s) => s.id === "t:quick-win:1:1")?.note).toBe("ask night shift too");
    expect(p.steps.find((s) => s.id === "mine")?.role).toBeUndefined();
    // The same template again leaves the touched steps as they are and does not double them.
    const again = reduced([yes("u_tv", 0), P("project.template", { key: "quick-win", version: 1 }, 1), P("project.step.moved", { stepId: "t:quick-win:1:0", to: "doing" }, 2), P("project.template", { key: "quick-win", version: 1 }, 3)], 4);
    expect(again.steps.map((s) => s.id)).toEqual(["t:quick-win:1:0", ...quick.slice(1).map((_, i) => `t:quick-win:1:${i + 1}`)]);
  });

  it("a template after the start is refused", () => {
    const p = reduced([yes("u_tv", 0), P("project.baseline", { metric: "m", unit: "u", value: 1, better: "down", source: "x" }), P("project.started", {}, 1), P("project.template", { key: "quick-win", version: 1 }, 2)], 3);
    expect(p).toMatchObject({ status: "running", template: null, steps: [] });
  });

  it("an invitation is pending under the event's id; accepting makes a member, a sponsor, or neither", () => {
    const inv = P("project.invited", { userId: "u_hs", role: "member" }, 2);
    const inv2 = P("project.invited", { userId: "u_hs", role: "sponsor" }, 2);
    const p = reduced([yes("u_tv"), inv, inv2], 3);
    expect(p.invites).toEqual([
      { id: inv.id, userId: "u_hs", role: "member", state: "pending", day: 2, reason: "" },
      { id: inv2.id, userId: "u_hs", role: "sponsor", state: "pending", day: 2, reason: "" },
    ]);
    expect(p.memberUserIds).toEqual([]);
    // Two role invitations of the same person are told apart by their id.
    const acceptMember = P("project.invite.answered", { inviteId: inv.id, userId: "u_hs", take: true }, 3, "u_hs");
    const done = reduced([yes("u_tv"), inv, inv2, acceptMember], 4);
    expect(done.invites.map((i) => [i.role, i.state])).toEqual([["member", "accepted"], ["sponsor", "pending"]]);
    expect(done.memberUserIds).toEqual(["u_hs"]);
    expect(done.sponsorUserId).toBeNull();
    const declined = reduced([yes("u_tv"), inv, inv2, P("project.invite.answered", { inviteId: inv2.id, userId: "u_hs", take: false, reason: "no time" }, 3, "u_hs")], 4);
    expect(declined.invites.map((i) => [i.role, i.state, i.reason])).toEqual([["member", "pending", ""], ["sponsor", "declined", "no time"]]);
    // An answer that names no invitation counts only when there is exactly one pending one.
    expect(reduced([yes("u_tv"), inv, inv2, P("project.invite.answered", { userId: "u_hs", take: true }, 3, "u_hs")], 4).invites.map((i) => i.state)).toEqual(["pending", "pending"]);
    expect(reduced([yes("u_tv"), inv, P("project.invite.answered", { userId: "u_hs", take: true }, 3, "u_hs")], 4).memberUserIds).toEqual(["u_hs"]);
    // Someone else's invitation id, and an unknown one, change nothing.
    expect(reduced([yes("u_tv"), inv, P("project.invite.answered", { inviteId: inv.id, userId: "u_ci", take: true }, 3, "u_ci")], 4).memberUserIds).toEqual([]);
    expect(reduced([yes("u_tv"), inv, P("project.invite.answered", { inviteId: "nope", userId: "u_hs", take: true }, 3, "u_hs")], 4).invites[0].state).toBe("pending");
  });

  it("an open invitation stays, a lapsed one is replaced by a new generation, a follower is added at once", () => {
    const first = P("project.invited", { userId: "u_hs", role: "member" }, 2);
    const again = P("project.invited", { userId: "u_hs", role: "member" }, 3);
    expect(reduced([yes("u_tv"), first, again], 4).invites.map((i) => i.id)).toEqual([first.id]);
    const lapse = P("project.invite.answered", { inviteId: first.id, userId: "u_hs", take: false, lapsed: true }, 7, null);
    const lapsed = reduced([yes("u_tv"), first, lapse], 8);
    expect(lapsed.invites).toEqual([{ id: first.id, userId: "u_hs", role: "member", state: "lapsed", day: 2, reason: "" }]);
    const renewed = reduced([yes("u_tv"), first, lapse, again], 8);
    expect(renewed.invites).toEqual([{ id: again.id, userId: "u_hs", role: "member", state: "pending", day: 3, reason: "" }]);
    // An old answer for the first generation no longer finds an invitation to answer.
    const old = P("project.invite.answered", { inviteId: first.id, userId: "u_hs", take: true }, 9, "u_hs");
    expect(reduced([yes("u_tv"), first, lapse, again, old], 10).invites[0].state).toBe("pending");
    const follow = reduced([yes("u_tv"), P("project.invited", { userId: "u_ci", role: "follower" }, 1), P("project.invited", { userId: "u_ci", role: "follower" }, 1)], 2);
    expect(follow.followerUserIds).toEqual(["u_ci"]);
    expect(follow.invites).toEqual([]);
    expect(reduced([yes("u_tv"), P("project.invited", { userId: "u_ci", role: "boss" as never }, 1), P("project.invited", { role: "member" }, 1)], 2).invites).toEqual([]);
  });

  it("invitations still work after the start; a sponsor accepted then replaces the old one; not once it is stopped", () => {
    const started = [yes("u_tv"), P("project.baseline", { metric: "m", unit: "u", value: 1, better: "down", source: "x" }), P("project.started", {}, 1)];
    const a = P("project.invited", { userId: "u_hs", role: "sponsor" }, 2);
    const b = P("project.invited", { userId: "u_ci", role: "sponsor" }, 2);
    const p = reduced([...started, a, P("project.invite.answered", { inviteId: a.id, userId: "u_hs", take: true }, 3, "u_hs"), b, P("project.invite.answered", { inviteId: b.id, userId: "u_ci", take: true }, 4, "u_ci")], 5);
    expect(p).toMatchObject({ status: "running", draft: true, sponsorUserId: "u_ci" });
    expect(p.invites.map((i) => i.state)).toEqual(["accepted", "accepted"]);
    const stopped = reduced([...started, P("project.stopped", { why: "no" }, 2), P("project.invited", { userId: "u_hs", role: "member" }, 3)], 4);
    expect(stopped.invites).toEqual([]);
  });

  it("a goal keeps doneBy and brief, and without them null and empty; it needs a goal and a done-when", () => {
    const all = reduced([yes("u_tv"), P("project.goal", { goal: " Shorter changeover ", doneWhen: "42 to 30 min", doneBy: 25, brief: " Why it matters " }, 1)], 2);
    expect(all.goal).toEqual({ goal: "Shorter changeover", doneWhen: "42 to 30 min", doneBy: 25, brief: "Why it matters" });
    expect(reduced([yes("u_tv"), P("project.goal", { goal: "g", doneWhen: "w" }, 1)], 2).goal).toEqual({ goal: "g", doneWhen: "w", doneBy: null, brief: "" });
    expect(reduced([yes("u_tv"), P("project.goal", { goal: "g" }, 1)], 2).goal).toBeNull();
    // The latest goal wins.
    expect(reduced([yes("u_tv"), P("project.goal", { goal: "g", doneWhen: "w" }, 1), P("project.goal", { goal: "h", doneWhen: "x" }, 2)], 3).goal?.goal).toBe("h");
  });

  it("start.moved sets the start day; before the lead took the draft it is ignored", () => {
    const moved = reduced([yes("u_tv", 0), P("project.start.moved", { dueDay: 30, why: "supplier" }, 4, "u_head")], 5);
    expect(moved).toMatchObject({ startDay: 30, dueDay: 30 });
    expect(reduced([yes("u_lb", 0), P("project.start.moved", { dueDay: 30, why: "x" }, 4, "u_head")], 5).startDay).toBeNull();
  });

  it("the draft escalates from a draft fact to the fact's seat, and the move of the start day ends it", () => {
    const s = seed(undefined, WORKDAYS);
    const base = [yes("u_tv", 0), P("project.lead.answered", { take: true }, 0)];
    const fact = P("clock.due", { kind: "draft", dueDay: START, toRoleHolderId: "seat_head", userId: "u_tv" }, START + 1, null);
    const late = reduced([...base, fact], START + 1, s);
    expect(late.status).toBe("planning");
    expect(late.escalated).toMatchObject({ to: "K. Head", toSeatId: "seat_head", what: "draft", live: true, day: START + 1 });
    // Nobody reads the fact before the start day passes: no fact, no escalation.
    expect(reduced(base, START + 1, s).escalated).toBeNull();
    // The seat above keeps it with a new date: the escalation ends and the new start day counts.
    const kept = reduced([...base, fact, P("project.start.moved", { dueDay: START + 8, why: "supplier" }, START + 2, "u_head")], START + 3, s);
    expect(kept).toMatchObject({ startDay: START + 8, dueDay: START + 8 });
    expect(kept.escalated).toMatchObject({ what: "draft", live: false });
    // A fact for the moved day escalates it again.
    const again = P("clock.due", { kind: "draft", dueDay: START + 8, toRoleHolderId: "seat_head", userId: "u_tv" }, START + 9, null);
    expect(reduced([...base, fact, P("project.start.moved", { dueDay: START + 8, why: "s" }, START + 2, "u_head"), again], START + 9, s).escalated).toMatchObject({ live: true });
    // Handing the draft on ends it: the old fact and the moved day were the old lead's.
    const handed = reduced([...base, fact, P("project.start.moved", { dueDay: START + 8, why: "s" }, START + 2, "u_head"), P("project.handed", { to: "H. Sander", toUserId: "u_hs" }, START + 3, "u_head"), P("project.lead.answered", { take: true }, START + 4, "u_hs")], START + 5, s);
    expect(handed).toMatchObject({ leadUserId: "u_hs", startDay: START + 4 + START, escalated: null });
  });

  it("without the workdays clock the draft escalates once its start day passed, as a draft", () => {
    const p = reduced([yes("u_tv", 0)], START + 2);
    expect(p.overdue).toBe(true);
    expect(p.escalated).toMatchObject({ what: "draft", live: true, day: START + 1 });
  });

  it("the new events on a project that is not a draft are ignored, and stay in its history", () => {
    const legacy = ev("case.decided", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "Old way" }, 0, "u_tv");
    const events = [
      legacy, P("project.lead.answered", { take: false }, 1), P("project.template", { key: "8d", version: 1, title: "X" }, 1),
      P("project.invited", { userId: "u_hs", role: "member" }, 1), P("project.invited", { userId: "u_ci", role: "follower" }, 1),
      P("project.invite.answered", { userId: "u_hs", take: true }, 2, "u_hs"), P("project.goal", { goal: "g", doneWhen: "w" }, 1), P("project.start.moved", { dueDay: 50, why: "x" }, 1),
    ];
    const p = reduced(events, 3);
    expect(p).toMatchObject({
      draft: false, leadState: "taken", leadUserId: "u_lb", template: null, invites: [], followerUserIds: [], sponsorUserId: null, goal: null, startDay: null,
      title: "Old way", steps: [], memberUserIds: [], dueDay: PROMISE_DAYS,
    });
    expect(p.history).toHaveLength(events.length);
  });

  it("a yes that joins a project already open ignores the draft fields", () => {
    const other = ev("case.raised", "c_b", { kind: "idea", title: "Idea b", routeId: "r1", assignee: "T. Vogel" }, 0, "u_mr");
    const join = ev("case.decided", "c_b", { answer: "yes", projectId: "p_one", lead: "H. Sander", leadUserId: "u_hs", draft: true, raiserNote: "ignored" }, 1, "u_tv");
    const p = reduce(seed(), { events: [raised, yes("u_lb", 0), other, join], day: 3 }).projects[0];
    expect(p.sources).toEqual(["c_a", "c_b"]);
    expect(p).toMatchObject({ leadUserId: "u_lb", leadState: "pending", raiserNote: "Thanks, please lead it" });
  });
});
