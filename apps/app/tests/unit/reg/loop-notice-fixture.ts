// REG-C2: fixed events and a fixed state for loopMails, written as literals. Never built with reduce() or from a seed, so a task
// that changes the reducer after this one cannot change the golden (REG/D5). Only the fields the notice builders read are set.
import type { CaseEvent } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import type { Person } from "@/features/loop/notice";

export const BASE_URL = "https://acme.sellux.ch";

export const PEOPLE: Person[] = [
  { id: "u_js", name: "J. Schmidt", email: "js@acme.test", handle: "Anonymous #4471" },
  { id: "u_tv", name: "T. Vogel", email: "tv@acme.test" },
  { id: "u_hs", name: "H. Sander", email: "hs@acme.test" },
  { id: "u_lb", name: "L. Brandt", email: "lb@acme.test" },
  { id: "u_mr", name: "M. Roth", email: "" },
  { id: "u_mg", name: "B. Hartmann", email: "bh@acme.test", manager: true },
  { id: "u_inv", name: "I. Invitee", email: "inv@acme.test" },
  { id: "u_fol", name: "F. Follower", email: "fol@acme.test" },
  { id: "u_sp", name: "S. Sponsor", email: "sp@acme.test" },
  { id: "u_dep", name: "D. Deputy", email: "dep@acme.test" },
];

const SEATS = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_hs", roleId: "role_hs", label: "H. Sander", userId: "u_hs", sort: 1 },
  { id: "seat_hs2", roleId: "role_hs", label: "M. Roth", userId: "u_mr", sort: 2 },
  { id: "seat_dep", roleId: "role_dep", label: "D. Deputy", userId: "u_dep", sort: 3 },
];
const ROUTES = [{ id: "r1", deputyRoleId: "role_dep", ownerRoleId: "role_owner" }];
const RULES = { discussEveryDays: 3, measure: true, recognition: true, reward: { kind: "thanks" } };

type Lit = Record<string, unknown>;
const NAMES: Record<string, string> = { u_js: "Anonymous #4471", u_tv: "T. Vogel", u_hs: "H. Sander", u_lb: "L. Brandt", u_mr: "M. Roth", u_mg: "B. Hartmann", u_dep: "D. Deputy" };
let n = 0;
const event = (type: string, actorUserId: string | null, target: string | null, payload: Lit = {}, id?: string): CaseEvent =>
  ({ id: id ?? "n" + n++, ts: 1_000, type, actor: actorUserId === null ? "system:clock" : NAMES[actorUserId] ?? "X", actorUserId, target, payload, day: 0 }) as CaseEvent;

const kase = (c: Lit): Lit => ({
  title: "Shorter changeover", from: "J. Schmidt", fromUserId: "u_js", status: "open", dueDay: 3, assigneeSeatId: "seat_tv",
  discussion: null, question: null, withdrawn: null, decided: null, history: [event("case.raised", "u_js", String(c.id), { visibility: "everyone" }, "r_" + c.id)], ...c,
});
const project = (p: Lit): Lit => ({
  title: "Changeover cart", number: 1, lead: "L. Brandt", leadUserId: "u_lb", status: "planning", dueDay: 5, draft: false, leadState: "taken", deciderUserId: "u_tv",
  sources: ["c_x"], memberUserIds: [], authorUserIds: ["u_js"], followerUserIds: [], sponsorUserId: null, invites: [], startDay: null, startedDay: null, raiserNote: "",
  stopped: null, closed: false, measures: [], checks: [], baseline: null, reward: null, goal: null, steps: [], history: [], ...p,
});
const measure = (o: Lit): Lit => ({ check: 30, day: 0, value: 30, verdict: "better", confirmed: true, sourceKind: "typed", by: "L. Brandt", byUserId: "u_lb", ...o });
const BASELINE = { none: false, metric: "minutes", unit: "min", value: 42, better: "down", source: "stopwatch", day: 0, by: "L. Brandt" };

const talk = event("case.discussion", "u_tv", "c_disc", { invited: ["H. Sander", "M. Roth", "T. Vogel"], invitedUserIds: ["u_hs", "u_mr", "u_tv"], missing: "The saving" });
const cases: Lit[] = [
  kase({ id: "c_disc", history: [event("case.raised", "u_js", "c_disc", {}, "r_c_disc"), talk], discussion: { missing: "The saving", rounds: [{ round: 1, next: "decide", open: ["Cost"], note: "Quote is in" }] } }),
  kase({ id: "c_disc_next", history: [event("case.raised", "u_js", "c_disc_next", {}, "r_c_disc_next"), talk], discussion: { missing: "", rounds: [{ round: 2, next: "again", open: [], note: "" }] } }),
  kase({ id: "c_asked", status: "asked", question: { text: "Which line?", answer: null, byUserId: "u_tv", unanswered: null } }),
  kase({ id: "c_answered", question: { text: "Which line?", answer: { text: "Line 3" }, byUserId: "u_tv", unanswered: null } }),
  kase({ id: "c_unanswered", question: { text: "Which line?", answer: null, byUserId: "u_tv", unanswered: 5 } }),
  kase({ id: "c_withdrawn", withdrawn: { byUserId: "u_js", note: "Not needed any more" }, history: [event("case.raised", "u_js", "c_withdrawn", {}, "r_c_withdrawn"), talk] }),
  kase({ id: "c_withdrawn_plain", withdrawn: { byUserId: "u_js", note: "" } }),
  kase({ id: "c_handed", assigneeSeatId: "seat_hs" }),
  ...[["not now", "c_no_0"], ["wrong department", "c_no_1"], ["not responsible", "c_no_2"], ["no time", "c_no_3"], ["is it important", "c_no_4"]].map(([reason, id]) =>
    kase({ id, decided: { answer: "no", reason, note: "", byUserId: "u_tv", projectId: null } })),
  kase({ id: "c_no_free", decided: { answer: "no", reason: "Too expensive", note: "Maybe next year", byUserId: "u_tv", projectId: null } }),
  kase({ id: "c_no_none", decided: { answer: "no", reason: "", note: "", byUserId: "u_tv", projectId: null } }),
  kase({ id: "c_yes_plain", decided: { answer: "yes", reason: "", note: "", byUserId: "u_tv", projectId: null } }),
  kase({ id: "c_yes_legacy", decided: { answer: "yes", reason: "", note: "", byUserId: "u_tv", projectId: "p_legacy" } }),
  kase({ id: "c_yes_draft", decided: { answer: "yes", reason: "", note: "", byUserId: "u_tv", projectId: "p_draft" } }),
  kase({ id: "c_yes_draft_taken", decided: { answer: "yes", reason: "", note: "", byUserId: "u_tv", projectId: "p_draft_taken" } }),
  kase({ id: "c_yes_join", decided: { answer: "yes", reason: "", note: "", byUserId: "u_tv", projectId: "p_draft" } }),
  kase({ id: "c_private", history: [event("case.raised", "u_js", "c_private", { visibility: "private" }, "r_c_private")] }),
];

const stopEvent = event("project.stopped", "u_lb", "p_stopped", { why: "No budget" }, "ev_stop");
const doneEvent = event("project.done", "u_lb", "p_done", {}, "ev_done");
const measuredEvent = event("project.measured", "u_lb", "p_closed_confirm", { check: 30, value: 30 }, "ev_measured");
const confirmedEvent = event("project.measure.confirmed", "u_hs", "p_closed_confirm", { check: 30 }, "ev_confirmed");
const rewardEvent = event("project.rewarded", "u_mg", "p_recognised", { rule: "thanks" }, "ev_reward");
const projects: Lit[] = [
  project({ id: "p_legacy", number: 1 }),
  project({ id: "p_draft", number: 2, draft: true, leadState: "pending", sources: ["c_yes_draft"], raiserNote: "Thanks, you do the first draft", title: "Draft project" }),
  project({ id: "p_draft_taken", number: 3, draft: true, leadState: "taken", leadUserId: "u_tv", lead: "T. Vogel", sources: ["c_yes_draft_taken"], title: "Draft taken" }),
  project({ id: "p_handed", number: 4 }),
  project({ id: "p_stopped", number: 5, stopped: { day: 0, by: "L. Brandt", why: "No budget" }, memberUserIds: ["u_hs"], history: [stopEvent] }),
  project({ id: "p_back", number: 6, draft: true, leadUserId: "u_tv", lead: "T. Vogel", deciderUserId: "u_tv" }),
  project({ id: "p_inv", number: 7, draft: true, sources: ["c_disc"], followerUserIds: ["u_fol"], invites: [{ id: "inv_contrib", userId: "u_inv", role: "contributor", state: "pending", day: 0, reason: "" }] }),
  project({ id: "p_inv_closed", number: 8, draft: true, sources: ["c_private"], invites: [{ id: "inv_sponsor", userId: "u_inv", role: "sponsor", state: "pending", day: 0, reason: "" }] }),
  project({ id: "p_inv_ans", number: 9, draft: true, invites: [
    { id: "inv_declined", userId: "u_inv", role: "member", state: "declined", day: 0, reason: "No time this quarter" },
    { id: "inv_lapsed", userId: "u_hs", role: "sponsor", state: "lapsed", day: 0, reason: "" },
  ] }),
  project({ id: "p_moved", number: 10, draft: true, startDay: 12 }),
  project({ id: "p_member", number: 11 }),
  project({ id: "p_started", number: 12 }),
  project({ id: "p_done", number: 13, closed: true, status: "measured", history: [doneEvent], baseline: BASELINE }),
  project({ id: "p_measured_better", number: 14, status: "measuring", baseline: BASELINE, checks: [{ check: 30 }], measures: [measure({})] }),
  project({ id: "p_measured_worse", number: 15, status: "measuring", baseline: BASELINE, checks: [{ check: 30 }], measures: [measure({ value: 55, verdict: "worse" })] }),
  project({ id: "p_measured_open", number: 16, status: "measuring", baseline: BASELINE, checks: [{ check: 30 }], measures: [measure({ confirmed: false })] }),
  project({ id: "p_closed_confirm", number: 17, closed: true, status: "measured", baseline: BASELINE, checks: [{ check: 30 }], measures: [measure({ confirmed: true })], history: [measuredEvent, confirmedEvent] }),
  project({ id: "p_recognised", number: 18, closed: true, status: "recognised", baseline: BASELINE, measures: [measure({})], reward: { rule: "thanks", amount: null, note: "Well done", day: 0 }, history: [rewardEvent] }),
  project({ id: "p_kickoff", number: 19, draft: true, status: "running", startedDay: 4, memberUserIds: ["u_hs"], sponsorUserId: "u_sp", followerUserIds: ["u_fol"],
    goal: { goal: "Faster changeover", doneWhen: "Under 30 minutes", doneBy: null, brief: "" },
    steps: [{ text: "Measure today", owner: "L. Brandt" }, { text: "Order the cart", owner: null }] }),
  project({ id: "p_kickoff_bare", number: 20, draft: true, status: "running", startedDay: 4, memberUserIds: ["u_hs"] }),
];

export const STATE = { day: 0, cases, projects, ideas: [], problems: [], ledger: {}, rules: RULES, seats: SEATS, routes: ROUTES, clock: { mode: "demo" } } as unknown as State;

export type FixtureEvent = { name: string; ev: CaseEvent };
const e = (name: string, ev: CaseEvent): FixtureEvent => ({ name, ev });

export const EVENTS: FixtureEvent[] = [
  e("case.discussion", event("case.discussion", "u_tv", "c_disc", { invited: ["H. Sander", "M. Roth", "T. Vogel"], invitedUserIds: ["u_hs", "u_mr", "u_tv"], missing: "The saving" })),
  e("case.invited", event("case.invited", "u_tv", "c_disc", { invited: ["H. Sander"], invitedUserIds: ["u_hs"] })),
  e("case.checkin ready", event("case.checkin", "u_tv", "c_disc", { next: "decide", open: ["Cost"], note: "Quote is in" })),
  e("case.checkin next", event("case.checkin", "u_tv", "c_disc_next", { next: "again" })),
  e("case.asked", event("case.asked", "u_tv", "c_asked", { text: "Which line?" })),
  e("case.answered", event("case.answered", "u_js", "c_answered", { text: "Line 3" })),
  e("case.unanswered", event("case.unanswered", null, "c_unanswered", {})),
  e("case.withdrawn", event("case.withdrawn", "u_js", "c_withdrawn", {})),
  e("case.withdrawn plain", event("case.withdrawn", "u_js", "c_withdrawn_plain", {})),
  e("case.handed by a person", event("case.handed", "u_tv", "c_handed", { to: "H. Sander", toRoleHolderId: "seat_hs", why: "Out of office" })),
  e("case.handed vacant", event("case.handed", null, "c_handed", { to: "H. Sander", toRoleHolderId: "seat_hs", why: "vacant" })),
  e("case.handed deadline", event("case.handed", null, "c_handed", { to: "H. Sander", toRoleHolderId: "seat_hs", why: "deadline" })),
  ...[0, 1, 2, 3, 4].map((i) => e("case.decided no, reason id " + i, event("case.decided", "u_tv", "c_no_" + i, { answer: "no" }))),
  e("case.decided no, free reason", event("case.decided", "u_tv", "c_no_free", { answer: "no" })),
  e("case.decided no, no reason", event("case.decided", "u_tv", "c_no_none", { answer: "no" })),
  e("case.decided yes, no project", event("case.decided", "u_tv", "c_yes_plain", { answer: "yes" })),
  e("case.decided yes, legacy project", event("case.decided", "u_tv", "c_yes_legacy", { answer: "yes", projectId: "p_legacy", lead: "L. Brandt", leadUserId: "u_lb" })),
  e("case.decided yes, draft, lead asked", event("case.decided", "u_tv", "c_yes_draft", { answer: "yes", projectId: "p_draft", lead: "L. Brandt", leadUserId: "u_lb", draft: true })),
  e("case.decided yes, draft, lead taken", event("case.decided", "u_tv", "c_yes_draft_taken", { answer: "yes", projectId: "p_draft_taken", lead: "T. Vogel", leadUserId: "u_tv", draft: true })),
  e("case.decided yes, joined a draft", event("case.decided", "u_tv", "c_yes_join", { answer: "yes", projectId: "p_draft", draft: true })),
  e("project.handed", event("project.handed", "u_tv", "p_handed", { to: "L. Brandt", toUserId: "u_lb", why: "You know the line" })),
  e("project.stopped", event("project.stopped", "u_lb", "p_stopped", { why: "No budget" }, "ev_stop")),
  e("project.lead.answered declined", event("project.lead.answered", "u_lb", "p_back", { take: false, reason: "No time" })),
  e("project.lead.answered lapsed", event("project.lead.answered", null, "p_back", { take: false, lapsed: true })),
  e("project.lead.answered taken", event("project.lead.answered", "u_lb", "p_back", { take: true })),
  e("project.invited contributor", event("project.invited", "u_lb", "p_inv", { userId: "u_inv", role: "contributor" }, "inv_contrib")),
  e("project.invited follower", event("project.invited", "u_lb", "p_inv", { userId: "u_fol", role: "follower" })),
  e("project.invited on a private idea", event("project.invited", "u_lb", "p_inv_closed", { userId: "u_inv", role: "sponsor" }, "inv_sponsor")),
  e("project.invite.answered declined", event("project.invite.answered", "u_inv", "p_inv_ans", { inviteId: "inv_declined", userId: "u_inv", take: false, reason: "No time this quarter" })),
  e("project.invite.answered lapsed", event("project.invite.answered", null, "p_inv_ans", { inviteId: "inv_lapsed", userId: "u_hs", take: false, lapsed: true })),
  e("project.start.moved", event("project.start.moved", "u_tv", "p_moved", { dueDay: 12, why: "Waiting for the part" })),
  e("project.member", event("project.member", "u_lb", "p_member", { name: "H. Sander", userId: "u_hs", on: true })),
  e("project.member off", event("project.member", "u_lb", "p_member", { name: "H. Sander", userId: "u_hs", on: false })),
  e("project.started", event("project.started", "u_lb", "p_started", {})),
  e("project.started, draft kickoff", event("project.started", "u_lb", "p_kickoff", {})),
  e("project.started, bare draft kickoff", event("project.started", "u_lb", "p_kickoff_bare", {})),
  e("project.done, closes", event("project.done", "u_lb", "p_done", {}, "ev_done")),
  e("project.measured better", event("project.measured", "u_lb", "p_measured_better", { check: 30, value: 30 })),
  e("project.measured worse", event("project.measured", "u_lb", "p_measured_worse", { check: 30, value: 55 })),
  e("project.measured, waits for a second person", event("project.measured", "u_lb", "p_measured_open", { check: 30, value: 30 })),
  e("project.measure.confirmed, closes", event("project.measure.confirmed", "u_hs", "p_closed_confirm", { check: 30 }, "ev_confirmed")),
  e("project.measure.confirmed, does not close", event("project.measure.confirmed", "u_hs", "p_measured_better", { check: 30 })),
  e("project.rewarded, closes", event("project.rewarded", "u_mg", "p_recognised", { rule: "thanks" }, "ev_reward")),
  e("a type the notices do not handle", event("case.read", "u_hs", "c_asked", {})),
];
