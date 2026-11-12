// REG-C1 (D5): a fixed State, people, subscriptions and events for the notify planner, written as literals. Nothing here is
// built with reduce() or from a seed run through the reducer, so a phase that merges later (SET, INB, MOV, NOR) cannot change
// what the golden of tests/unit/reg/notices.test.ts records. Shapes follow the helpers of tests/unit/ntf/plan.test.ts and
// tests/unit/set/notice.test.ts.
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import type { ReducedCase, State } from "@/features/cases/reducer";
import type { Route } from "@/features/demo/types";
import { LOOP_DEFAULTS } from "@/features/loop/rules";
import type { PlanCtx, PlanEvent, PlanPerson } from "@/features/notify/plan";
import type { Measure, ReducedProject } from "@/features/projects/types";

const seats: SeatRow[] = [
  { id: "s_own1", roleId: "role_owner", label: "Owner One", userId: "u_own1", sort: 0 },
  { id: "s_own2", roleId: "role_owner", label: "Owner Two", userId: "u_own2", sort: 1 },
  { id: "s_dep", roleId: "role_deputy", label: "Deputy", userId: "u_dep", sort: 2 },
  { id: "s_dep2", roleId: "role_deputy", label: "Deputy Two", userId: "u_dep2", sort: 3 },
  { id: "s_raiser", roleId: "role_member", label: "Raiser", userId: "u_raiser", sort: 4 },
  { id: "s_lead", roleId: "role_member", label: "Lead One", userId: "u_lead", sort: 5 },
  { id: "s_hs", roleId: "role_member", label: "H. Sander", userId: "u_hs", sort: 6 },
  { id: "s_ci", roleId: "role_member", label: "C. Ilg", userId: "u_ci", sort: 7 },
  { id: "s_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 8 },
  { id: "s_head2", roleId: "role_head", label: "K. Head Two", userId: "u_head2", sort: 9 },
  { id: "s_mgr", roleId: "role_mgr", label: "M. Chef", userId: "u_mgr", sort: 10 },
];

const route: Route = {
  id: "r2", type: "Machine fault", keys: ["machine"], owner: { name: "Owner One", role: "Owner", dept: "Production" }, deputy: "Deputy", buddy: "Buddy", wait: "5 d",
  ownerRoleId: "role_owner", ownerSeatId: "s_own1", deputyRoleId: "role_deputy", deputySeatId: "s_dep",
};

/** People as the planner reads them: one without an address, one Deutsch, a manager, and three with a Teams chat. */
export const FIXTURE_PEOPLE: PlanPerson[] = [
  { id: "u_own1", email: "own1@fx.test", locale: "en", name: "Owner One", teams: true },
  { id: "u_own2", email: "own2@fx.test", locale: "de", name: "Owner Two" },
  { id: "u_dep", email: "dep@fx.test", locale: "en", name: "Deputy" },
  { id: "u_dep2", email: null, locale: "en", name: "Deputy Two" },
  { id: "u_raiser", email: "raiser@fx.test", locale: "en", name: "Raiser" },
  { id: "u_lead", email: "lead@fx.test", locale: "en", name: "Lead One", teams: true },
  { id: "u_hs", email: "hs@fx.test", locale: "en", name: "H. Sander" },
  { id: "u_ci", email: "ci@fx.test", locale: "de", name: "C. Ilg" },
  { id: "u_head", email: "head@fx.test", locale: "en", name: "K. Head", teams: true },
  { id: "u_head2", email: "head2@fx.test", locale: "de", name: "K. Head Two" },
  { id: "u_mgr", email: "mgr@fx.test", locale: "en", name: "M. Chef", manager: true },
];

const ev = (id: string, type: CaseEventType, actor: string | null, target: string | null, payload: EventPayload = {}, day = 0): PlanEvent & { day: number } => ({
  id, ts: 1_700_000_000_000 + day * 86_400_000, day, type, actor: actor === null ? "system:clock" : actor,
  actorUserId: actor === null ? null : (({ "Owner One": "u_own1", Raiser: "u_raiser", "Lead One": "u_lead", "H. Sander": "u_hs", "K. Head": "u_head", "M. Chef": "u_mgr", Deputy: "u_dep" } as Record<string, string>)[actor] ?? null),
  target, payload,
});

const raisedEv = (caseId: string): CaseEvent => ev(`fx_raised_${caseId}`, "case.raised", "Raiser", caseId, { kind: "problem", title: "Case " + caseId, routeId: "r2", assignee: "Owner One", assigneeRoleHolderId: "s_own1" }) as CaseEvent;

const kase = (id: string, over: Partial<ReducedCase> = {}): ReducedCase => ({
  id, seed: false, kind: "problem", title: "Case " + id, body: "", from: "Raiser", fromDept: "", fromUserId: "u_raiser", assigneeSeatId: "s_own1", assigneeRoleId: "role_owner",
  routeId: "r2", assignee: "Owner One", raisedDay: 0, reason: "triage", upside: "", linkedIdea: null,
  status: "open", read: null, decided: null, withdrawn: null, question: null, handed: [], building: null, shipped: null, override: null,
  discussion: null, versions: [], pausedDays: 0, pausedSince: null, history: [raisedEv(id)],
  route, age: 1, clock: 1, open: true, archived: false, overdue: false, dueDay: 5, escalated: null, ...over,
});

const measure: Measure = {
  check: 30, value: 30, source: "typed", note: "", day: 31, by: "Lead One", byUserId: "u_lead", sourceKind: "typed", sourceInfo: { kind: "typed" }, impact: null,
  confirmed: false, confirmedByUserId: null, confirmedDay: null, verdict: "better", changePct: -28,
  sentBack: false, reentered: false, managerOnly: false, questions: [], previous: [],
};

const project = (id: string, over: Partial<ReducedProject> = {}): ReducedProject => ({
  id, number: 1, seed: false, title: "Project " + id, sources: [], authors: ["Raiser"], routeId: "r2", lead: "Lead One", members: [],
  leadUserId: "u_lead", memberUserIds: [], authorUserIds: ["u_raiser"], openedDay: 0, openedBy: "Owner One",
  startedDay: null, doneDay: null, doneNote: "", stopped: null, baseline: null, steps: [], links: [], sync: null, measures: [], checks: [], verdict: null,
  reward: null, claimed: null, status: "planning", closed: false, rewardDue: false, dueDay: 5, overdue: false, escalated: null, history: [],
  draft: false, leadState: "taken", leadAskedDay: null, template: null, invites: [], sponsorUserId: null, followerUserIds: [], goal: null, startDay: null,
  approvalsPendingSince: null, raiserNote: "", deciderUserId: null,
  doneBy: null, doneByMoves: [], pausedUntil: null, pauseWhy: "", lastActivityDay: null, checkInWeekday: null, howWeWorkNote: "", leadVacatedDay: null, latestUpdate: null, rewardDueDay: null, helpAsks: [], ...over,
});

const step = (id: string, text: string, owner: string | null) => ({
  id, text, owner, ownerUserId: null, dueDay: null, column: "todo" as const, why: "", note: "", addedDay: 0, by: "Lead One", byUserId: "u_lead", movedDay: 0, startedDay: null, doneDay: null, external: null,
});

const baseline = { none: false as const, metric: "Changeover", unit: "min", value: 42, better: "down" as const, source: "MES", day: 0, by: "Lead One" };

/** The clock passed the unconfirmed result up to the seat above: this fact is in the project's history too, as the reducer keeps it. */
const confirmAbove = ev("fx_due_confirm_above", "clock.due", null, "p_one", { kind: "confirm", dueDay: 44, check: 30, toRoleHolderId: "s_head" }, 45);
const stopEvent = ev("fx_stop", "project.stopped", "K. Head", "p_stop", { why: "Not this quarter" }, 12);

export const FIXTURE_STATE: State = {
  day: 14,
  cases: [
    kase("c_raise"),
    kase("c_triage", { routeId: null, route: null, assignee: "Triage desk" }),
    kase("c_disc", {
      status: "discussion",
      discussion: {
        startedDay: 1, by: "Owner One", byUserId: "u_own1", invited: ["H. Sander"], invitedUserIds: ["u_hs"], missing: "The saving",
        rounds: [{ round: 1, day: 3, by: "Owner One", byUserId: "u_own1", next: "decide", open: ["Cost"], note: "Quote is in" }], round: 1, ready: true, lastDay: 6,
      },
    }),
    kase("c_ask", { status: "asked", question: { text: "Which line?", by: "Owner One", byUserId: "u_own1", day: 1, answer: null, unanswered: null } }),
    kase("c_ans", { question: { text: "Which line?", by: "Owner One", byUserId: "u_own1", day: 1, answer: { text: "Line 3", by: "Raiser", byUserId: "u_raiser", day: 2 }, unanswered: null } }),
    kase("c_unans", { question: { text: "Which line?", by: "Owner One", byUserId: "u_own1", day: 1, answer: null, unanswered: 5 } }),
    kase("c_wd", { status: "withdrawn", open: false, archived: true, withdrawn: { day: 2, by: "Raiser", byUserId: "u_raiser", note: "Changed my mind" } }),
    kase("c_hand", { assigneeSeatId: "s_dep", assigneeRoleId: "role_deputy", assignee: "Deputy" }),
    kase("c_no", { status: "decided", open: false, archived: true, decided: { answer: "no", reason: "not now", note: "", by: "Owner One", byUserId: "u_own1", day: 1 } }),
    kase("c_yes", { status: "decided", open: false, archived: true, decided: { answer: "yes", reason: "", note: "", by: "Owner One", byUserId: "u_own1", day: 1, projectId: "p_one", lead: "Lead One" } }),
    kase("c_yesd", { status: "decided", open: false, archived: true, decided: { answer: "yes", reason: "", note: "", by: "Owner One", byUserId: "u_own1", day: 1, projectId: "p_draft", lead: "Lead One" } }),
    kase("c_yesn", { status: "decided", open: false, archived: true, decided: { answer: "yes", reason: "", note: "", by: "Owner One", byUserId: "u_own1", day: 1, projectId: null, lead: null } }),
  ],
  ideas: [], problems: [],
  projects: [
    project("p_one", {
      sources: ["c_yes"], members: ["H. Sander"], memberUserIds: ["u_hs"], baseline, startedDay: 1, doneDay: 2, status: "measuring", measures: [measure],
      history: [ev("fx_p_started", "project.started", "Lead One", "p_one", {}, 1) as CaseEvent, ev("fx_p_done", "project.done", "Lead One", "p_one", {}, 2) as CaseEvent, confirmAbove as CaseEvent],
    }),
    project("p_stop", {
      sources: ["c_yes"], members: ["H. Sander"], memberUserIds: ["u_hs"], status: "stopped", closed: true, stopped: { day: 12, by: "K. Head", why: "Not this quarter" },
      history: [stopEvent as CaseEvent],
    }),
    project("p_draft", {
      sources: ["c_yesd"], draft: true, leadState: "pending", leadAskedDay: 1, deciderUserId: "u_own1", raiserNote: "Please lead it", followerUserIds: ["u_ci"],
      invites: [
        { id: "fx_inv1", userId: "u_hs", role: "member", state: "pending", day: 2, reason: "" },
        { id: "fx_inv2", userId: "u_ci", role: "sponsor", state: "declined", day: 2, reason: "Too busy" },
        { id: "fx_inv3", userId: "u_mgr", role: "contributor", state: "lapsed", day: 2, reason: "" },
      ],
    }),
    project("p_back", { sources: ["c_yesd"], draft: true, deciderUserId: "u_own1", leadUserId: "u_own1", lead: "Owner One" }),
    project("p_move", { sources: ["c_yesd"], draft: true, deciderUserId: "u_own1", startDay: 12, dueDay: 12 }),
    project("p_kick", {
      sources: ["c_yesd"], draft: true, deciderUserId: "u_own1", startedDay: 4, status: "running", memberUserIds: ["u_hs"], members: ["H. Sander"], sponsorUserId: "u_mgr", followerUserIds: ["u_ci", "u_raiser"],
      goal: { goal: "Changeover under 30 minutes", doneWhen: "Three shifts in a row", doneBy: null, brief: "" },
      steps: [step("t1", "Try it at one station", "H. Sander"), step("t2", "Make it the standard", null)],
    }),
  ],
  ledger: { handedOver: 0, escalated: 0, overrides: 0, projectsEscalated: 0, measuresOwed: 0, unmeasured: 0 },
  rules: {
    ...LOOP_DEFAULTS,
    discussEveryDays: 3, discussMaxRounds: 3, measureDays: [30, 90], tolerancePct: 2, fastLaneEur: 5000,
    reward: { kind: "thanks", amount: null, sharePct: null, capEur: null }, deadlineHandover: true, escalationDays: 3, projectStartDays: 10, measure: true, recognition: true,
  },
  seats, routes: [route], clock: { mode: "demo" },
};

/** One of each type the planner turns into loop notices, one clock.due per reminder kind, and a raise. Ids and times are fixed. */
export const FIXTURE_EVENTS: PlanEvent[] = [
  ev("fx_raise", "case.raised", "Raiser", "c_raise", { kind: "problem", title: "Case c_raise", routeId: "r2", assignee: "Owner One", assigneeRoleHolderId: "s_own1" }),
  // case events
  ev("fx_discussion", "case.discussion", "Owner One", "c_disc", { invited: ["H. Sander"], invitedUserIds: ["u_hs"], missing: "The saving" }, 1),
  ev("fx_invited", "case.invited", "Owner One", "c_disc", { invited: ["H. Sander"], invitedUserIds: ["u_hs"] }, 2),
  ev("fx_checkin", "case.checkin", "Owner One", "c_disc", { next: "decide", open: ["Cost"], note: "Quote is in" }, 3),
  ev("fx_asked", "case.asked", "Owner One", "c_ask", { text: "Which line?" }, 1),
  ev("fx_answered", "case.answered", "Raiser", "c_ans", { text: "Line 3" }, 2),
  ev("fx_unanswered", "case.unanswered", null, "c_unans", {}, 5),
  ev("fx_withdrawn", "case.withdrawn", "Raiser", "c_wd", { note: "Changed my mind" }, 2),
  ev("fx_handed", "case.handed", "Owner One", "c_hand", { to: "Deputy", toRoleHolderId: "s_dep", why: "Holiday" }, 3),
  ev("fx_no", "case.decided", "Owner One", "c_no", { answer: "no", reason: "not now" }, 1),
  ev("fx_yes", "case.decided", "Owner One", "c_yes", { answer: "yes", projectId: "p_one", lead: "Lead One", leadUserId: "u_lead", title: "Shorter changeover" }, 1),
  ev("fx_yes_draft", "case.decided", "Owner One", "c_yesd", { answer: "yes", projectId: "p_draft", lead: "Lead One", leadUserId: "u_lead", draft: true, raiserNote: "Please lead it" }, 1),
  ev("fx_yes_plain", "case.decided", "Owner One", "c_yesn", { answer: "yes" }, 1),
  // project events
  ev("fx_p_handed", "project.handed", "Owner One", "p_one", { to: "Lead One", toUserId: "u_lead", why: "You know the line" }, 3),
  ev("fx_p_member", "project.member", "Lead One", "p_one", { userId: "u_ci", name: "C. Ilg" }, 3),
  ev("fx_p_started", "project.started", "Lead One", "p_one", {}, 1),
  ev("fx_p_done", "project.done", "Lead One", "p_one", {}, 2),
  ev("fx_p_measured", "project.measured", "Lead One", "p_one", { check: 30, value: 30 }, 31),
  ev("fx_p_confirmed", "project.measure.confirmed", "H. Sander", "p_one", { check: 30 }, 32),
  ev("fx_p_rewarded", "project.rewarded", "Owner One", "p_one", { rule: "thanks" }, 33),
  stopEvent,
  ev("fx_p_lead_back", "project.lead.answered", "Lead One", "p_back", { take: false, reason: "No capacity before March" }, 3),
  ev("fx_p_lead_lapsed", "project.lead.answered", null, "p_back", { take: false, lapsed: true }, 5),
  ev("fx_inv1", "project.invited", "Lead One", "p_draft", { userId: "u_hs", role: "member" }, 2),
  ev("fx_inv_follow", "project.invited", "Lead One", "p_draft", { userId: "u_ci", role: "follower" }, 2),
  ev("fx_inv_declined", "project.invite.answered", "C. Ilg", "p_draft", { inviteId: "fx_inv2", userId: "u_ci", take: false, reason: "Too busy" }, 3),
  ev("fx_inv_lapsed", "project.invite.answered", null, "p_draft", { inviteId: "fx_inv3", userId: "u_mgr", take: false, lapsed: true }, 7),
  ev("fx_p_moved", "project.start.moved", "K. Head", "p_move", { dueDay: 12, why: "Supplier is late" }, 11),
  ev("fx_p_kickoff", "project.started", "Lead One", "p_kick", {}, 4),
  // the clock's facts, one per reminder kind
  ev("fx_due_deadline", "clock.due", null, "c_raise", { kind: "deadline", dueDay: 5, toRoleHolderId: "s_dep" }, 6),
  ev("fx_due_checkin", "clock.due", null, "c_disc", { kind: "checkin", dueDay: 3 }, 4),
  ev("fx_due_start", "clock.due", null, "p_one", { kind: "start", dueDay: 5 }, 6),
  ev("fx_due_measure", "clock.due", null, "p_one", { kind: "measure", dueDay: 40, check: 30 }, 41),
  ev("fx_due_escalation_above", "clock.due", null, "c_raise", { kind: "escalation", dueDay: 5, toRoleHolderId: "s_head" }, 9),
  ev("fx_due_escalation_none", "clock.due", null, "c_raise", { kind: "escalation", dueDay: 5, toRoleHolderId: null }, 9),
  ev("fx_due_question", "clock.due", null, "c_ask", { kind: "question", dueDay: 3 }, 4),
  ev("fx_due_triage", "clock.due", null, "c_triage", { kind: "triage", dueDay: 2 }, 3),
  ev("fx_due_confirm_desk", "clock.due", null, "p_one", { kind: "confirm", dueDay: 40, check: 30 }, 41),
  confirmAbove,
  ev("fx_due_lead", "clock.due", null, "p_draft", { kind: "lead", dueDay: 3, userId: "u_lead" }, 4),
  ev("fx_due_invite", "clock.due", null, "p_draft", { kind: "invite", dueDay: 4, userId: "u_hs", inviteId: "fx_inv1" }, 5),
  ev("fx_due_draft", "clock.due", null, "p_draft", { kind: "draft", dueDay: 10, toRoleHolderId: "s_head", userId: "u_lead" }, 11),
  ev("fx_due_draft_3", "clock.due", null, "p_draft", { kind: "draft", dueDay: 10, check: 3, toRoleHolderId: "s_head", userId: "u_lead" }, 14),
];

/** The planner's context: the fixed state, people with and without a Teams chat, one webhook subscription, no opt-outs. */
export function fixtureCtx(teamsOn: boolean): PlanCtx {
  return {
    companyId: "co_fx", state: FIXTURE_STATE, people: FIXTURE_PEOPLE, prefs: [], company: { stage: "pilot", notifications: true, n8n: true },
    subscriptions: [{ id: "sub_fx", events: ["case.raised", "case.decided", "project.started", "project.stopped"], on: true }],
    baseUrl: "https://fx.test/acme", teamsOn,
    dateOfDay: (day: number) => new Date(Date.UTC(2026, 10, 2 + day)).toISOString().slice(0, 10),
  };
}
