// NOR-E1: who hears what after the reasoned no (plan NOR, D15). The states are a case from a raise, reduced, then given the
// NOR-G1 fields by hand, so the reducer of NOR-A1 (which runs beside this task) cannot move these cases.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type ReducedCase, type State } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { dateOfWorkday } from "@/features/clock/calendar";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { loopNotices, type NoticePerson } from "@/features/loop/notice";
import { planNotices, type PlanCtx, type PlanPerson } from "@/features/notify/plan";

const seats: SeatRow[] = [
  { id: "s_own1", roleId: "role_owner", label: "Owner One", userId: "u_o1", sort: 0 },
  { id: "s_own2", roleId: "role_owner", label: "Owner Two", userId: "u_o2", sort: 1 },
  { id: "s_dep", roleId: "role_deputy", label: "Deputy", userId: "u_dep", sort: 2 },
  { id: "s_up", roleId: "role_up", label: "Above", userId: "u_up", sort: 3 },
  { id: "s_fb", roleId: "role_fallback", label: "Fallback", userId: "u_fb", sort: 4 },
  { id: "s_raiser", roleId: "role_member", label: "Raiser", userId: "u_raiser", sort: 5 },
];
const routes = LOCAL_SEED.routes.map((r) =>
  r.id === "r2" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_own1", deputyRoleId: "role_deputy", deputySeatId: "s_dep" } : r,
);
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, clock: { mode: "workdays", calendar: DEFAULT_CALENDAR } };

const people: NoticePerson[] = [
  { id: "u_raiser", name: "Raiser", email: "raiser@x.test", handle: "Anonymous #1" },
  { id: "u_o1", name: "Owner One", email: "o1@x.test" },
  { id: "u_o2", name: "Owner Two", email: "o2@x.test" },
  { id: "u_dep", name: "Deputy", email: "dep@x.test" },
  { id: "u_up", name: "Above", email: "up@x.test" },
  { id: "u_fb", name: "Fallback", email: null },
  { id: "u_mgr", name: "Manager", email: "mgr@x.test", manager: true },
  { id: "u_i1", name: "Invitee One", email: "i1@x.test" },
  { id: "u_i2", name: "Invitee Two", email: "i2@x.test" },
  { id: "u_i3", name: "Invitee Three", email: "i3@x.test" },
];
const TODAY = 400;
const iso = (day: number) => dateOfWorkday(day, DEFAULT_CALENDAR).split("-");
/** The company's date as the English mail writes it: dd/mm/yyyy; German: dd.mm.yyyy. */
const enDate = (day: number) => { const [y, m, d] = iso(day); return `${d}/${m}/${y}`; };
const deDate = (day: number) => { const [y, m, d] = iso(day); return `${d}.${m}.${y}`; };

let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string, payload: EventPayload = {}, day = TODAY): CaseEvent =>
  ({ id: "e" + n++, ts: 0, day, type, actor, actorUserId, target, payload });
const raise = () => ev("case.raised", "Anonymous #1", "u_raiser", "c_a", { kind: "idea", title: "Shorter changeover", routeId: "r2", assignee: "Owner One", assigneeRoleHolderId: "s_own1" }, TODAY - 5);

type Decided = Partial<NonNullable<ReducedCase["decided"]>>;
/** The case after `events`, with `patch` on top: the NOR-G1 fields written directly. */
function world(events: CaseEvent[], patch: Partial<ReducedCase> = {}): { state: State; kase: ReducedCase } {
  const state = reduce(SEED, { events: [raise(), ...events], day: TODAY });
  const kase = state.cases.find((c) => c.id === "c_a");
  if (!kase) throw new Error("no case");
  Object.assign(kase, patch);
  return { state, kase };
}
const decision = (over: Decided = {}): NonNullable<ReducedCase["decided"]> => ({
  answer: "no", reason: "The budget for this year is spent.", note: "", by: "Owner One", byUserId: "u_o1", day: TODAY,
  category: "not-now", changeIf: "", revisitDay: null, duplicateOf: null, ...over,
});
const tell = (e: CaseEvent, state: State, locale: "en" | "de" = "en") =>
  loopNotices({ ev: e, state, people, baseUrl: "https://app.test/acme" }, () => locale);
const to = (out: { userId: string }[]) => out.map((x) => x.userId).sort();

describe("NOR notices", () => {
  describe("a no", () => {
    const e = ev("case.decided", "Owner One", "u_o1", "c_a", { answer: "no" });

    it("tells the raiser the category, the reason, what would make it a yes, the revisit date and the second-look deadline", () => {
      const { state } = world([e], { status: "decided", decided: decision({ changeIf: "A quote under 5000 euro", revisitDay: TODAY + 20 }) });
      const out = tell(e, state);
      expect(to(out)).toEqual(["u_raiser"]);
      expect(out[0].subject).toBe("Your idea was declined: Shorter changeover");
      expect(out[0].text).toContain("Owner One said no. Reason: Not now - The budget for this year is spent.");
      expect(out[0].text).toContain("What would make it a yes: A quote under 5000 euro");
      expect(out[0].text).toContain(`It comes back on ${enDate(TODAY + 20)}`);
      expect(out[0].text).toContain(`You may ask for a second look until ${enDate(TODAY + state.rules.appealDays)}.`);
      expect(out[0].text).toContain("https://app.test/acme/cases/c_a");
      const de = tell(e, state, "de");
      expect(de[0].text).toContain("Nicht jetzt - The budget for this year is spent.");
      expect(de[0].text).toContain(`Es kommt am ${deDate(TODAY + 20)} wieder`);
      expect(de[0].text).toContain(`bis ${deDate(TODAY + state.rules.appealDays)} einen zweiten Blick`);
    });

    it("leaves out what has no value: no line for a missing yes-condition or revisit day, and none for a second look already asked", () => {
      const { state } = world([e], { status: "decided", decided: decision({ category: "no-fit" }), appeal: { text: "Please look again, it matters", day: TODAY + 1, by: "Raiser", byUserId: "u_raiser", seatId: "s_dep", decided: null } });
      const text = tell(e, state)[0].text;
      expect(text).toContain("Reason: Does not fit a goal or a standard - The budget for this year is spent.");
      expect(text).not.toContain("What would make it a yes");
      expect(text).not.toContain("comes back on");
      expect(text).not.toContain("second look");
    });

    it("an old no still names its old reason: the picked id's label and the desk's line, or just the free text", () => {
      const old = world([e], { status: "decided", decided: decision({ category: null, reason: "no time", note: "Ask again in spring" }) });
      expect(tell(e, old.state)[0].text).toContain("Reason: No time this quarter - Ask again in spring");
      const free = world([e], { status: "decided", decided: decision({ category: null, reason: "Teams said: too early", note: "" }) });
      expect(tell(e, free.state)[0].text).toContain("Reason: Teams said: too early");
      const bare = world([e], { status: "decided", decided: decision({ category: null, reason: "", note: "" }) });
      expect(tell(e, bare.state)[0].text).toContain("Reason: none given");
    });

    it("a decision during a discussion also tells the invitees who did not decline that it ended, with the answer", () => {
      const talk = ev("case.discussion", "Owner One", "u_o1", "c_a", { invited: ["Invitee One", "Invitee Two", "Invitee Three"], invitedUserIds: ["u_i1", "u_i2", "u_i3"], missing: "The saving" }, TODAY - 3);
      const { state, kase } = world([talk, e], { status: "decided", decided: decision() });
      expect(kase.discussion).not.toBeNull();
      kase.discussion!.declinedUserIds = ["u_i2"];
      const out = tell(e, state);
      expect(to(out)).toEqual(["u_i1", "u_i3", "u_raiser"]);
      const ended = out.find((x) => x.userId === "u_i1")!;
      expect(ended.subject).toBe("The discussion is over: Shorter changeover");
      expect(ended.text).toContain("Owner One said no. The discussion about this idea has ended.");
      expect(ended.text).toContain("Not now - The budget for this year is spent.");
    });

    it("a yes during a discussion tells the invitees too; a decision with no discussion tells nobody else", () => {
      const talk = ev("case.discussion", "Owner One", "u_o1", "c_a", { invited: ["Invitee One"], invitedUserIds: ["u_i1"] }, TODAY - 3);
      const yes = ev("case.decided", "Owner One", "u_o1", "c_a", { answer: "yes" });
      const withTalk = world([talk, yes], { status: "decided", decided: decision({ answer: "yes", category: null }) });
      expect(to(tell(yes, withTalk.state))).toEqual(["u_i1", "u_raiser"]);
      expect(tell(yes, withTalk.state).find((x) => x.userId === "u_i1")!.text).toContain("Owner One said yes.");
      const none = world([yes], { status: "decided", decided: decision({ answer: "yes", category: null }) });
      expect(to(tell(yes, none.state))).toEqual(["u_raiser"]);
    });
  });

  describe("a case that comes back", () => {
    const revisit = ev("case.reopened", "system:clock", null, "c_a", { why: "revisit", dueDay: TODAY + 10, toRoleHolderId: "s_own1" });

    it("case.reopened tells the holders of the new seat's role and the raiser, not the managers", () => {
      const { state } = world([revisit], { status: "open", assigneeSeatId: "s_own1", dueDay: TODAY + 10, reopens: [{ why: "revisit", day: TODAY, by: "system:clock" }], decided: null });
      const out = tell(revisit, state);
      expect(to(out)).toEqual(["u_o1", "u_o2", "u_raiser"]);
      const desk = out.find((x) => x.userId === "u_o1")!;
      expect(desk.subject).toBe("Came back: Shorter changeover");
      expect(desk.text).toContain("The no on this idea was set to come back today. It is on your desk again.");
      expect(desk.text).toContain("The new answer date is in 10 days");
      const raiser = out.find((x) => x.userId === "u_raiser")!;
      expect(raiser.text).toContain("Your idea comes back today: it is with Owner One again");
    });

    it("a reopen onto the fallback desk tells every manager too", () => {
      const { state } = world([revisit], { status: "open", assigneeSeatId: "s_fb", dueDay: TODAY + 10, reopens: [{ why: "revisit", day: TODAY, by: "system:clock" }], decided: null });
      const e = ev("case.reopened", "system:clock", null, "c_a", { why: "revisit", dueDay: TODAY + 10 });
      const out = tell(e, state);
      expect(to(out)).toEqual(["u_fb", "u_mgr", "u_raiser"]);
      expect(out.find((x) => x.userId === "u_mgr")!.text).toContain("no desk owns it");
    });

    it("a reopen the reducer did not take, and a stopped project's idea going back, are told by what the case says", () => {
      const refused = world([revisit], { status: "decided", reopens: [], decided: decision() });
      expect(tell(revisit, refused.state)).toEqual([]);
      const stopped = ev("case.reopened", "Owner One", "u_o1", "c_a", { why: "stopped", toRoleHolderId: "s_own1" });
      const back = world([stopped], { status: "open", assigneeSeatId: "s_own1", reopens: [{ why: "stopped", day: TODAY, by: "Owner One" }], decided: null });
      const out = tell(stopped, back.state);
      expect(to(out)).toEqual(["u_o2", "u_raiser"]); // never to who wrote it
      expect(out.find((x) => x.userId === "u_o2")!.text).toContain("The project for this idea was stopped");
    });
  });

  describe("a second look", () => {
    const asked = { text: "The quote came in at 4000 euro, please look again", day: TODAY, by: "Anonymous #1", byUserId: "u_raiser", seatId: "s_dep", decided: null };
    const appealed = ev("case.appealed", "Anonymous #1", "u_raiser", "c_a", { text: asked.text, toRoleHolderId: "s_dep" });

    it("case.appealed tells the holders of the roles that may answer it, never the person who said no", () => {
      const { state } = world([appealed], { status: "decided", decided: decision({ byUserId: "u_o1" }), appeal: { ...asked } });
      const out = tell(appealed, state);
      expect(to(out)).toEqual(["u_dep"]);
      expect(out[0].subject).toBe("Second look asked: Shorter changeover");
      expect(out[0].text).toContain(asked.text);
      expect(out[0].text).toContain("The no said: Not now - The budget for this year is spent.");
      // The no-sayer holds the deputy role as well: that desk may not answer, and nobody else is left.
      const same = world([appealed], { status: "decided", decided: decision({ byUserId: "u_dep" }), appeal: { ...asked } });
      expect(tell(appealed, same.state)).toEqual([]);
    });

    it("case.appeal.decided tells the raiser: upheld with the reason, final", () => {
      const e = ev("case.appeal.decided", "Deputy", "u_dep", "c_a", { uphold: true, reason: "The budget really is spent for the year." });
      const { state } = world([e], { status: "decided", decided: decision(), appeal: { ...asked, decided: { uphold: true, reason: "The budget really is spent for the year.", by: "Deputy", byUserId: "u_dep", day: TODAY } } });
      const out = tell(e, state);
      expect(to(out)).toEqual(["u_raiser"]);
      expect(out[0].subject).toBe("The no stands after a second look: Shorter changeover");
      expect(out[0].text).toContain("Deputy looked at your idea again and the no stands. This is final.");
      expect(out[0].text).toContain("Reason: The budget really is spent for the year.");
    });

    it("case.appeal.decided that reopens tells the new desk and the raiser, and the managers on the fallback desk", () => {
      const why = "The new quote changes the picture, it is worth a new look.";
      const e = ev("case.appeal.decided", "Deputy", "u_dep", "c_a", { uphold: false, reason: why });
      const decided = { uphold: false, reason: why, by: "Deputy", byUserId: "u_dep", day: TODAY };
      const onDesk = world([e], { status: "open", decided: null, assigneeSeatId: "s_own1", dueDay: TODAY + 10, reopens: [{ why: "appeal", day: TODAY, by: "Deputy" }], appeal: { ...asked, decided } });
      const out = tell(e, onDesk.state);
      expect(to(out)).toEqual(["u_o1", "u_o2", "u_raiser"]);
      expect(out.find((x) => x.userId === "u_o1")!.text).toContain(`Reason: ${why}`);
      expect(out.find((x) => x.userId === "u_raiser")!.text).toContain("did not uphold the no");
      const fallback = world([e], { status: "open", decided: null, assigneeSeatId: "s_fb", dueDay: TODAY + 10, reopens: [{ why: "appeal", day: TODAY, by: "Deputy" }], appeal: { ...asked, decided } });
      expect(to(tell(e, fallback.state))).toEqual(["u_fb", "u_mgr", "u_raiser"]);
    });
  });

  describe("a pass", () => {
    const pass = (payload: EventPayload) => ev("case.handed", "Owner One", "u_o1", "c_a", { to: "Deputy", toRoleHolderId: "s_dep", why: "This belongs to the deputy's area", ...payload });
    const passed = (e: CaseEvent) => world([e], { assigneeSeatId: "s_dep", assignee: "Deputy", dueDay: TODAY + 3 });

    it("Not mine tells the new desk and the raiser, in its own words", () => {
      const e = pass({ back: true });
      const out = tell(e, passed(e).state);
      expect(to(out)).toEqual(["u_dep", "u_raiser"]);
      expect(out.find((x) => x.userId === "u_dep")!.subject).toBe("Sent back to you: Shorter changeover");
      expect(out.find((x) => x.userId === "u_dep")!.text).toContain("Owner One says this idea is not theirs and sends it back to your desk:");
      expect(out.find((x) => x.userId === "u_dep")!.text).toContain("Why: This belongs to the deputy's area");
      expect(out.find((x) => x.userId === "u_raiser")!.subject).toBe("Your idea was sent back: Shorter changeover");
    });

    it("Send up tells the seat above and the raiser", () => {
      const e = pass({ up: true, to: "Above", toRoleHolderId: "s_up" });
      const out = tell(e, world([e], { assigneeSeatId: "s_up", assignee: "Above", dueDay: TODAY + 3 }).state);
      expect(to(out)).toEqual(["u_raiser", "u_up"]);
      expect(out.find((x) => x.userId === "u_up")!.subject).toBe("Sent up to you: Shorter changeover");
      expect(out.find((x) => x.userId === "u_raiser")!.text).toContain("Owner One sent your idea up to Above.");
    });

    it("a plain pass keeps its words", () => {
      const e = pass({});
      const out = tell(e, passed(e).state);
      expect(out.find((x) => x.userId === "u_dep")!.subject).toBe("Passed to your desk: Shorter changeover");
      expect(out.find((x) => x.userId === "u_raiser")!.subject).toBe("Your idea was passed on: Shorter changeover");
    });
  });

  describe("Move to a desk", () => {
    it("case.override tells the new route's owner desk with the pass-desk mail, and the raiser in one line", () => {
      const e = ev("case.override", "Manager", "u_mgr", "c_a", { proposed: "r2", chosen: "r3" });
      const { state } = world([e], { assigneeSeatId: "s_dep", assignee: "Deputy", dueDay: TODAY + 4, override: { proposed: "r2", chosen: "r3", day: TODAY, by: "Manager", byUserId: "u_mgr" } });
      const out = tell(e, state);
      expect(to(out)).toEqual(["u_dep", "u_raiser"]);
      const desk = out.find((x) => x.userId === "u_dep")!;
      expect(desk.subject).toBe("Passed to your desk: Shorter changeover");
      expect(desk.text).toContain("Manager moved this idea to your desk:");
      expect(desk.text).toContain("due in 4 days");
      expect(out.find((x) => x.userId === "u_raiser")!.text).toContain("Manager moved your idea to Deputy.");
      // A move the reducer did not take tells nobody.
      const other = ev("case.override", "Manager", "u_mgr", "c_a", { proposed: "r2", chosen: "r9" });
      expect(tell(other, state)).toEqual([]);
    });
  });

  describe("a declined invitee", () => {
    it("is never mailed: not for a view asked, a check-in or a withdrawal", () => {
      const talk = ev("case.discussion", "Owner One", "u_o1", "c_a", { invited: ["Invitee One", "Invitee Two"], invitedUserIds: ["u_i1", "u_i2"], missing: "The saving" }, TODAY - 3);
      const more = ev("case.invited", "Owner One", "u_o1", "c_a", { invited: ["Invitee Two", "Invitee Three"], invitedUserIds: ["u_i2", "u_i3"] }, TODAY - 2);
      const checkin = ev("case.checkin", "Owner One", "u_o1", "c_a", { next: "decide", open: [], note: "Quote is in" }, TODAY - 1);
      const withdrawn = ev("case.withdrawn", "Anonymous #1", "u_raiser", "c_a", { note: "Changed my mind" });
      const { state, kase } = world([talk, more, checkin], { status: "discussion" });
      kase.discussion!.declinedUserIds = ["u_i2"];
      expect(to(tell(more, state))).toEqual(["u_i3"]);
      expect(to(tell(checkin, state))).toEqual(["u_i1", "u_i3", "u_raiser"]);
      const gone = world([talk, more, withdrawn], { status: "withdrawn", withdrawn: { day: TODAY, by: "Anonymous #1", byUserId: "u_raiser", note: "Changed my mind" } });
      gone.kase.discussion!.declinedUserIds = ["u_i2"];
      expect(to(tell(withdrawn, gone.state))).toEqual(["u_i1", "u_i3", "u_o1", "u_o2"]);
    });
  });
});

// ── reminders ─────────────────────────────────────────────────────────────────────────────────────────────────

const planPeople: PlanPerson[] = people.map((p) => ({ id: p.id, email: p.email, locale: "en", name: p.name, manager: p.manager }));
const due = (payload: EventPayload) => ev("clock.due", "system:clock", null, "c_a", payload);
const plan = (e: CaseEvent, state: State, over: Partial<PlanCtx> = {}) =>
  planNotices(e, { companyId: "co1", state, people: planPeople, prefs: [], company: { stage: "pilot", notifications: true, n8n: false }, subscriptions: [], baseUrl: "https://app.test/acme", ...over }).filter((d) => d.channel !== "inapp");
const users = (d: { recipientUserId: string | null }[]) => d.map((x) => x.recipientUserId).sort();

describe("NOR reminders", () => {
  const asked = { text: "Please look again, the quote changed", day: TODAY - 3, by: "Anonymous #1", byUserId: "u_raiser", seatId: "s_dep", decided: null };

  it("a clock.due of kind appeal plans reminder.appeal to the deciding desk, never the person who said no", () => {
    const f = due({ kind: "appeal", dueDay: TODAY });
    const { state } = world([f], { status: "decided", decided: decision(), appeal: { ...asked } });
    const d = plan(f, state, { dateOfDay: () => "2026-11-04" });
    expect(d.every((x) => x.template === "reminder.appeal" && x.status === "pending")).toBe(true);
    expect(users(d)).toEqual(["u_dep"]);
    expect(d[0].subject).toBe("A second look is waiting: Shorter changeover");
    expect(d[0].text).toContain("has waited for your answer since 4 Nov 2026");
    expect(d[0].key).toBe(`rem:${f.id}:u_dep`);
    // The no-sayer holds the deputy seat's role: not told.
    const same = world([f], { status: "decided", decided: decision({ byUserId: "u_dep" }), appeal: { ...asked } });
    expect(plan(f, same.state)).toEqual([]);
  });

  it("check 2 of an appeal goes to the seat above, with its own text", () => {
    const f = due({ kind: "appeal", dueDay: TODAY + 5, check: 2, toRoleHolderId: "s_up" });
    const { state } = world([f], { status: "decided", decided: decision(), appeal: { ...asked } });
    const d = plan(f, state, { dateOfDay: () => "2026-11-09" });
    expect(users(d)).toEqual(["u_up"]);
    expect(d[0].subject).toBe("A second look is unanswered: Shorter changeover");
    expect(d[0].text).toContain("It is now with you:");
  });

  it("an appeal already answered, or with no second look, plans nothing", () => {
    const f = due({ kind: "appeal", dueDay: TODAY });
    const answered = world([f], { status: "decided", decided: decision(), appeal: { ...asked, decided: { uphold: true, reason: "Stays.", by: "Deputy", byUserId: "u_dep", day: TODAY } } });
    expect(plan(f, answered.state)).toEqual([]);
    expect(plan(f, world([f], { status: "decided", decided: decision(), appeal: null }).state)).toEqual([]);
  });

  it("a clock.due of kind view plans reminder.view to the invitees who have no view yet", () => {
    const talk = ev("case.discussion", "Owner One", "u_o1", "c_a", { invited: ["Invitee One", "Invitee Two", "Invitee Three"], invitedUserIds: ["u_i1", "u_i2", "u_i3"], missing: "The saving" }, TODAY - 3);
    const comment = ev("case.commented", "Invitee Three", "u_i3", "c_a", { text: "My view: go for it" }, TODAY - 1);
    const f = due({ kind: "view", dueDay: TODAY });
    // The reducer does not keep case.commented (NOR-A1 decides how a view reaches the state); the reminder reads it from the case's history.
    const { state, kase } = world([talk, f], { status: "discussion" });
    kase.history.splice(kase.history.indexOf(kase.history.find((h) => h.id === f.id)!), 0, comment);
    kase.discussion!.declinedUserIds = ["u_i2"];
    const d = plan(f, state);
    expect(d.every((x) => x.template === "reminder.view")).toBe(true);
    expect(users(d)).toEqual(["u_i1"]); // Invitee Two declined, Invitee Three has commented
    expect(d[0].subject).toBe("Your view is still missing: Shorter changeover");
    expect(d[0].link).toBe("https://app.test/acme/cases/c_a");
    // A comment from before the round began does not count: the round starts at the last check-in.
    const checkin = ev("case.checkin", "Owner One", "u_o1", "c_a", { next: "round", open: [], note: "" }, TODAY - 1);
    const again = world([talk, checkin, f], { status: "discussion" });
    again.kase.history.splice(again.kase.history.findIndex((h) => h.id === checkin.id), 0, comment);
    again.kase.discussion!.declinedUserIds = ["u_i2"];
    expect(users(plan(f, again.state))).toEqual(["u_i1", "u_i3"]);
  });

  it("a revisit plans no reminder of its own: the clock writes case.reopened, and kind revisit is no reminder", () => {
    const f = due({ kind: "revisit", dueDay: TODAY });
    const { state } = world([f], { status: "decided", decided: decision({ revisitDay: TODAY }) });
    expect(plan(f, state)).toEqual([]);
    expect(planNotices(f, { companyId: "co1", state, people: planPeople, prefs: [], company: { stage: "pilot", notifications: true, n8n: false }, subscriptions: [], baseUrl: "https://app.test/acme" })).toEqual([]);
  });

  it("reminder.appeal is a duty, reminder.view can be switched off", async () => {
    const { isDuty } = await import("@/features/notify/channels");
    expect(isDuty("reminder.appeal")).toBe(true);
    expect(isDuty("reminder.view")).toBe(false);
  });
});
