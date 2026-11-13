// Plan SET, SET-U1 (B1): what the draft page reads off a draft - the checklist, whether it may start, the start day and
// per viewer what they may do. States come from the real reducer, built from event logs.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { Role } from "@/config/roles";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import type { Actor } from "@/features/cases/permissions";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { draftView, pendingInviteOf } from "@/features/projects/draft";

const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_lb", roleId: "role_lead", label: "L. Brandt", userId: "u_lb", sort: 1 },
  { id: "seat_hs", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 2 },
  { id: "seat_mr", roleId: "role_ops", label: "M. Roth", userId: "u_mr", sort: 3 },
];
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes: LOCAL_SEED.routes, promiseDays: PROMISE_DAYS, seats, clock: { mode: "workdays", calendar: DEFAULT_CALENDAR } };
const NAME: Record<string, string> = { u_tv: "T. Vogel", u_lb: "L. Brandt", u_hs: "H. Sander", u_mr: "M. Roth", u_ci: "C. Ilg" };

let n = 0;
const ev = (type: CaseEventType, target: string | null, payload: EventPayload, day: number, by: string): CaseEvent =>
  ({ id: "d" + n++, ts: 0, type, actor: NAME[by] ?? by, actorUserId: by, target, payload, day });
const P = (type: CaseEventType, payload: EventPayload, day: number, by: string) => ev(type, "p_one", payload, day, by);

const raised = ev("case.raised", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" }, 0, "u_ci");
// The decider T. Vogel says yes on day 0 and asks L. Brandt to lead it.
const yes = ev("case.decided", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", draft: true }, 0, "u_tv");

const stateOf = (events: CaseEvent[], day: number): State => reduce(SEED, { events: [raised, yes, ...events], day });
/** A reward is possible by default (plan RES, D16): a number baseline then waits for a second person. These SET cases are about the draft, so they take that confirmation as given. */
const confirmed = (s: State): State => {
  for (const p of s.projects) if (p.baseline && !p.baseline.none) p.baseline.confirmed = { byUserId: "u_hs", day: 2 };
  return s;
};
const as = (userId: string, role: Role = "member"): Actor => ({ role, userId, me: meFor(userId, seats), name: NAME[userId] ?? userId, handle: "" });

const take = P("project.lead.answered", { take: true }, 1, "u_lb");
const template = P("project.template", { key: "8d", version: 1 }, 1, "u_lb");
const invited = P("project.invited", { userId: "u_mr", role: "member" }, 1, "u_lb");
const goal = P("project.goal", { goal: "Fewer complaints", doneWhen: "Under 3 a month" }, 1, "u_lb");
const baseline = P("project.baseline", { metric: "Complaints", unit: "per month", value: 9, better: "down", source: "QMS" }, 1, "u_lb");

describe("SET draft view", () => {
  it("a draft whose lead has not answered has an open checklist, no start day and cannot start", () => {
    const s = stateOf([], 0);
    const v = draftView(s.projects[0], as("u_lb"), s);
    expect(v.checklist).toEqual({ lead: "open", template: "open", team: "open", goal: "open", baseline: "open" });
    expect(v.canStart).toBe(false);
    expect(v.startDay).toBeNull();
    expect(v.late).toBe(false);
  });

  it("the checklist follows lead taken, template, team, goal and baseline", () => {
    const s = confirmed(stateOf([take, template, invited, P("project.invite.answered", { inviteId: invited.id, userId: "u_mr", take: true }, 2, "u_mr"), goal, baseline], 2));
    expect(draftView(s.projects[0], as("u_lb"), s).checklist).toEqual({ lead: "done", template: "done", team: "done", goal: "done", baseline: "done" });
    // an invitation nobody answered yet does not make the team done
    const pending = stateOf([take, template, invited], 2);
    expect(draftView(pending.projects[0], as("u_lb"), pending).checklist).toMatchObject({ lead: "done", template: "done", team: "open" });
  });

  it("canStart only when the lead has taken it and goal and baseline are set", () => {
    const can = (events: CaseEvent[]) => { const s = confirmed(stateOf(events, 2)); return draftView(s.projects[0], as("u_lb"), s).canStart; };
    expect(can([goal, baseline])).toBe(false); // the lead has not taken it
    expect(can([take, baseline])).toBe(false); // no goal
    expect(can([take, goal])).toBe(false); // no baseline
    expect(can([take, goal, baseline])).toBe(true);
    // a template or a team is not needed
    expect(can([take, goal, baseline, template])).toBe(true);
  });

  it("the start day is the day the lead took it plus the start window; late once today is past it", () => {
    const events = [take, goal, baseline];
    const early = confirmed(stateOf(events, 5));
    const v = draftView(early.projects[0], as("u_lb"), early);
    expect(v.startDay).toBe(early.projects[0].startDay);
    expect(v.startDay).toBe(1 + 10);
    expect(v.late).toBe(false);
    const day = v.startDay as number;
    expect(draftView(stateOf(events, day).projects[0], as("u_lb"), stateOf(events, day)).late).toBe(false);
    const past = stateOf(events, day + 1);
    expect(draftView(past.projects[0], as("u_lb"), past).late).toBe(true);
    // a started project is no draft any more
    const started = stateOf([...events, P("project.started", {}, 3, "u_lb")], day + 5);
    expect(draftView(started.projects[0], as("u_lb"), started).late).toBe(false);
  });

  it("the lead asked may answer; the decider sets the draft up meanwhile but does not answer for the lead", () => {
    const s = stateOf([], 0);
    const lead = draftView(s.projects[0], as("u_lb"), s).may;
    expect(lead).toMatchObject({ answerLead: true, pickTemplate: true, invite: true, setGoal: true, setBaseline: true, start: false, moveStart: false });
    const decider = draftView(s.projects[0], as("u_tv"), s).may;
    expect(decider).toMatchObject({ answerLead: false, pickTemplate: true, setGoal: true, setBaseline: true, invite: false, start: false });
  });

  it("once taken, only the lead (and a manager) start it; a member and a stranger may do nothing", () => {
    const s = stateOf([take, goal, baseline, invited], 2);
    const p = s.projects[0];
    // A reward is possible by default (plan RES, D16), so the start also needs the second person's confirmation of the baseline number.
    if (p.baseline && !p.baseline.none) p.baseline.confirmed = { byUserId: "u_mr", day: 2 };
    expect(draftView(p, as("u_lb"), s).may).toMatchObject({ answerLead: false, pickTemplate: true, invite: true, setGoal: true, setBaseline: true, start: true });
    expect(draftView(p, as("u_tv"), s).may).toMatchObject({ pickTemplate: false, setGoal: false, setBaseline: false, invite: false, start: false });
    expect(draftView(p, as("u_hs"), s).may).toEqual({ answerLead: false, pickTemplate: false, invite: false, answerInvite: false, setGoal: false, setBaseline: false, confirmBaseline: false, start: false, moveStart: false });
    expect(draftView(p, as("u_mgr", "manager"), s).may).toMatchObject({ pickTemplate: true, invite: true, start: true });
  });

  it("start is refused to the lead until it can start", () => {
    const s = stateOf([take], 2);
    const v = draftView(s.projects[0], as("u_lb"), s);
    expect(v.canStart).toBe(false);
    expect(v.may.start).toBe(false);
  });

  it("only the invitee may answer their own pending invitation, and not after answering", () => {
    const s = stateOf([take, invited], 2);
    const p = s.projects[0];
    expect(pendingInviteOf(p, "u_mr")?.id).toBe(invited.id);
    expect(pendingInviteOf(p, "u_hs")).toBeNull();
    expect(draftView(p, as("u_mr"), s).may.answerInvite).toBe(true);
    expect(draftView(p, as("u_lb"), s).may.answerInvite).toBe(false);
    const done = stateOf([take, invited, P("project.invite.answered", { inviteId: invited.id, userId: "u_mr", take: false }, 3, "u_mr")], 3);
    expect(draftView(done.projects[0], as("u_mr"), done).may.answerInvite).toBe(false);
  });

  it("the sponsor may set the goal; a manager may move a late start", () => {
    const sponsor = P("project.invited", { userId: "u_hs", role: "sponsor" }, 1, "u_lb");
    const s = stateOf([take, sponsor, P("project.invite.answered", { inviteId: sponsor.id, userId: "u_hs", take: true }, 2, "u_hs")], 3);
    expect(draftView(s.projects[0], as("u_hs"), s).may).toMatchObject({ setGoal: true, setBaseline: false, invite: false });
    expect(draftView(s.projects[0], as("u_mgr", "manager"), s).may.moveStart).toBe(true);
    expect(draftView(s.projects[0], as("u_lb"), s).may.moveStart).toBe(false);
  });
});

// Plan RES, RES-U2 (B2): the draft's baseline waits for a second person where a reward is possible (D16); the start waits with it.
describe("RES draft baseline", () => {
  const sponsorInvite = P("project.invited", { userId: "u_hs", role: "sponsor" }, 1, "u_lb");
  const sponsorTakes = P("project.invite.answered", { inviteId: sponsorInvite.id, userId: "u_hs", take: true }, 2, "u_hs");
  const ready = [take, goal, baseline, sponsorInvite, sponsorTakes];

  it("a number baseline is open on the checklist while it waits for a second person, and the draft cannot start", () => {
    const s = stateOf(ready, 3);
    const v = draftView(s.projects[0], as("u_lb"), s);
    expect(s.projects[0].baseline).toMatchObject({ none: false, byUserId: "u_lb", confirmed: null });
    expect(v.baselineWaits).toBe(true);
    expect(v.checklist).toMatchObject({ lead: "done", goal: "done", baseline: "open" });
    expect(v.canStart).toBe(false);
    expect(v.may.start).toBe(false);
  });

  it("once the sponsor confirmed it the baseline is done, the draft can start and the lead may press start", () => {
    const s = stateOf([...ready, P("project.baseline.confirmed", {}, 3, "u_hs")], 3);
    const v = draftView(s.projects[0], as("u_lb"), s);
    expect(s.projects[0].baseline).toMatchObject({ confirmed: { byUserId: "u_hs", day: 3 } });
    expect(v).toMatchObject({ baselineWaits: false, canStart: true });
    expect(v.checklist.baseline).toBe("done");
    expect(v.may).toMatchObject({ start: true, confirmBaseline: false });
  });

  it("a new baseline takes the confirmation back: the checklist opens again and the start waits again", () => {
    const again = P("project.baseline", { metric: "Complaints", unit: "per month", value: 8, better: "down", source: "QMS" }, 4, "u_lb");
    const s = stateOf([...ready, P("project.baseline.confirmed", {}, 3, "u_hs"), again], 4);
    const v = draftView(s.projects[0], as("u_lb"), s);
    expect(s.projects[0].baseline).toMatchObject({ value: 8, confirmed: null });
    expect(v).toMatchObject({ baselineWaits: true, canStart: false });
    expect(v.checklist.baseline).toBe("open");
  });

  it("the sponsor may confirm it, the lead and who typed it may not, nor a stranger or the deputy's colleague without the role", () => {
    const s = stateOf(ready, 3);
    const may = (userId: string, role: Role = "member") => draftView(s.projects[0], as(userId, role), s).may.confirmBaseline;
    expect(may("u_hs", "leader")).toBe(true);
    expect(may("u_lb", "leader")).toBe(false);
    expect(may("u_tv", "leader")).toBe(false);
    expect(may("u_mr")).toBe(false);
    // a manager confirms only where there is no accepted sponsor and the deputy's desk has nobody on it
    expect(may("u_mgr", "manager")).toBe(false);
  });

  it("a manager confirms when there is no sponsor and the route's deputy desk is empty", () => {
    const s = stateOf([take, goal, baseline], 3);
    s.routes = s.routes.map((r) => ({ ...r, deputyRoleId: null, deputySeatId: null }));
    expect(draftView(s.projects[0], as("u_mgr", "manager"), s).may.confirmBaseline).toBe(true);
    expect(draftView(s.projects[0], as("u_lb"), s).may.confirmBaseline).toBe(false);
  });

  it("a baseline with no number, and a company that gives no reward, never wait", () => {
    const none = stateOf([take, goal, P("project.baseline", { none: true, why: "nothing to measure" }, 1, "u_lb")], 2);
    expect(draftView(none.projects[0], as("u_lb"), none)).toMatchObject({ baselineWaits: false, canStart: true });
    const noReward = stateOf([take, goal, baseline], 2);
    noReward.rules = { ...noReward.rules, reward: { ...noReward.rules.reward, kind: "none" } };
    expect(draftView(noReward.projects[0], as("u_lb"), noReward)).toMatchObject({ baselineWaits: false, canStart: true });
    expect(draftView(noReward.projects[0], as("u_lb"), noReward).checklist.baseline).toBe("done");
  });
});
