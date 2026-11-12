// REM-N1 (plan REM; Q2.13, Q5.14, P5.4, Q7.16): the loop tells the desk about a revised case, the raiser about a joined invitee, the team the rhythm
// of the kickoff and the readers that an update was drafted with AI. Fixed logs through loopMails, as tests/unit/set/notice.test.ts does.
// Flat top-level tests (D2): each name is what the proof's pattern says.
import { expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { loopMails, type Person } from "@/features/loop/notice";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import type { SeedRole } from "@/features/demo/types";
import type { Invite, ReducedProject } from "@/features/projects/types";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";

const seats: SeatRow[] = [
  { id: "s_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "s_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 1 },
];
const roles: SeedRole[] = [
  { id: "role_head", orgUnitId: "u", reportsToId: null, title: "Director" },
  { id: "role_owner", orgUnitId: "u", reportsToId: "role_head", title: "Quality lead" },
];
const routes = LOCAL_SEED.routes.map((r) => (r.id === "r1" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_tv" } : r));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, roles };
const UID: Record<string, string> = { "T. Vogel": "u_tv", "L. Brandt": "u_lb", "H. Sander": "u_hs", "M. Roth": "u_mr", "K. Head": "u_head", "J. Schmidt": "u_js" };
const people: Person[] = [
  { id: "u_js", name: "J. Schmidt", email: "js@acme.test" },
  { id: "u_tv", name: "T. Vogel", email: "tv@acme.test" },
  { id: "u_lb", name: "L. Brandt", email: "lb@acme.test" },
  { id: "u_hs", name: "H. Sander", email: "hs@acme.test" },
  { id: "u_mr", name: "M. Roth", email: "mr@acme.test" },
  { id: "u_head", name: "K. Head", email: "head@acme.test" },
];
const BASE = "https://acme.sellux.ch";

let n = 0;
const ev = (type: CaseEventType, actor: string, target: string, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "r" + n++, ts: 0, type, actor, actorUserId: UID[actor] ?? null, target, payload, day });
const raised = (actor = "J. Schmidt") =>
  ev("case.raised", actor, "c_m", { kind: "idea", title: "Shorter changeover", body: "x", routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "s_tv" });
const C = (type: CaseEventType, actor: string, payload: EventPayload = {}, day = 1) => ev(type, actor, "c_m", payload, day);
const P = (type: CaseEventType, actor: string, payload: EventPayload = {}, day = 1) => ev(type, actor, "p_m", payload, day);
const draftYes = () => C("case.decided", "T. Vogel", { answer: "yes", projectId: "p_m", lead: "L. Brandt", leadUserId: "u_lb", title: "Changeover cart", draft: true }, 0);

/** The state after the events, with the raiser's own id on the project and the project's own state set by hand. */
function stateOf(events: CaseEvent[], patch: Partial<ReducedProject> = {}, first = raised()): State {
  const state = reduce(SEED, { events: [first, ...events], day: events[events.length - 1].day });
  const project = state.projects[0];
  if (project) { project.authorUserIds = ["u_js"]; Object.assign(project, patch); }
  return state;
}
const mails = (last: CaseEvent, before: CaseEvent[], patch: Partial<ReducedProject> = {}, first = raised(), locale: "en" | "de" = "en") =>
  loopMails({ ev: last, state: stateOf([...before, last], patch, first), people, baseUrl: BASE }, locale);
const invite = (over: Partial<Invite> & Pick<Invite, "id" | "userId" | "role">): Invite => ({ state: "pending", day: 0, reason: "", ...over });

// A discussion the desk opened: H. Sander and M. Roth and the raiser are invited, and M. Roth says it is not for them.
const TALK = [
  C("case.discussion", "T. Vogel", { invited: ["H. Sander", "M. Roth", "J. Schmidt"], invitedUserIds: ["u_hs", "u_mr", "u_js"], missing: "The saving" }),
  C("case.invite.declined", "M. Roth", { why: "Not for me" }),
];
const revised = (actor: string, body = "A better body", title?: string) => C("case.revised", actor, { body, ...(title ? { title } : {}) }, 2);

it("REM notices tells the desk of a revised case", () => {
  const out = mails(revised("J. Schmidt", "A better body", "Shorter changeover v2"), TALK);
  // The desk's holder and the invitee who did not decline; one mail each.
  expect(out.map((m) => m.to).sort()).toEqual(["hs@acme.test", "tv@acme.test"]);
  for (const m of out) {
    expect(m.subject).toBe("A new version of an idea: Shorter changeover v2");
    expect(m.text).toContain("J. Schmidt wrote version 2 of this idea:");
    expect(m.text).toContain(`${BASE}/cases/c_m`);
  }
  // A case without a discussion: the desk alone.
  expect(mails(revised("J. Schmidt"), []).map((m) => m.to)).toEqual(["tv@acme.test"]);
  // A revision the reducer ignored (no text) tells nobody, and neither does one on a decided case.
  expect(mails(C("case.revised", "J. Schmidt", { body: "  " }, 2), TALK)).toEqual([]);
  expect(mails(C("case.revised", "J. Schmidt", { body: "Later" }, 3), [C("case.decided", "T. Vogel", { answer: "no", reason: "Not this year, the budget is gone" })])).toEqual([]);
  // In German, with the same words as the key says.
  expect(mails(revised("J. Schmidt"), [], {}, raised(), "de")[0].subject).toBe("Eine neue Fassung einer Idee: Shorter changeover");
});

it("REM notices never tells the reviser", () => {
  // The raiser is invited to the discussion too, and the desk's holder revises it as well: whoever wrote the version is not told of it.
  const byRaiser = mails(revised("J. Schmidt"), TALK);
  expect(byRaiser.map((m) => m.to)).not.toContain("js@acme.test");
  const byDesk = mails(revised("T. Vogel"), TALK);
  expect(byDesk.map((m) => m.to)).not.toContain("tv@acme.test");
  expect(byDesk.map((m) => m.to).sort()).toEqual(["hs@acme.test", "js@acme.test"]);
});

const ACCEPTED = P("project.invite.answered", "L. Brandt", { take: true, inviteId: "i1", userId: "u_lb" });
const joined = (state: Partial<Invite> = {}, first = raised(), role: Invite["role"] = "member") =>
  mails(ACCEPTED, [draftYes()], { draft: true, leadState: "taken", leadUserId: "u_tv", invites: [invite({ id: "i1", userId: "u_lb", role, state: "accepted", ...state })] }, first);

it("REM notices tells the raiser an invitee joined", () => {
  const out = joined();
  expect(out.map((m) => [m.to, m.subject])).toEqual([["js@acme.test", "Someone joined: P-1 Changeover cart"]]);
  expect(out[0].text).toContain("L. Brandt accepted the invitation as member on the project that grew from your idea.");
  expect(out[0].text).toContain(`${BASE}/projects/p_m`);
  // A sponsor says so, and a decline is still the lead's news, not the raiser's.
  expect(joined({}, raised(), "sponsor")[0].text).toContain("as sponsor");
  const declined = mails(P("project.invite.answered", "L. Brandt", { take: false, inviteId: "i1", userId: "u_lb", reason: "No time" }), [draftYes()],
    { draft: true, leadState: "taken", leadUserId: "u_tv", invites: [invite({ id: "i1", userId: "u_lb", role: "member", state: "declined", reason: "No time" })] });
  expect(declined.map((m) => m.to)).toEqual(["tv@acme.test"]);
  expect(joined({}, raised(), "member").length).toBe(1);
  // In German.
  const german = mails(ACCEPTED, [draftYes()], { draft: true, leadState: "taken", leadUserId: "u_tv", invites: [invite({ id: "i1", userId: "u_lb", role: "member", state: "accepted" })] }, raised(), "de");
  expect(german[0].subject).toContain("Jemand ist dabei");
});

it("REM notices keeps an anonymous raiser out", () => {
  // Raised under a handle: the account behind it is never mailed, as nobody learns who it is.
  const anonymous = { ...raised("Anonymous #1001"), actorUserId: "u_js" };
  const out = joined({}, anonymous);
  expect(out).toEqual([]);
  expect(joined().length, "the same invitee, raised by name").toBe(1);
});

it("REM notices kickoff names the check-in day", () => {
  const started = P("project.started", "L. Brandt", {}, 5);
  // The raiser gets the step mail of the start; the kickoff itself goes to the team, the sponsor and the followers.
  const kickoff = (patch: Partial<ReducedProject>, locale: "en" | "de" = "en") =>
    mails(started, [draftYes()], { draft: true, leadState: "taken", leadUserId: "u_lb", memberUserIds: ["u_hs"], startedDay: 5, ...patch }, raised(), locale).filter((m) => m.to === "hs@acme.test");
  const out = kickoff({ checkInWeekday: 3 });
  expect(out).toHaveLength(1);
  expect(out[0].text).toContain("The team checks in every Wednesday.");
  expect(kickoff({ checkInWeekday: 5 })[0].text).toContain("every Friday.");
  expect(kickoff({ checkInWeekday: 3 }, "de")[0].text).toContain("Das Team trifft sich jeden Mittwoch zum Check-in.");
  // Nothing set: the mail says nothing of a rhythm.
  expect(kickoff({ checkInWeekday: null })[0].text).not.toContain("checks in");
});

it("REM notices marks an AI drafted update", () => {
  const update = (payload: EventPayload, locale: "en" | "de" = "en") =>
    mails(P("project.update", "T. Vogel", { text: "Cart ordered.", week: 3, ...payload }), [draftYes()], { draft: true, leadState: "taken", leadUserId: "u_tv", sponsorUserId: "u_hs", followerUserIds: [] }, raised(), locale);
  const drafted = update({ aiDrafted: true });
  expect(drafted.map((m) => m.to).sort()).toEqual(["hs@acme.test", "js@acme.test"]);
  // The role of the seat that sent it, by id: the lead is the one who accepted the Report.
  for (const m of drafted) expect(m.text).toContain("Drafted with AI, sent by Quality lead.");
  expect(update({ aiDrafted: true }, "de")[0].text).toContain("Mit KI entworfen, von Quality lead gesendet.");
  // A written update says nothing of it, and the update's own text is still in the mail.
  const written = update({});
  for (const m of written) { expect(m.text).not.toContain("Drafted with AI"); expect(m.text).toContain("Cart ordered."); }
  // A sender without a seat: still marked, without a role.
  const noSeat = mails(P("project.update", "L. Brandt", { text: "Cart ordered.", week: 3, aiDrafted: true }), [draftYes()], { draft: true, leadState: "taken", leadUserId: "u_lb", sponsorUserId: "u_hs" });
  expect(noSeat[0].text).toContain("Drafted with AI.");
  // Every new key exists in both languages with the same placeholders.
  for (const k of ["revisedSubject", "revisedIntro", "revisedNext", "inviteAcceptedSubject", "inviteAcceptedIntro", "kickoffRhythm", "updateDrafted", "updateDraftedPlain"] as const) {
    expect(de.mail, k).toHaveProperty(k);
    expect((de.mail[k].match(/\{\w+\}/g) ?? []).sort(), k).toEqual((en.mail[k].match(/\{\w+\}/g) ?? []).sort());
  }
});
