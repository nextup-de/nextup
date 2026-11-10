// Decision Q1.14: the raiser withdraws an idea nobody decided yet. It is archived without a decision, its clock
// stops, it stays out of the decision log, and the desk and everyone invited are told.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { APP_EVENT_TYPES } from "@/features/cases/persist";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { mineRow } from "@/features/cases/rows";
import { DEFAULT_CALENDAR, type ClockSpec } from "@/features/clock";
import { dueNow } from "@/features/clock/due";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { loopMails, type Person } from "@/features/loop/notice";
import { followsTemplate, NOTIFY_GROUPS } from "@/features/notify/digest";

const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 1 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner", deputySeatId: "seat_dep", deputyRoleId: "role_deputy" } : x));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, clock: { mode: "workdays", calendar: DEFAULT_CALENDAR } as ClockSpec };
const UID: Record<string, string> = { "T. Vogel": "u_tv", "H. Sander": "u_hs", "L. Brandt": "u_lb", "Anonymous #4471": "u_js", "J. Schmidt": "u_js" };
let n = 0;
const ev = (type: CaseEventType, actor: string, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "w" + n++, ts: 0, type, actor, actorUserId: UID[actor] ?? null, target: "c_a", payload, day });
const AUTHOR = "Anonymous #4471";
const raised = ev("case.raised", AUTHOR, { kind: "idea", title: "Shorter changeover", body: "x", routeId: "r1", assignee: "T. Vogel", assigneeRoleHolderId: "seat_tv" });
const withdrawn = (day = 2, note?: string) => ev("case.withdrawn", "J. Schmidt", note === undefined ? {} : { note }, day);
const at = (day: number, ...more: CaseEvent[]) => reduce(SEED, { events: [raised, ...more], day } as EventLog);
const caseOf = (day: number, ...more: CaseEvent[]) => at(day, ...more).cases.find((c) => c.id === "c_a")!;
const actor = (name: string, role: Actor["role"] = "member", handle: string | null = null): Actor =>
  ({ role, name, handle, userId: UID[name] ?? null, me: meFor(UID[name] ?? null, seats) });
const may = (who: Actor, state: ReturnType<typeof at>, payload: EventPayload = {}) => mayAppend(who, { type: "case.withdrawn", target: "c_a", payload }, state).ok;

describe("withdrawing an idea", () => {
  it("is an event people may send", () => {
    expect(APP_EVENT_TYPES).toContain("case.withdrawn");
  });

  it("only the raiser, while nobody decided it: open, in discussion or with a question open", () => {
    const raiser = actor("J. Schmidt", "member", AUTHOR);
    expect(may(raiser, at(1))).toBe(true);
    expect(may(raiser, at(1, ev("case.asked", "T. Vogel", { text: "Which line?" })))).toBe(true);
    expect(may(raiser, at(1, ev("case.discussion", "T. Vogel", { invited: ["H. Sander"], invitedUserIds: ["u_hs"] })))).toBe(true);
    expect(may(actor("T. Vogel", "leader"), at(1))).toBe(false);
    expect(may(actor("L. Brandt", "manager"), at(1))).toBe(false);
    expect(may(raiser, at(2, ev("case.decided", "T. Vogel", { answer: "no", reason: "not now" }, 1)))).toBe(false);
    expect(may(raiser, at(3, withdrawn()))).toBe(false);
    expect(may(raiser, at(1), { note: "x".repeat(501) })).toBe(false);
    expect(may(raiser, at(1), { note: "Solved it on the line ourselves." })).toBe(true);
  });

  it("archives it without a decision and stops its clock; nothing falls due any more", () => {
    const late = PROMISE_DAYS + 5;
    const c = caseOf(late, withdrawn(2, "  Solved it ourselves.  "));
    expect(c).toMatchObject({ status: "withdrawn", open: false, archived: true, decided: null, overdue: false, clock: 2 });
    expect(c.withdrawn).toEqual({ day: 2, by: "J. Schmidt", byUserId: "u_js", note: "Solved it ourselves." });
    expect(dueNow(at(late, withdrawn(2)), late).filter((d) => d.target === "c_a")).toEqual([]);
    // The desk no longer has it.
    expect(at(late, withdrawn(2)).cases.filter((c) => c.open)).toEqual([]);
  });

  it("a withdraw after a decision, or by someone else, changes nothing", () => {
    expect(caseOf(3, ev("case.decided", "T. Vogel", { answer: "no", reason: "not now" }, 1), withdrawn(2)).status).toBe("decided");
    expect(caseOf(3, ev("case.withdrawn", "T. Vogel", {}, 2)).status).toBe("open");
  });

  it("the raiser's own list says it is withdrawn, with the reason", () => {
    const row = mineRow(caseOf(5, withdrawn(2, "Solved it ourselves.")), 5, (d) => "day " + d, PROMISE_DAYS, 30);
    expect(row.status).toBe("Withdrawn");
    expect(row.steps.map((s) => s.label).at(-1)).toBe("Withdrawn");
    expect(row.reply).toContain("Solved it ourselves.");
    expect(row.canReply).toBe(false);
  });
});

describe("who is told", () => {
  const people: Person[] = [
    { id: "u_js", name: "J. Schmidt", email: "js@acme.test", handle: AUTHOR },
    { id: "u_tv", name: "T. Vogel", email: "tv@acme.test" },
    { id: "u_hs", name: "H. Sander", email: "hs@acme.test" },
    { id: "u_lb", name: "L. Brandt", email: "lb@acme.test" },
  ];
  const mails = (last: CaseEvent, ...before: CaseEvent[]) => loopMails({ ev: last, state: at(last.day, ...before, last), people, baseUrl: "https://acme.sellux.ch" });

  it("the desk and everyone invited, by the name the raiser posted under; never the raiser", () => {
    const talk = ev("case.discussion", "T. Vogel", { invited: ["L. Brandt"], invitedUserIds: ["u_lb"] }, 1);
    const out = mails(withdrawn(2, "Solved it ourselves."), talk);
    expect(out.map((m) => [m.to, m.subject])).toEqual([["tv@acme.test", "Idea withdrawn: Shorter changeover"], ["lb@acme.test", "Idea withdrawn: Shorter changeover"]]);
    expect(out[0].text).toContain(`${AUTHOR} withdrew this idea before it was decided:`);
    expect(out[0].text).not.toContain("J. Schmidt,\n\nJ. Schmidt");
    expect(out[0].text).not.toMatch(/Schmidt withdrew/);
    expect(out[0].text).toContain("Why: Solved it ourselves.");
    expect(out[0].text).toContain("https://acme.sellux.ch/cases/c_a");
  });

  it("a withdraw that did not take effect tells nobody", () => {
    expect(mails(withdrawn(2), ev("case.decided", "T. Vogel", { answer: "no", reason: "not now" }, 1))).toEqual([]);
  });

  it("is a loop notice a person can switch, and follows an earlier choice for decisions", () => {
    expect(NOTIFY_GROUPS.loop).toContain("loop.case.withdrawn");
    expect(followsTemplate("loop.case.withdrawn")).toBe("loop.case.decided");
  });
});
