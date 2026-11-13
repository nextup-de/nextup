// Plan SET, SET-E1: what each person hears about a draft. The drafts are built from the SET-G1 types: a legacy log is
// reduced and the draft's state is set by hand (the reducer's own part is tested in tests/unit/set/reduce.test.ts).
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { loopMails, type Person } from "@/features/loop/notice";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { planNotices, type PlanCtx, type PlanPerson } from "@/features/notify/plan";
import { renderTemplate, REMINDER_KINDS } from "@/features/notify/templates";
import type { Invite, ReducedProject } from "@/features/projects/types";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";

const seats: SeatRow[] = [
  { id: "s_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "s_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 1 },
  { id: "s_head2", roleId: "role_head", label: "K. Head Two", userId: "u_head2", sort: 2 },
];
const routes = LOCAL_SEED.routes.map((r) => (r.id === "r1" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_tv" } : r));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats };
const UID: Record<string, string> = { "T. Vogel": "u_tv", "L. Brandt": "u_lb", "H. Sander": "u_hs", "M. Roth": "u_mr", "C. Ilg": "u_ci", "K. Head": "u_head", "J. Schmidt": "u_js" };
const people: Person[] = [
  { id: "u_js", name: "J. Schmidt", email: "js@acme.test" },
  { id: "u_tv", name: "T. Vogel", email: "tv@acme.test" },
  { id: "u_lb", name: "L. Brandt", email: "lb@acme.test" },
  { id: "u_hs", name: "H. Sander", email: "hs@acme.test" },
  { id: "u_mr", name: "M. Roth", email: "mr@acme.test" },
  { id: "u_ci", name: "C. Ilg", email: "ci@acme.test" },
  { id: "u_head", name: "K. Head", email: "head@acme.test" },
];
const BASE = "https://acme.sellux.ch";

let n = 0;
const ev = (type: CaseEventType, actor: string | null, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "s" + n++, ts: 0, type, actor: actor ?? "system:clock", actorUserId: actor ? UID[actor] ?? null : null, target, payload, day });
const raised = (more: EventPayload = {}) => ev("case.raised", "J. Schmidt", "c_m", { kind: "idea", title: "Shorter changeover", body: "x", routeId: "r1", assignee: "T. Vogel", ...more });
const yes = (more: EventPayload = {}, lead = "L. Brandt") =>
  ev("case.decided", "T. Vogel", "c_m", { answer: "yes", projectId: "p_m", lead, leadUserId: UID[lead], title: "Changeover cart", ...more });
const draftYes = (more: EventPayload = {}, lead = "L. Brandt") => yes({ draft: true, raiserNote: "Thanks - please make it small", ...more }, lead);
const P = (type: CaseEventType, actor: string | null, payload: EventPayload = {}, day = 0) => ev(type, actor, "p_m", payload, day);

type Patch = Partial<ReducedProject>;
/** The state after `events`, with the draft's own state set by hand on project p_m. */
function stateOf(events: CaseEvent[], patch: Patch = {}, first = raised()): State {
  const state = reduce(SEED, { events: [first, ...events], day: events[events.length - 1].day });
  const p = state.projects[0];
  p.authorUserIds = ["u_js"]; // the raiser's id reaches it through the case reducer; here by hand
  Object.assign(p, patch);
  return state;
}
const draft = (over: Patch = {}): Patch => ({ draft: true, deciderUserId: "u_tv", raiserNote: "Thanks - please make it small", leadState: "taken", ...over });
const mails = (last: CaseEvent, before: CaseEvent[], patch: Patch = {}, first = raised()) =>
  loopMails({ ev: last, state: stateOf([...before, last], patch, first), people, baseUrl: BASE });
const invite = (over: Partial<Invite> & Pick<Invite, "id" | "userId" | "role">): Invite => ({ state: "pending", day: 0, reason: "", ...over });

describe("SET notices", () => {
  it("a draft yes tells the raiser the line and who sets it up, and asks a lead who is not the decider to take it", () => {
    const out = mails(draftYes(), [], draft({ leadState: "pending", leadAskedDay: 0 }));
    expect(out.map((m) => [m.to, m.subject])).toEqual([
      ["js@acme.test", "Your idea was accepted: Shorter changeover"],
      ["lb@acme.test", "Lead a project: Changeover cart"],
    ]);
    expect(out[0].text).toContain("is being set up by L. Brandt");
    expect(out[0].text).toContain("T. Vogel adds: Thanks - please make it small");
    expect(out[0].text).toContain(`${BASE}/projects/p_m`);
    expect(out[1].text).toContain("asks you to lead it as P-1");
    expect(out[1].text).toContain("Take it or decline it");
    expect(out[1].text).toContain(`${BASE}/projects/p_m`);
    expect(out[1].text).not.toContain("Take the number");
  });

  it("a draft yes the decider leads themself tells only the raiser; without a line there is no line", () => {
    const own = mails(draftYes({}, "T. Vogel"), [], draft({ leadState: "taken" }));
    expect(own.map((m) => m.to)).toEqual(["js@acme.test"]);
    const plain = mails(draftYes({ raiserNote: undefined }), [], draft({ leadState: "pending", raiserNote: "" }));
    expect(plain[0].text).not.toContain("adds:");
  });

  it("a yes that joins a draft already open is told as before, and so is a yes without draft", () => {
    // A second case joins p_m: the draft fields of its yes are ignored, so its mails are the legacy ones.
    const other = ev("case.raised", "J. Schmidt", "c_o", { kind: "idea", title: "Other idea", body: "x", routeId: "r1", assignee: "T. Vogel" });
    const join = ev("case.decided", "T. Vogel", "c_o", { answer: "yes", projectId: "p_m", draft: true, raiserNote: "ignored" });
    const out = loopMails({ ev: join, state: stateOf([draftYes(), other, join], draft()), people, baseUrl: BASE });
    expect(out.map((m) => m.subject)).toEqual(["Your idea was accepted: Other idea", "You lead P-1: Changeover cart"]);
    expect(out[0].text).toContain("It is now P-1 \"Changeover cart\", led by L. Brandt.");
    expect(out[0].text).not.toContain("being set up");
  });

  it("a legacy yes plans exactly today's mails", () => {
    const out = mails(yes(), []);
    expect(out.map((m) => [m.to, m.subject])).toEqual([
      ["js@acme.test", "Your idea was accepted: Shorter changeover"],
      ["lb@acme.test", "You lead P-1: Changeover cart"],
    ]);
    expect(out[0].text).toBe([
      "J. Schmidt,", "",
      "T. Vogel said yes. It is now P-1 \"Changeover cart\", led by L. Brandt.", "",
      "You will hear when it starts, when it is done, and what it changed.", "",
      `${BASE}/projects/p_m`,
    ].join("\n"));
    expect(out[1].text).toBe([
      "L. Brandt,", "",
      "T. Vogel accepted this idea and named you as its lead.", "",
      "Take the number to measure it against, then start it - due in 5 days.", "",
      `${BASE}/projects/p_m`,
    ].join("\n"));
    // The new events on a project that is not a draft tell nobody.
    const legacy = [yes()];
    for (const e of [
      P("project.lead.answered", "L. Brandt", { take: false }), P("project.invited", "L. Brandt", { userId: "u_hs", role: "member" }),
      P("project.invite.answered", "H. Sander", { userId: "u_hs", take: false }), P("project.start.moved", "K. Head", { dueDay: 30, why: "x" }),
    ]) expect(mails(e, legacy)).toEqual([]);
  });

  it("a decline or a lapse tells the decider the draft is back with them, with the reason", () => {
    const back = draft({ leadUserId: "u_tv", lead: "T. Vogel" });
    const declined = mails(P("project.lead.answered", "L. Brandt", { take: false, reason: "No capacity before March" }, 3), [draftYes()], back);
    expect(declined.map((m) => [m.to, m.subject])).toEqual([["tv@acme.test", "Back with you: P-1 Changeover cart"]]);
    expect(declined[0].text).toContain("L. Brandt declined to lead it. You lead it now.");
    expect(declined[0].text).toContain("The reason given: No capacity before March");
    const lapsed = mails(P("project.lead.answered", null, { take: false, lapsed: true }, 5), [draftYes()], back);
    expect(lapsed.map((m) => m.to)).toEqual(["tv@acme.test"]);
    expect(lapsed[0].text).toContain("Nobody answered in time. You lead it now.");
    expect(lapsed[0].text).not.toContain("reason given");
    // A taking, and an answer the reducer did not take (the decider does not lead), tell nobody.
    expect(mails(P("project.lead.answered", "L. Brandt", { take: true }, 3), [draftYes()], draft())).toEqual([]);
    expect(mails(P("project.lead.answered", "L. Brandt", { take: false }, 3), [draftYes()], draft({ leadUserId: "u_lb" }))).toEqual([]);
  });

  it("an invitation mails the person with the role and the link; a follower is told they follow", () => {
    const inv = P("project.invited", "L. Brandt", { userId: "u_hs", role: "sponsor" }, 2);
    const out = mails(inv, [draftYes()], draft({ invites: [invite({ id: inv.id, userId: "u_hs", role: "sponsor" })] }));
    expect(out.map((m) => [m.to, m.subject])).toEqual([["hs@acme.test", "You are invited to P-1: Changeover cart"]]);
    expect(out[0].text).toContain("L. Brandt invites you to P-1 \"Changeover cart\" as sponsor.");
    expect(out[0].text).toContain("Accept or decline in your inbox:");
    expect(out[0].text).toContain(`${BASE}/projects/p_m`);
    expect(out[0].text).not.toContain("not open to everyone");
    const follow = P("project.invited", "L. Brandt", { userId: "u_ci", role: "follower" }, 2);
    const f = mails(follow, [draftYes()], draft({ followerUserIds: ["u_ci"] }));
    expect(f.map((m) => [m.to, m.subject])).toEqual([["ci@acme.test", "You follow P-1: Changeover cart"]]);
    expect(f[0].text).toContain("added you as a follower");
    // An invitation the reducer refused is not told.
    // (The reducer takes both events now, so the state is set back by hand to the one a refusal leaves.)
    expect(mails(inv, [draftYes()], draft({ invites: [] }))).toEqual([]);
    expect(mails(follow, [draftYes()], draft({ followerUserIds: [] }))).toEqual([]);
  });

  it("an invitation on a private or custom idea says that being invited lets the person read it", () => {
    for (const visibility of ["private", "custom"] as const) {
      const inv = P("project.invited", "L. Brandt", { userId: "u_hs", role: "member" }, 2);
      const out = mails(inv, [draftYes()], draft({ invites: [invite({ id: inv.id, userId: "u_hs", role: "member" })] }), raised({ visibility }));
      expect(out[0].text).toContain("Being invited lets you read it.");
    }
  });

  it("a declined or lapsed invitation tells the lead, with the reason for a decline", () => {
    const inv = invite({ id: "inv1", userId: "u_hs", role: "member" });
    const no = P("project.invite.answered", "H. Sander", { inviteId: "inv1", userId: "u_hs", take: false, reason: "Too busy" }, 3);
    const declined = mails(no, [draftYes()], draft({ invites: [{ ...inv, state: "declined", reason: "Too busy" }] }));
    expect(declined.map((m) => [m.to, m.subject])).toEqual([["lb@acme.test", "Invitation declined: P-1 Changeover cart"]]);
    expect(declined[0].text).toContain("H. Sander declined to be member.");
    expect(declined[0].text).toContain("The reason given: Too busy");
    const lapse = P("project.invite.answered", null, { inviteId: "inv1", userId: "u_hs", take: false, lapsed: true }, 7);
    const lapsed = mails(lapse, [draftYes()], draft({ invites: [{ ...inv, state: "lapsed" }] }));
    expect(lapsed.map((m) => [m.to, m.subject])).toEqual([["lb@acme.test", "Invitation lapsed: P-1 Changeover cart"]]);
    expect(lapsed[0].text).toContain("H. Sander did not answer the invitation as member in time");
    // An acceptance tells the lead nothing; the raiser hears who joined (plan REM, Q5.14).
    const yesAnswer = P("project.invite.answered", "H. Sander", { inviteId: "inv1", userId: "u_hs", take: true }, 3);
    expect(mails(yesAnswer, [draftYes()], draft({ invites: [{ ...inv, state: "accepted" }] })).map((m) => m.to)).toEqual(["js@acme.test"]);
  });

  it("the kickoff tells team, sponsor and followers the goal and first steps, and the raiser today's started mail", () => {
    const steps = [
      { id: "t1", text: "Try it at one station", owner: "H. Sander" }, { id: "t2", text: "Make it the standard", owner: null },
    ].map((s) => ({ ...s, ownerUserId: null, dueDay: null, column: "todo" as const, why: "", note: "", addedDay: 0, by: "x", movedDay: 0, startedDay: null, doneDay: null, external: null }));
    const start = P("project.started", "L. Brandt", {}, 4);
    const log = [draftYes(), P("project.baseline", "L. Brandt", { metric: "m", unit: "min", value: 42, better: "down" }), start];
    const out = mails(start, log, draft({
      memberUserIds: ["u_hs"], sponsorUserId: "u_mr", followerUserIds: ["u_ci", "u_js"], steps,
      goal: { goal: "Changeover under 30 minutes", doneWhen: "Three shifts in a row", doneBy: null, brief: "" },
    }));
    expect(out.map((m) => m.to)).toEqual(["js@acme.test", "hs@acme.test", "mr@acme.test", "ci@acme.test"]);
    expect(out.slice(1).map((m) => m.subject)).toEqual(Array(3).fill("P-1 has started: Changeover cart"));
    // The raiser is also a follower: they get the started mail once.
    expect(out[0].text).toContain("has started.");
    expect(out[1].text).toContain("Goal: Changeover under 30 minutes");
    expect(out[1].text).toContain("Done when: Three shifts in a row");
    expect(out[1].text).toContain("First steps:");
    expect(out[1].text).toContain("  Try it at one station - H. Sander");
    expect(out[1].text).toContain("  Make it the standard - nobody yet");
    // A legacy project's start tells the raiser only, as today.
    expect(mails(start, [yes(), P("project.baseline", "L. Brandt", { metric: "m", unit: "min", value: 42, better: "down" })]).map((m) => m.to)).toEqual(["js@acme.test"]);
  });

  it("a stopped draft tells the raiser why, and the lead who had not taken it, too", () => {
    const stop = P("project.stopped", "K. Head", { why: "Not this quarter" }, 12);
    const out = mails(stop, [draftYes()], draft({ leadState: "pending" }));
    expect(out.map((m) => m.to).sort()).toEqual(["js@acme.test", "lb@acme.test"]);
    for (const m of out) {
      expect(m.text).toContain("Not this quarter");
      expect(m.subject).toBe("P-1 stopped: Changeover cart");
    }
  });

  it("a moved start day tells the lead the new day and why", () => {
    const moved = P("project.start.moved", "K. Head", { dueDay: 20, why: "Supplier is late" }, 12);
    const out = mails(moved, [draftYes()], draft({ startDay: 20 }));
    expect(out.map((m) => [m.to, m.subject])).toEqual([["lb@acme.test", "New start day: P-1 Changeover cart"]]);
    expect(out[0].text).toContain("moved the start day of this project: in 8 days.");
    expect(out[0].text).toContain("The reason given: Supplier is late");
    expect(mails(moved, [draftYes()], draft({ startDay: null }))).toEqual([]);
  });

  it("speaks German and every new key exists in both languages", () => {
    const state = stateOf([draftYes()], draft({ leadState: "pending" }));
    const out = loopMails({ ev: draftYes(), state, people, baseUrl: BASE }, "de");
    expect(out[1].subject).toBe("Ein Projekt leiten: Changeover cart");
    expect(out[0].text).toContain("wird von L. Brandt aufgesetzt");
    const keys = Object.keys(en.mail).filter((k) => /^(acceptedDraft|acceptedNote|draft|invite|follow|kickoff|startMoved|someone|reminder(Lead|Invite|Draft))/.test(k));
    expect(keys.length).toBeGreaterThan(40);
    for (const k of keys) expect(de.mail, k).toHaveProperty(k);
  });
});

// ── reminders ─────────────────────────────────────────────────────────────────────────────────────────────────
const planPeople: PlanPerson[] = [
  { id: "u_tv", email: "tv@x.test", locale: "en", name: "T. Vogel" },
  { id: "u_lb", email: "lb@x.test", locale: "en", name: "L. Brandt" },
  { id: "u_hs", email: "hs@x.test", locale: "en", name: "H. Sander" },
  { id: "u_head", email: "head@x.test", locale: "en", name: "K. Head" },
  { id: "u_head2", email: "head2@x.test", locale: "de", name: "K. Head Two" },
  { id: "u_js", email: "js@x.test", locale: "en", name: "J. Schmidt" },
];
const ON = { stage: "pilot", notifications: true, n8n: false };
const due = (payload: EventPayload) => ev("clock.due", null, "p_m", payload, 12);
function plan(fact: CaseEvent, patch: Patch) {
  const state = stateOf([draftYes(), fact], patch);
  const ctx: PlanCtx = { companyId: "co1", state, people: planPeople, prefs: [], company: ON, subscriptions: [], baseUrl: BASE };
  return planNotices(fact, ctx).filter((d) => d.channel !== "inapp");
}

describe("SET notices: reminders", () => {
  it("has the three new kinds, each with a subject and the project's link", () => {
    expect(REMINDER_KINDS).toEqual(expect.arrayContaining(["lead", "invite", "draft"]));
    for (const template of ["reminder.lead", "reminder.invite", "reminder.draft"] as const) {
      for (const locale of ["en", "de"] as const) {
        for (const reader of [undefined, "above"] as const) {
          const r = renderTemplate(template, locale, { name: "X", title: "Cart", day: 3, link: `${BASE}/projects/p_m`, reader });
          expect(r.subject, template).toContain("Cart");
          expect(r.text).toContain(`${BASE}/projects/p_m`);
        }
      }
    }
    expect(renderTemplate("reminder.lead", "en", { title: "Cart", link: "u" }).subject).toBe("Please take or decline: Cart");
    expect(renderTemplate("reminder.draft", "en", { title: "Cart", day: 3, link: "u" }).text).toContain("start day of this project has passed");
    expect(renderTemplate("reminder.draft", "en", { title: "Cart", day: 3, link: "u", reader: "above" }).text).toContain("Keep it with a new date, hand the lead on or stop it");
  });

  it("a lead reminder goes to the pending lead only", () => {
    const rows = plan(due({ kind: "lead", dueDay: 2, userId: "u_lb" }), draft({ leadState: "pending", leadUserId: "u_lb" }));
    expect(rows.map((r) => [r.recipientUserId, r.template, r.channel])).toEqual([["u_lb", "reminder.lead", "mail"]]);
    expect(rows[0].subject).toBe("Please take or decline: Changeover cart");
    expect(rows[0].link).toBe(`${BASE}/projects/p_m`);
    // Once the lead took it, there is nothing to remind.
    expect(plan(due({ kind: "lead", dueDay: 2, userId: "u_lb" }), draft({ leadState: "taken", leadUserId: "u_lb" }))).toEqual([]);
  });

  it("an invite reminder goes to the invited person while their invitation is open", () => {
    const open = invite({ id: "inv1", userId: "u_hs", role: "member" });
    const rows = plan(due({ kind: "invite", dueDay: 2, userId: "u_hs", inviteId: "inv1" }), draft({ invites: [open] }));
    expect(rows.map((r) => [r.recipientUserId, r.template])).toEqual([["u_hs", "reminder.invite"]]);
    expect(plan(due({ kind: "invite", dueDay: 2, userId: "u_hs", inviteId: "inv1" }), draft({ invites: [{ ...open, state: "accepted" }] }))).toEqual([]);
    expect(plan(due({ kind: "invite", dueDay: 2, userId: "u_hs", inviteId: "other" }), draft({ invites: [open] }))).toEqual([]);
  });

  it("a draft reminder goes to the lead and every holder of the seat above; the second one to the seat only", () => {
    const fact = { kind: "draft", dueDay: 10, toRoleHolderId: "s_head", userId: "u_lb" } as const;
    const rows = plan(due(fact), draft({ leadUserId: "u_lb" }));
    expect(rows.map((r) => [r.recipientUserId, r.template]).sort()).toEqual([["u_head", "reminder.draft"], ["u_head2", "reminder.draft"], ["u_lb", "reminder.draft"]]);
    const text = (id: string) => rows.find((r) => r.recipientUserId === id)!;
    expect(text("u_lb").subject).toBe("The start day has passed: Changeover cart");
    expect(text("u_head").subject).toBe("Not started yet: Changeover cart");
    expect(text("u_head").text).toContain("Keep it with a new date, hand the lead on or stop it");
    expect(text("u_head2").locale).toBe("de");
    const second = plan(due({ ...fact, check: 3 }), draft({ leadUserId: "u_lb" }));
    expect(second.map((r) => r.recipientUserId).sort()).toEqual(["u_head", "u_head2"]);
    // A draft that started, or stopped, reminds nobody.
    expect(plan(due(fact), draft({ leadUserId: "u_lb", startedDay: 11 }))).toEqual([]);
  });
});
