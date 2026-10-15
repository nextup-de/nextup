// The discussion stage (docs/plans/2026-10-15_idea-to-project.md, step 1): reducer and permissions.
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import { needsProjectsFlag, DISCUSSION_EVENT_TYPES, isAppEventType } from "@/features/cases/persist";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { inboxFor } from "@/features/cases/selectors";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };

let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "d" + n++, ts: 0, type, actor, target, payload, day });
const logAt = (day: number, ...events: CaseEvent[]): EventLog => ({ events, day });

const AUTHOR = "Anonymous #4471";
const raised = ev("case.raised", AUTHOR, "c_talk", { kind: "idea", title: "Shorter changeover", body: "v1 text", routeId: "r1", assignee: "T. Vogel", fromDept: "PRD" });
const discuss = (day = 0) => ev("case.discussion", "T. Vogel", "c_talk", { invited: ["H. Sander", " H. Sander ", ""], missing: "A number on the saving" }, day);
const kase = (log: EventLog, seed: ReduceSeed = SEED) => reduce(seed, log).cases.find((c) => c.id === "c_talk")!;

describe("discussion stage: reducer", () => {
  it("a raised case starts as v1, open, not archived", () => {
    const c = kase(logAt(0, raised));
    expect(c.versions).toEqual([{ version: 1, day: 0, by: AUTHOR, title: "Shorter changeover", body: "v1 text", overall: null }]);
    expect(c.status).toBe("open");
    expect(c.archived).toBe(false);
  });

  it("case.discussion: round 1, invited names cleaned, still open on the desk, check-in due after 3 days", () => {
    const S = reduce(SEED, logAt(0, raised, discuss()));
    const c = S.cases.find((x) => x.id === "c_talk")!;
    expect(c.status).toBe("discussion");
    expect(c.open).toBe(true);
    expect(c.discussion?.invited).toEqual(["H. Sander"]);
    expect(c.discussion?.round).toBe(1);
    expect(c.discussion?.lastDay).toBe(9);
    expect(c.dueDay).toBe(3);
    expect(c.overdue).toBe(false);
    expect(inboxFor(S, "T. Vogel").some((x) => x.id === "c_talk")).toBe(true);
  });

  it("a late check-in is overdue and moves to the deputy, like a late decision", () => {
    const c = kase(logAt(4, raised, discuss()));
    expect(c.overdue).toBe(true);
    expect(c.escalated).toEqual({ to: "M. Roth", from: "T. Vogel", day: 4, live: true });
  });

  it("each check-in ends a round and moves the due day; 'decide' makes the decision due", () => {
    const one = ev("case.checkin", "T. Vogel", "c_talk", { next: "round", open: ["Cost"], note: "Waiting for the quote" }, 3);
    let c = kase(logAt(3, raised, discuss(), one));
    expect(c.discussion?.rounds).toHaveLength(1);
    expect(c.discussion?.round).toBe(2);
    expect(c.dueDay).toBe(6);
    const two = ev("case.checkin", "T. Vogel", "c_talk", { next: "decide", open: [], note: "Ready" }, 5);
    c = kase(logAt(5, raised, discuss(), one, two));
    expect(c.discussion?.ready).toBe(true);
    expect(c.discussion?.round).toBe(2);
    expect(c.dueDay).toBe(8);
  });

  it("the company's rhythm comes from Seed.loop", () => {
    const c = kase(logAt(0, raised, discuss()), { ...SEED, loop: { discussEveryDays: 2, discussMaxRounds: 4 } });
    expect(c.dueDay).toBe(2);
    expect(c.discussion?.lastDay).toBe(8);
  });

  it("case.revised adds a version and changes the case's text; a decided case no longer changes", () => {
    const rev = ev("case.revised", AUTHOR, "c_talk", { body: "v2 text with 42 → 31 min", overall: 74 }, 1);
    let c = kase(logAt(1, raised, discuss(), rev));
    expect(c.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(c.versions[1].overall).toBe(74);
    expect(c.body).toBe("v2 text with 42 → 31 min");
    expect(c.title).toBe("Shorter changeover");
    const no = ev("case.decided", "T. Vogel", "c_talk", { answer: "no", reason: "not now" }, 2);
    const late = ev("case.revised", AUTHOR, "c_talk", { body: "v3" }, 3);
    c = kase(logAt(3, raised, discuss(), rev, no, late));
    expect(c.versions).toHaveLength(2);
    expect(c.archived).toBe(true);
  });

  it("invites add up; a hand-over keeps the discussion; a decision closes it", () => {
    const inv = ev("case.invited", "T. Vogel", "c_talk", { invited: ["L. Brandt", "H. Sander"] }, 1);
    const hand = ev("case.handed", "T. Vogel", "c_talk", { to: "M. Roth" }, 1);
    let c = kase(logAt(1, raised, discuss(), inv, hand));
    expect(c.discussion?.invited).toEqual(["H. Sander", "L. Brandt"]);
    expect(c.assignee).toBe("M. Roth");
    expect(c.status).toBe("discussion");
    c = kase(logAt(2, raised, discuss(), ev("case.decided", "T. Vogel", "c_talk", { answer: "yes" }, 2)));
    expect(c.status).toBe("decided");
    expect(c.open).toBe(false);
  });
});

const leader = (name: string): Actor => ({ role: "leader", name, handle: null });
const manager: Actor = { role: "manager", name: "B. Hartmann", handle: null };
const author: Actor = { role: "member", name: "J. Schmidt", handle: AUTHOR };
const p = (type: string, payload: Record<string, unknown> = {}) => ({ type, target: "c_talk", payload });

describe("discussion stage: who may", () => {
  const open = reduce(SEED, logAt(0, raised));
  const talking = reduce(SEED, logAt(0, raised, discuss()));

  it("only the desk holder or a manager starts a discussion, on an open case", () => {
    expect(mayAppend(leader("T. Vogel"), p("case.discussion"), open).ok).toBe(true);
    expect(mayAppend(manager, p("case.discussion"), open).ok).toBe(true);
    expect(mayAppend(leader("H. Sander"), p("case.discussion"), open).ok).toBe(false);
    expect(mayAppend(leader("T. Vogel"), p("case.discussion"), talking).ok).toBe(false);
  });

  it("invites and check-ins need a discussion under way", () => {
    expect(mayAppend(leader("T. Vogel"), p("case.invited", { invited: ["L. Brandt"] }), open).ok).toBe(false);
    expect(mayAppend(leader("T. Vogel"), p("case.invited", { invited: ["L. Brandt"] }), talking).ok).toBe(true);
    expect(mayAppend(leader("T. Vogel"), p("case.invited", { invited: [] }), talking).ok).toBe(false);
    expect(mayAppend(leader("T. Vogel"), p("case.checkin", { next: "round" }), talking).ok).toBe(true);
    expect(mayAppend(author, p("case.checkin", { next: "round" }), talking).ok).toBe(false);
  });

  it("the last round ends in a decision unless a manager adds one", () => {
    const r = (day: number) => ev("case.checkin", "T. Vogel", "c_talk", { next: "round" }, day);
    const last = reduce(SEED, logAt(6, raised, discuss(), r(3), r(6)));
    expect(mayAppend(leader("T. Vogel"), p("case.checkin", { next: "round" }), last).ok).toBe(false);
    expect(mayAppend(leader("T. Vogel"), p("case.checkin", { next: "decide" }), last).ok).toBe(true);
    expect(mayAppend(manager, p("case.checkin", { next: "round" }), last).ok).toBe(true);
  });

  it("only the raiser revises, and only before the decision", () => {
    expect(mayAppend(author, p("case.revised", { body: "v2" }), talking).ok).toBe(true);
    expect(mayAppend(leader("T. Vogel"), p("case.revised", { body: "v2" }), talking).ok).toBe(false);
    expect(mayAppend(author, p("case.revised", { body: " " }), talking).ok).toBe(false);
    const decided = reduce(SEED, logAt(1, raised, ev("case.decided", "T. Vogel", "c_talk", { answer: "no" }, 1)));
    expect(mayAppend(author, p("case.revised", { body: "v2" }), decided).ok).toBe(false);
  });
});

describe("persist: the new events and their flags", () => {
  it("the app may append them, each behind its flag", () => {
    for (const t of DISCUSSION_EVENT_TYPES) expect(isAppEventType(t)).toBe(true);
    expect(isAppEventType("project.measured")).toBe(true);
    expect(needsProjectsFlag("project.step.added", {})).toBe(true);
    expect(needsProjectsFlag("case.decided", { projectId: "p_1" })).toBe(true);
    expect(needsProjectsFlag("case.decided", {})).toBe(false);
    expect(needsProjectsFlag("case.discussion", {})).toBe(false);
  });
});
