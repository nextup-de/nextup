// INB-B1: every notice is also in the app, follows the company's channel rule per group, and a duty stays on.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { groupOf, planNotices, type PlanCtx, type PlanPerson } from "@/features/notify/plan";

const seats: SeatRow[] = [
  { id: "s_own1", roleId: "role_owner", label: "Owner One", userId: "u_o1", sort: 0 },
  { id: "s_own2", roleId: "role_owner", label: "Owner Two", userId: "u_o2", sort: 1 },
  { id: "s_dep", roleId: "role_deputy", label: "Deputy", userId: "u_dep", sort: 2 },
  { id: "s_raiser", roleId: "role_member", label: "Raiser", userId: "u_raiser", sort: 3 },
];
const routes = LOCAL_SEED.routes.map((r) =>
  r.id === "r2" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_own1", deputyRoleId: "role_deputy", deputySeatId: "s_dep" } : r,
);
const seed: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats };

const base: PlanPerson[] = [
  { id: "u_o1", email: "o1@x.test", locale: "en", name: "Owner One" },
  { id: "u_o2", email: "o2@x.test", locale: "de", name: "Owner Two" },
  { id: "u_dep", email: "dep@x.test", locale: "en", name: "Deputy" },
  { id: "u_raiser", email: "raiser@x.test", locale: "en", name: "Raiser" },
];

let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string | null, payload: EventPayload = {}): CaseEvent =>
  ({ id: "i" + n++, ts: 0, day: 0, type, actor, actorUserId, target, payload });
const raise = () =>
  ev("case.raised", "Raiser", "u_raiser", "c_a", { kind: "problem", title: "Printer broken", routeId: "r2", assignee: "Owner One", assigneeRoleHolderId: "s_own1" });
const ON = { stage: "pilot", notifications: true, n8n: true };
const ctx = (events: CaseEvent[], over: Partial<PlanCtx> = {}): PlanCtx => ({
  companyId: "co1", state: reduce(seed, { events, day: 1 }), people: base, prefs: [], company: ON, subscriptions: [], baseUrl: "https://app.test/acme", ...over,
});
const plan = (events: CaseEvent[], over: Partial<PlanCtx> = {}) => planNotices(events[events.length - 1], ctx(events, over));
/** `user:channel` of each row, sorted. */
const rows = (d: { recipientUserId: string | null; channel: string }[], user?: string) =>
  d.filter((x) => !user || x.recipientUserId === user).map((x) => `${x.recipientUserId}:${x.channel}`).sort();
const withTeams = (...ids: string[]): PlanPerson[] => base.map((p) => (ids.includes(p.id) ? { ...p, teams: true } : p));

describe("INB channels", () => {
  it("a raise gives each holder of the desk one in-app row, sent, next to the mail row", () => {
    const r = raise();
    const d = plan([r]);
    expect(rows(d)).toEqual(["u_o1:inapp", "u_o1:mail", "u_o2:inapp", "u_o2:mail"]);
    const app = d.find((x) => x.channel === "inapp" && x.recipientUserId === "u_o2")!;
    const mail = d.find((x) => x.channel === "mail" && x.recipientUserId === "u_o2")!;
    expect(app).toMatchObject({ status: "sent", lastError: null, address: null, template: "raised", subject: mail.subject, text: mail.text, link: mail.link, data: mail.data });
    // The in-app key depends on the event and the person only, not on which row carries the pairing key.
    expect(app.key).toBe(`notify:${r.id}:u_o2:app`);
    expect(d.find((x) => x.channel === "mail" && x.recipientUserId === "u_o1")!.key).toBe(`notify:${r.id}`);
  });

  it("rule teams-else-mail: Teams for a person with a bot chat, mail for the rest, an in-app row for both", () => {
    const d = plan([raise()], { teamsOn: true, people: withTeams("u_o1") });
    expect(rows(d)).toEqual(["u_o1:inapp", "u_o1:teams", "u_o2:inapp", "u_o2:mail"]);
    // Teams not working: mail, whatever chats exist.
    expect(rows(plan([raise()], { teamsOn: false, people: withTeams("u_o1") }), "u_o1")).toEqual(["u_o1:inapp", "u_o1:mail"]);
  });

  it("rule both: a mail row and a Teams row where reachable, one in-app row; rule mail: never Teams", () => {
    const people = withTeams("u_o1");
    const both = plan([raise()], { teamsOn: true, people, noticeChannels: { raised: "both" } });
    expect(rows(both)).toEqual(["u_o1:inapp", "u_o1:mail", "u_o1:teams", "u_o2:inapp", "u_o2:mail"]);
    const r = both.filter((x) => x.recipientUserId === "u_o1");
    expect(new Set(r.map((x) => x.key)).size).toBe(3);
    expect(r.find((x) => x.channel === "teams")!.key.endsWith(":teams")).toBe(true);
    const mailOnly = plan([raise()], { teamsOn: true, people, noticeChannels: { raised: "mail" } });
    expect(rows(mailOnly, "u_o1")).toEqual(["u_o1:inapp", "u_o1:mail"]);
    // A group the company did not set keeps the default.
    expect(rows(plan([raise()], { teamsOn: true, people, noticeChannels: { loop: "mail" } }), "u_o1")).toEqual(["u_o1:inapp", "u_o1:teams"]);
  });

  it("a person's +mail:<group> adds mail where the rule chose Teams", () => {
    const people = withTeams("u_o1");
    const prefs = [{ userId: "u_o1", template: "+mail:raised", on: true }, { userId: "u_o2", template: "+mail:raised", on: true }];
    const d = plan([raise()], { teamsOn: true, people, prefs });
    expect(rows(d, "u_o1")).toEqual(["u_o1:inapp", "u_o1:mail", "u_o1:teams"]);
    expect(d.find((x) => x.channel === "mail" && x.recipientUserId === "u_o1")!.key.endsWith(":mail")).toBe(true);
    // u_o2 has no chat: the rule already chose mail, nothing is doubled.
    expect(rows(d, "u_o2")).toEqual(["u_o2:inapp", "u_o2:mail"]);
    // Off, or for another group: nothing added.
    expect(rows(plan([raise()], { teamsOn: true, people, prefs: [{ userId: "u_o1", template: "+mail:raised", on: false }] }), "u_o1")).toEqual(["u_o1:inapp", "u_o1:teams"]);
    expect(rows(plan([raise()], { teamsOn: true, people, prefs: [{ userId: "u_o1", template: "+mail:loop", on: true }] }), "u_o1")).toEqual(["u_o1:inapp", "u_o1:teams"]);
  });

  it("an opt-out does not stop a duty notice; the reminder is still planned and sent", () => {
    const f = ev("clock.due", "system:clock", null, "c_a", { kind: "deadline", dueDay: 3, toRoleHolderId: "s_dep" });
    const d = plan([raise(), f], { prefs: [{ userId: "u_dep", template: "reminder.deadline", on: false }, { userId: "u_o1", template: "*", on: false }] });
    const mine = (u: string) => d.find((x) => x.recipientUserId === u && x.channel === "mail")!;
    expect(mine("u_dep")).toMatchObject({ template: "reminder.deadline", status: "pending", lastError: null });
    expect(mine("u_o1")).toMatchObject({ template: "reminder.deadline", status: "pending" });
    // A reminder that is not a duty still follows the opt-out.
    const c = ev("clock.due", "system:clock", null, "c_a", { kind: "checkin", dueDay: 4 });
    expect(plan([raise(), c], { prefs: [{ userId: "u_o1", template: "reminder.checkin", on: false }] }).find((x) => x.recipientUserId === "u_o1" && x.channel === "mail")!.status).toBe("skipped");
  });

  it("an opt-out for a loop notice skips the mail as before, the in-app row is still written", () => {
    const asked = ev("case.asked", "Owner One", "u_o1", "c_a", { text: "Which printer?" });
    const d = plan([raise(), asked], { prefs: [{ userId: "u_raiser", template: "loop.case.asked", on: false }] });
    expect(rows(d)).toEqual(["u_raiser:inapp", "u_raiser:mail"]);
    expect(d.find((x) => x.channel === "mail")).toMatchObject({ status: "skipped", lastError: "opted out" });
    expect(d.find((x) => x.channel === "inapp")).toMatchObject({ status: "sent", lastError: null, template: "loop.case.asked", key: `loop:${asked.id}:u_raiser:app` });
  });

  it("a loop notice follows the rule: a person with a bot chat gets Teams, nobody gets the in-app row twice", () => {
    const asked = ev("case.asked", "Owner One", "u_o1", "c_a", { text: "Which printer?" });
    expect(rows(plan([raise(), asked], { teamsOn: true, people: withTeams("u_raiser") }))).toEqual(["u_raiser:inapp", "u_raiser:teams"]);
    expect(rows(plan([raise(), asked], { teamsOn: true, people: withTeams("u_raiser"), noticeChannels: { loop: "both" } }))).toEqual(["u_raiser:inapp", "u_raiser:mail", "u_raiser:teams"]);
  });

  it("a member without mail or Teams who is asked a question gets only the in-app row", () => {
    const people = base.map((p) => (p.id === "u_raiser" ? { ...p, email: null } : p));
    const asked = ev("case.asked", "Owner One", "u_o1", "c_a", { text: "Which printer?" });
    const d = plan([raise(), asked], { people, teamsOn: true });
    expect(rows(d)).toEqual(["u_raiser:inapp"]);
    expect(d[0]).toMatchObject({ status: "sent", template: "loop.case.asked", address: null });
    expect(d[0].text).toContain("Which printer?");
  });

  it("a raise to a member who cannot be reached keeps the failed mail row and adds the in-app one", () => {
    const people = base.map((p) => (p.id === "u_o1" ? { ...p, email: null } : p));
    const d = plan([raise()], { people });
    expect(d.filter((x) => x.recipientUserId === "u_o1").map((x) => [x.channel, x.status, x.lastError])).toEqual([
      ["mail", "failed", "no mail address for Owner One"], ["inapp", "sent", null],
    ]);
  });

  it("the clock handing a case to the deputy on a breached date tells the raiser once", () => {
    const late = ev("case.handed", "system:clock", null, "c_a", { to: "Deputy", toRoleHolderId: "s_dep", why: "deadline" });
    const d = plan([raise(), late]);
    expect(rows(d)).toEqual(["u_raiser:inapp", "u_raiser:mail"]);
    const mail = d.find((x) => x.channel === "mail")!;
    expect(mail.template).toBe("loop.case.handed");
    expect(mail.text).toContain("Deputy");
    expect(mail.text).toContain("The answer date stays");
    expect(d.find((x) => x.channel === "inapp")!.key).toBe(`loop:${late.id}:u_raiser:app`);
    // Not when the raiser is the new holder; not for other reasons the clock hands over.
    const own = people_with_raiser_on_deputy_seat();
    expect(planNotices(late, { ...ctx([raise(), late]), state: reduce({ ...seed, seats: own }, { events: [raise(), late], day: 1 }) })).toEqual([]);
  });

  it("a retry after the rule changed writes the same in-app notice, not another copy", () => {
    const r = raise();
    const before = plan([r], { noticeChannels: { raised: "mail" } });
    const after = plan([r], { teamsOn: true, people: withTeams("u_o1", "u_o2"), noticeChannels: { raised: "both" } });
    const appKeys = (d: { channel: string; key: string }[]) => d.filter((x) => x.channel === "inapp").map((x) => x.key).sort();
    expect(appKeys(after)).toEqual(appKeys(before));
    expect(appKeys(after)).toHaveLength(2);
  });

  it("two people sharing an address both get their in-app notice; the address gets one mail", () => {
    const people = base.map((p) => (p.id === "u_o2" ? { ...p, email: "o1@x.test" } : p));
    const asked = ev("case.answered", "Raiser", "u_raiser", "c_a", { text: "Hall 2" });
    const q = ev("case.asked", "Owner One", "u_o1", "c_a", { text: "Which printer?" });
    const d = plan([raise(), q, asked], { people });
    expect(rows(d)).toEqual(["u_o1:inapp", "u_o1:mail", "u_o2:inapp"]);
  });

  it("an inactive user (not among the people) gets no notice at all", () => {
    const people = base.filter((p) => p.id !== "u_o2");
    expect(rows(plan([raise()], { people }))).toEqual(["u_o1:inapp", "u_o1:mail"]);
  });

  it("the in-app row is written on a sandbox company too, while mail stays skipped", () => {
    const d = plan([raise()], { company: { ...ON, stage: "sandbox" } });
    expect(d.filter((x) => x.channel === "mail").every((x) => x.status === "skipped" && x.lastError === "sandbox")).toBe(true);
    expect(d.filter((x) => x.channel === "inapp").every((x) => x.status === "sent" && x.lastError === null)).toBe(true);
  });

  it("groupOf names the group of a template", () => {
    expect([groupOf("raised"), groupOf("loop.case.asked"), groupOf("reminder.deadline"), groupOf("digest"), groupOf("webhook")]).toEqual(["raised", "loop", "reminders", "digest", null]);
  });
});

/** The raiser sits on the deputy desk, so the hand-over is to them. */
function people_with_raiser_on_deputy_seat(): SeatRow[] {
  return seats.map((s) => (s.id === "s_dep" ? { ...s, userId: "u_raiser" } : s));
}
