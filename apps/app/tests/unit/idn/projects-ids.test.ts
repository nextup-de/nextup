// IDN-B1: a project knows its lead, team, authors and step owners by user id, its rights are decided
// by those ids, and the project mails find their recipients by id (docs/IDENTITY.md). Labels only show.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import { EMPTY_APPROVAL_CONFIG } from "@/features/approvals/types";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { LOOP_DEFAULTS } from "@/features/loop/rules";
import { loopMails, type Person } from "@/features/loop/notice";
import { mayAppendProject } from "@/features/projects/permissions";
import { applyProjectEvent, finishProjects, newBook, openOrJoin } from "@/features/projects/reduce";
import { escalatedToMe } from "@/features/projects/selectors";

let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "i" + n++, ts: 0, type, actor, actorUserId, target, payload, day });

const seats: SeatRow[] = [
  { id: "seat_owner", roleId: "role_owner", label: "T. Vogel", userId: "u_owner", sort: 0 },
  { id: "seat_deputy", roleId: "role_deputy", label: "M. Roth", userId: "u_deputy", sort: 1 },
];
const route = { ...ROUTES.find((r) => r.id === "r1")!, ownerSeatId: "seat_owner", ownerRoleId: "role_owner", deputySeatId: "seat_deputy", deputyRoleId: "role_deputy" };
const source = { id: "c1", from: "Anonymous #4471", fromUserId: "u_raiser", routeId: "r1", title: "Shorter changeover" };

/** A project opened by a yes that names `leadUserId`, with the project events applied. */
function build(leadUserId: string | undefined, ...events: CaseEvent[]) {
  const book = newBook();
  const yes = ev("case.decided", "T. Vogel", "u_owner", "c1", { answer: "yes", projectId: "p1", lead: "L. Brandt", ...(leadUserId ? { leadUserId } : {}), title: "Shorter changeover" });
  openOrJoin(book, yes, source);
  for (const e of events) applyProjectEvent(book, e, LOOP_DEFAULTS);
  return book;
}
type Book = ReturnType<typeof newBook>;
const finish = (book: Book, day: number) =>
  finishProjects(book, { day, promise: PROMISE_DAYS, rules: LOOP_DEFAULTS, routeOf: () => route, seats });
const P = (type: CaseEventType, payload: EventPayload = {}, actor = "L. Brandt", uid: string | null = "u_lead") => ev(type, actor, uid, "p1", payload);
const stateOf = (book: Book) => ({ projects: finish(book, 0), cases: [], approvals: { ...EMPTY_APPROVAL_CONFIG, roles: [] }, rules: { fastLaneEur: 0 } }) as unknown as State;
const actor = (name: string, userId: string | null, role: "leader" | "member" | "manager" = "leader") => ({ role, name, handle: null, userId, me: meFor(userId, []) });

describe("IDN projects on ids", () => {
  it("a yes with leadUserId opens a project led by that id, authored by the raiser's id", () => {
    const [p] = finish(build("u_lead"), 0);
    expect(p).toMatchObject({ lead: "L. Brandt", leadUserId: "u_lead", memberUserIds: [], authorUserIds: ["u_raiser"] });
    // Without a lead id the actor behind the yes leads; a label never stands in.
    expect(finish(build(undefined), 0)[0].leadUserId).toBe("u_owner");
  });

  it("project.member adds the user id, and hand-over makes them lead and keeps the old lead on the team", () => {
    const book = build("u_lead", P("project.member", { userId: "u_mr", name: "M. Roth", on: true }), P("project.member", { userId: "u_x", name: "X", on: true }), P("project.member", { userId: "u_x", name: "X", on: false }));
    expect(finish(book, 0)[0].memberUserIds).toEqual(["u_mr"]);
    applyProjectEvent(book, P("project.handed", { to: "M. Roth", toUserId: "u_mr" }), LOOP_DEFAULTS);
    const [p] = finish(book, 0);
    expect(p.leadUserId).toBe("u_mr");
    expect(p.memberUserIds).toEqual(["u_lead"]);
  });

  it("a step added with ownerUserId has it, and null clears it", () => {
    const book = build("u_lead", P("project.step.added", { stepId: "s1", text: "Cart", owner: "M. Roth", ownerUserId: "u_mr" }));
    expect(finish(book, 0)[0].steps[0]).toMatchObject({ owner: "M. Roth", ownerUserId: "u_mr" });
    applyProjectEvent(book, P("project.step.edited", { stepId: "s1", owner: "", ownerUserId: null }), LOOP_DEFAULTS);
    expect(finish(book, 0)[0].steps[0].ownerUserId).toBeNull();
  });

  it("someone with the lead's label but another id may not start the project; the lead may", () => {
    const book = build("u_lead", P("project.baseline", { none: true, why: "No metric" }));
    const state = stateOf(book);
    const start = { type: "project.started", target: "p1", payload: {} };
    expect(mayAppendProject(actor("L. Brandt", "u_other"), start, state).ok).toBe(false);
    expect(mayAppendProject(actor("L. Brandt", null), start, state).ok).toBe(false);
    expect(mayAppendProject(actor("Someone Else", "u_lead"), start, state).ok).toBe(true);
  });

  it("past the start date the project goes to the owner seat, or to the deputy seat when the lead is the owner's user", () => {
    const late = finish(build("u_lead"), 9)[0];
    expect(late.escalated).toMatchObject({ toSeatId: "seat_owner", toRoleId: "role_owner", to: route.owner.name });
    const ownLate = finish(build("u_owner"), 9)[0];
    expect(ownLate.escalated).toMatchObject({ toSeatId: "seat_deputy", toRoleId: "role_deputy", to: route.deputy });
    const state = { projects: [ownLate] };
    expect(escalatedToMe(state, meFor("u_deputy", seats)).map((p) => p.id)).toEqual(["p1"]);
    expect(escalatedToMe(state, meFor("u_owner", seats))).toEqual([]);
  });
});

describe("IDN loop mails by id", () => {
  const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };
  const people: Person[] = [
    { id: "u_raiser", name: "J. Schmidt", email: "raiser@acme.test", handle: "Anonymous #4471" },
    { id: "u_hs", name: "H. Sander", email: "hs@acme.test" },
    { id: "u_hs2", name: "H. Sander", email: "hs-twin@acme.test" }, // same name, another person
    { id: "u_tv", name: "T. Vogel", email: "tv@acme.test" },
  ];
  const raised = ev("case.raised", "Anonymous #4471", "u_raiser", "c_m", { kind: "idea", title: "Shorter changeover", body: "x", routeId: "r1", assignee: "T. Vogel" });
  const mails = (...events: CaseEvent[]) => {
    const last = events[events.length - 1];
    return loopMails({ ev: last, state: reduce(SEED, { events: [raised, ...events], day: 0 }), people, baseUrl: "https://acme.sellux.ch" });
  };

  it("an invite with invitedUserIds mails exactly those users' addresses", () => {
    const talk = ev("case.discussion", "T. Vogel", "u_tv", "c_m", { invited: [], missing: "" });
    const invite = ev("case.invited", "T. Vogel", "u_tv", "c_m", { invited: ["H. Sander"], invitedUserIds: ["u_hs"] });
    expect(mails(talk, invite).map((m) => m.to)).toEqual(["hs@acme.test"]);
  });

  it("a person who shares an invitee's name but not the id gets nothing", () => {
    const talk = ev("case.discussion", "T. Vogel", "u_tv", "c_m", { invited: ["H. Sander"], invitedUserIds: ["u_hs"], missing: "The saving" });
    const out = mails(talk).map((m) => m.to);
    expect(out).toEqual(["hs@acme.test", "raiser@acme.test"]);
    expect(out).not.toContain("hs-twin@acme.test");
  });

  it("the actor gets nothing, even when invited", () => {
    const talk = ev("case.discussion", "T. Vogel", "u_tv", "c_m", { invited: ["T. Vogel"], invitedUserIds: ["u_tv", "u_hs"], missing: "" });
    expect(mails(talk).map((m) => m.to)).not.toContain("tv@acme.test");
  });
});
