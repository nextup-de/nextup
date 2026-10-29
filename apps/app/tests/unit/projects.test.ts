// Projects (docs/plans/2026-10-15_idea-to-project.md, steps 2-5): a yes opens one, project.* events
// work it, the verdict is computed, the clock keeps running. Reducer, selectors, rules, permissions.
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { loopRules, LOOP_DEFAULTS, suggestedReward } from "@/features/loop/rules";
import { board, nextMove, projectCommentsOn, projectLabel, projectOfCase, projectsEscalatedTo, projectsFrom, projectsOf } from "@/features/projects/selectors";
import type { Baseline } from "@/features/projects/types";
import { timelineOf } from "@/features/projects/views";
import { verdictOf } from "@/features/projects/verdict";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };

let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "p" + n++, ts: 0, type, actor, target, payload, day });
const logAt = (day: number, ...events: CaseEvent[]): EventLog => ({ events, day });

const AUTHOR = "Anonymous #4471";
const raise = (id: string, from = AUTHOR) => ev("case.raised", from, id, { kind: "idea", title: "Idea " + id, body: "text", routeId: "r1", assignee: "T. Vogel" });
const yes = (caseId: string, projectId = "p_one", day = 0, lead = "L. Brandt") =>
  ev("case.decided", "T. Vogel", caseId, { answer: "yes", projectId, lead, title: "Shorter changeover" }, day);
const P = (type: CaseEventType, payload: EventPayload = {}, day = 0, actor = "L. Brandt", target = "p_one") => ev(type, actor, target, payload, day);
const baseline = (day = 0) => P("project.baseline", { metric: "Changeover time", unit: "min", value: 42, better: "down", source: "MES weekly" }, day);

/** Raised, accepted, baselined, started, done at day 2. */
const doneLog = (day: number, ...more: CaseEvent[]) =>
  logAt(day, raise("c_a"), yes("c_a"), baseline(), P("project.started"), P("project.step.added", { stepId: "s1", text: "Pre-stage the tools" }),
    P("project.step.moved", { stepId: "s1", to: "done" }, 1), P("project.done", { note: "Live on line 3" }, 2), ...more);

describe("projects: a yes opens one", () => {
  it("the idea is archived and points at P-1, led by who the decider named", () => {
    const S = reduce(SEED, logAt(0, raise("c_a"), yes("c_a")));
    const c = S.cases.find((x) => x.id === "c_a")!;
    expect(c.archived).toBe(true);
    expect(c.decided?.projectId).toBe("p_one");
    expect(S.projects).toHaveLength(1);
    const p = S.projects[0];
    expect(projectLabel(p)).toBe("P-1");
    expect(p).toMatchObject({ title: "Shorter changeover", sources: ["c_a"], authors: [AUTHOR], lead: "L. Brandt", openedBy: "T. Vogel", status: "planning", routeId: "r1" });
    expect(projectOfCase(S, c)?.id).toBe("p_one");
    expect(projectsFrom(S, AUTHOR).map((x) => x.id)).toEqual(["p_one"]);
  });

  it("a second idea joins an open project; a later yes on a decided case opens nothing", () => {
    const S = reduce(SEED, logAt(0, raise("c_a"), raise("c_b", "Anonymous #12"), yes("c_a"), yes("c_b"), yes("c_a", "p_two")));
    expect(S.projects).toHaveLength(1);
    expect(S.projects[0].sources).toEqual(["c_a", "c_b"]);
    expect(S.projects[0].authors).toEqual([AUTHOR, "Anonymous #12"]);
    expect(S.cases.find((x) => x.id === "c_a")!.decided?.projectId).toBe("p_one");
  });

  it("a plain yes (no projectId) and a no open no project", () => {
    const S = reduce(SEED, logAt(0, raise("c_a"), raise("c_b"), ev("case.decided", "T. Vogel", "c_a", { answer: "yes" }), ev("case.decided", "T. Vogel", "c_b", { answer: "no", reason: "not now" })));
    expect(S.projects).toHaveLength(0);
    expect(S.cases.find((x) => x.id === "c_b")!.archived).toBe(true);
  });
});

describe("projects: working one", () => {
  it("planning -> running needs the baseline; steps move on the board", () => {
    let S = reduce(SEED, logAt(0, raise("c_a"), yes("c_a"), P("project.started")));
    expect(S.projects[0].status).toBe("planning");
    expect(nextMove(S.projects[0], 0)).toBe("baseline");
    S = reduce(SEED, logAt(1, raise("c_a"), yes("c_a"), baseline(), P("project.started", {}, 1),
      P("project.step.added", { stepId: "s1", text: "Order the cart", owner: "M. Roth", dueDay: 4 }, 1),
      P("project.step.added", { stepId: "s2", text: "Train shift B" }, 1),
      P("project.step.moved", { stepId: "s1", to: "blocked", why: "Waiting for purchasing" }, 1),
      P("project.step.moved", { stepId: "s2", to: "nowhere" }, 1)));
    const p = S.projects[0];
    expect(p.status).toBe("running");
    expect(p.startedDay).toBe(1);
    const b = board(p);
    expect(b.blocked.map((s) => [s.id, s.why, s.owner, s.dueDay])).toEqual([["s1", "Waiting for purchasing", "M. Roth", 4]]);
    expect(b.todo.map((s) => s.id)).toEqual(["s2"]);
    expect(nextMove(p, 1)).toBe("steps");
  });

  it("the baseline is taken before the start, never after", () => {
    const S = reduce(SEED, logAt(1, raise("c_a"), yes("c_a"), baseline(), P("project.started"), P("project.baseline", { metric: "x", value: 1, better: "up" }, 1)));
    expect(S.projects[0].baseline).toMatchObject({ metric: "Changeover time", value: 42 });
  });

  it("members, hand-over, links (with a Jira key on a step) and comments", () => {
    const log = logAt(1, raise("c_a"), yes("c_a"), P("project.member", { name: "M. Roth", on: true }), P("project.member", { name: "C. Ilg", on: true }),
      P("project.member", { name: "C. Ilg", on: false }), P("project.step.added", { stepId: "s1", text: "Cart" }),
      P("project.linked", { system: "jira", key: "NU-7", url: "https://x.atlassian.net/browse/NU-7", stepId: "s1" }),
      P("project.handed", { to: "M. Roth", why: "Engineering owns it" }, 1), P("project.commented", { text: "Cart ordered" }, 1));
    const p = reduce(SEED, log).projects[0];
    expect(p.lead).toBe("M. Roth");
    expect(p.members).toEqual(["L. Brandt"]);
    expect(p.steps[0].external).toEqual({ system: "jira", key: "NU-7", url: "https://x.atlassian.net/browse/NU-7" });
    expect(projectsOf(reduce(SEED, log), "L. Brandt").map((x) => x.id)).toEqual(["p_one"]);
    expect(projectCommentsOn(log, "p_one").map((c) => c.text)).toEqual(["Cart ordered"]);
  });

  it("a link is only ever an http(s) address", () => {
    const p = reduce(SEED, logAt(0, raise("c_a"), yes("c_a"), P("project.linked", { system: "url", url: "javascript:alert(1)" }), P("project.linked", { system: "jira", key: "NU-1", url: "data:text/html,x" }))).projects[0];
    expect(p.links.map((l) => [l.url, l.key])).toEqual([["", "NU-1"]]);
    const S = reduce(SEED, logAt(0, raise("c_a"), yes("c_a")));
    expect(mayAppend(actor("L. Brandt"), q("project.linked", { system: "url", url: "javascript:alert(1)" }), S).ok).toBe(false);
    expect(mayAppend(actor("L. Brandt"), q("project.linked", { system: "url", url: "https://jira.example.com/browse/NU-1" }), S).ok).toBe(true);
    expect(mayAppend(actor("L. Brandt"), q("project.linked", { system: "jira", key: "NU-1" }), S).ok).toBe(true);
  });

  it("a stopped project takes no more work and says why", () => {
    const p = reduce(SEED, logAt(1, raise("c_a"), yes("c_a"), P("project.stopped", { why: "Line closes" }, 1), baseline(1))).projects[0];
    expect(p.status).toBe("stopped");
    expect(p.closed).toBe(true);
    expect(p.baseline).toBeNull();
  });
});

describe("projects: the clock after the yes", () => {
  it("not started within the promise: late, and on the route owner's desk", () => {
    const S = reduce(SEED, logAt(6, raise("c_a"), yes("c_a")));
    const p = S.projects[0];
    expect(p.dueDay).toBe(5);
    expect(p.overdue).toBe(true);
    expect(p.escalated).toEqual({ to: "T. Vogel", from: "L. Brandt", day: 6, live: true, what: "start" });
    expect(projectsEscalatedTo(S, "T. Vogel").map((x) => x.id)).toEqual(["p_one"]);
    expect(S.ledger.projectsEscalated).toBe(1);
  });

  it("done: checks open at +30 and +90 and are due a promise later", () => {
    const p = reduce(SEED, doneLog(10)).projects[0];
    expect(p.status).toBe("measuring");
    expect(p.checks).toEqual([
      { check: 30, opensDay: 32, dueDay: 37, measured: false, late: false },
      { check: 90, opensDay: 92, dueDay: 97, measured: false, late: false },
    ]);
    expect(nextMove(p, 10)).toBeNull();
    expect(nextMove(p, 32)).toBe("measure");
  });

  it("a late measure is owed and moves on", () => {
    const S = reduce(SEED, doneLog(40));
    expect(S.projects[0].checks[0].late).toBe(true);
    expect(S.projects[0].escalated?.what).toBe("measure");
    expect(S.ledger.measuresOwed).toBe(1);
  });
});

describe("projects: measure and reward", () => {
  it("the verdict is computed, worse included; measured -> reward due -> recognised", () => {
    let S = reduce(SEED, doneLog(32, P("project.measured", { check: 30, value: 31, source: "MES" }, 32)));
    let p = S.projects[0];
    expect(p.measures[0]).toMatchObject({ check: 30, verdict: "better", changePct: -26.2 });
    expect(p.status).toBe("measuring");
    S = reduce(SEED, doneLog(92, P("project.measured", { check: 30, value: 31, source: "MES" }, 32), P("project.measured", { check: 90, value: 45, source: "MES" }, 92)));
    p = S.projects[0];
    expect(p.verdict).toBe("worse");
    expect(p.status).toBe("measured");
    expect(p.rewardDue).toBe(true);
    S = reduce(SEED, doneLog(93, P("project.measured", { check: 30, value: 31 }, 32), P("project.measured", { check: 90, value: 45 }, 92),
      P("project.rewarded", { rule: "thanks", note: "Thank you" }, 93, "B. Hartmann"), P("project.claimed", {}, 93, AUTHOR)));
    p = S.projects[0];
    expect(p.status).toBe("recognised");
    expect(p.closed).toBe(true);
    expect(p.claimed).toEqual({ by: AUTHOR, day: 93 });
  });

  it("a check that is not in the company's rules, or recorded twice, does not count", () => {
    const p = reduce(SEED, doneLog(40, P("project.measured", { check: 45, value: 1 }, 40), P("project.measured", { check: 30, value: 40 }, 40), P("project.measured", { check: 30, value: 2 }, 40))).projects[0];
    expect(p.measures.map((m) => [m.check, m.value, m.verdict])).toEqual([[30, 40, "better"]]);
  });

  it("no number possible: done means 'not measured', no checks, counted in the ledger", () => {
    const S = reduce(SEED, logAt(3, raise("c_a"), yes("c_a"), P("project.baseline", { none: true, why: "Safety, no metric" }), P("project.started"), P("project.done", {}, 3)));
    const p = S.projects[0];
    expect(p.checks).toEqual([]);
    expect(p.verdict).toBe("not measured");
    expect(p.status).toBe("measured");
    expect(S.ledger.unmeasured).toBe(1);
  });

  it("with the company's rule 'none' a measured project is closed, nothing due", () => {
    const seed = { ...SEED, loop: { reward: { kind: "none" as const, amount: null, sharePct: null, capEur: null }, measureDays: [30] } };
    const p = reduce(seed, doneLog(32, P("project.measured", { check: 30, value: 30 }, 32))).projects[0];
    expect(p.status).toBe("measured");
    expect(p.rewardDue).toBe(false);
    expect(p.closed).toBe(true);
  });
});

describe("verdictOf and the rules", () => {
  const b = (better: "up" | "down", value = 100): Baseline => ({ none: false, metric: "m", unit: "", value, better, source: "", day: 0, by: "x" });
  it("within the tolerance is the same, either way", () => {
    expect(verdictOf(b("down"), 98.5, 2)).toEqual({ verdict: "same", changePct: -1.5 });
    expect(verdictOf(b("up"), 110, 2).verdict).toBe("better");
    expect(verdictOf(b("up"), 90, 2).verdict).toBe("worse");
    expect(verdictOf(b("down", 0), 3, 2)).toEqual({ verdict: "worse", changePct: null });
    expect(verdictOf(null, 3, 2).verdict).toBe("not measured");
  });

  it("loopRules fills and clamps; suggestedReward follows the rule", () => {
    expect(loopRules()).toEqual(LOOP_DEFAULTS);
    const r = loopRules({ discussEveryDays: 0, measureDays: [90, 30, 30, -1], tolerancePct: 99, reward: { kind: "share", amount: null, sharePct: 10, capEur: 500 } });
    expect(r.discussEveryDays).toBe(1);
    expect(r.measureDays).toEqual([30, 90]);
    expect(r.tolerancePct).toBe(50);
    expect(suggestedReward(r.reward, 12_000)).toBe(500);
    expect(suggestedReward(r.reward, 3_000)).toBe(300);
    expect(suggestedReward({ kind: "fixed", amount: 150, sharePct: null, capEur: null }, null)).toBe(150);
    expect(suggestedReward({ kind: "thanks", amount: null, sharePct: null, capEur: null }, 9_000)).toBeNull();
  });
});

const actor = (name: string, role: Actor["role"] = "leader", handle: string | null = null): Actor => ({ role, name, handle });
const q = (type: string, payload: Record<string, unknown> = {}, target = "p_one") => ({ type, target, payload });

describe("projects: who may", () => {
  const planning = reduce(SEED, logAt(0, raise("c_a"), yes("c_a"), P("project.member", { name: "M. Roth", on: true })));

  it("a yes with a project id: only as the first decision, with a lead and a usable id", () => {
    const open = reduce(SEED, logAt(0, raise("c_a")));
    const d = (payload: Record<string, unknown>) => ({ type: "case.decided", target: "c_a", payload });
    expect(mayAppend(actor("T. Vogel"), d({ answer: "yes", projectId: "p_new", lead: "L. Brandt" }), open).ok).toBe(true);
    expect(mayAppend(actor("T. Vogel"), d({ answer: "no", projectId: "p_new", lead: "L. Brandt" }), open).ok).toBe(false);
    expect(mayAppend(actor("T. Vogel"), d({ answer: "yes", projectId: "bad id!", lead: "L. Brandt" }), open).ok).toBe(false);
    expect(mayAppend(actor("T. Vogel"), d({ answer: "yes", projectId: "p_new", lead: " " }), open).ok).toBe(false);
    const decided = reduce(SEED, logAt(0, raise("c_a"), ev("case.decided", "T. Vogel", "c_a", { answer: "yes" })));
    expect(mayAppend(actor("T. Vogel"), d({ answer: "yes", projectId: "p_new", lead: "L. Brandt" }), decided).ok).toBe(false);
  });

  it("the lead (or a manager) runs it; the team adds steps; anyone comments", () => {
    expect(mayAppend(actor("L. Brandt"), q("project.baseline", { metric: "m", value: 1, better: "down" }), planning).ok).toBe(true);
    expect(mayAppend(actor("M. Roth"), q("project.baseline", { metric: "m", value: 1, better: "down" }), planning).ok).toBe(false);
    expect(mayAppend(actor("B. Hartmann", "manager"), q("project.baseline", { none: true, why: "No metric" }), planning).ok).toBe(true);
    expect(mayAppend(actor("L. Brandt"), q("project.baseline", { none: true }), planning).ok).toBe(false);
    expect(mayAppend(actor("L. Brandt"), q("project.started"), planning).ok).toBe(false);
    expect(mayAppend(actor("M. Roth"), q("project.step.added", { stepId: "s_1", text: "Cart" }), planning).ok).toBe(true);
    expect(mayAppend(actor("H. Sander"), q("project.step.added", { stepId: "s_1", text: "Cart" }), planning).ok).toBe(false);
    expect(mayAppend(actor("J. Schmidt", "member", AUTHOR), q("project.commented", { text: "Thanks!" }), planning).ok).toBe(true);
    expect(mayAppend(actor("L. Brandt"), q("project.started", {}, "p_none"), planning).ok).toBe(false);
  });

  it("a step moves by its owner or the lead; a check only once it opened; rewards by a manager; claims by the author", () => {
    const run = reduce(SEED, doneLog(31, P("project.step.added", { stepId: "s2", text: "Train", owner: "M. Roth" })));
    expect(mayAppend(actor("M. Roth"), q("project.step.moved", { stepId: "s2", to: "doing" }), run).ok).toBe(true);
    expect(mayAppend(actor("H. Sander"), q("project.step.moved", { stepId: "s2", to: "doing" }), run).ok).toBe(false);
    expect(mayAppend(actor("L. Brandt"), q("project.step.moved", { stepId: "s2", to: "sideways" }), run).ok).toBe(false);
    expect(mayAppend(actor("L. Brandt"), q("project.measured", { check: 30, value: 30 }), run).ok).toBe(false);
    const open = reduce(SEED, doneLog(32));
    expect(mayAppend(actor("L. Brandt"), q("project.measured", { check: 30, value: 30 }), open).ok).toBe(true);
    expect(mayAppend(actor("L. Brandt"), q("project.measured", { check: 45, value: 30 }), open).ok).toBe(false);
    const measured = reduce(SEED, doneLog(92, P("project.measured", { check: 30, value: 31 }, 32), P("project.measured", { check: 90, value: 30 }, 92)));
    expect(mayAppend(actor("L. Brandt"), q("project.rewarded", { rule: "thanks" }), measured).ok).toBe(false);
    expect(mayAppend(actor("B. Hartmann", "manager"), q("project.rewarded", { rule: "thanks" }), measured).ok).toBe(true);
    expect(mayAppend(actor("J. Schmidt", "member", AUTHOR), q("project.claimed"), measured).ok).toBe(false);
    const rewarded = reduce(SEED, doneLog(93, P("project.measured", { check: 30, value: 31 }, 32), P("project.measured", { check: 90, value: 30 }, 92), P("project.rewarded", { rule: "thanks" }, 93, "B. Hartmann")));
    expect(mayAppend(actor("J. Schmidt", "member", AUTHOR), q("project.claimed"), rewarded).ok).toBe(true);
    expect(mayAppend(actor("T. Vogel"), q("project.claimed"), rewarded).ok).toBe(false);
  });
});

describe("projects: sent to Jira (project.sync)", () => {
  const sync = (on: boolean, day = 0, who = "L. Brandt") => P("project.sync", { system: "jira", on }, day, who);
  const base = [raise("c_a"), yes("c_a")];
  const sent = reduce(SEED, logAt(0, ...base, sync(true)));

  it("a project starts out never synced, and the latest sync wins", () => {
    expect(reduce(SEED, logAt(0, ...base)).projects[0].sync).toBeNull();
    expect(sent.projects[0].sync).toEqual({ system: "jira", on: true, day: 0, by: "L. Brandt" });
    const stopped = reduce(SEED, logAt(3, ...base, sync(true, 1), sync(false, 3, "B. Hartmann")));
    expect(stopped.projects[0].sync).toEqual({ system: "jira", on: false, day: 3, by: "B. Hartmann" });
    const again = reduce(SEED, logAt(4, ...base, sync(true, 1), sync(false, 3), sync(true, 4)));
    expect(again.projects[0].sync).toMatchObject({ on: true, day: 4 });
  });

  it("is on the project's history", () => {
    expect(sent.projects[0].history.map((e) => e.type)).toContain("project.sync");
  });

  it("does nothing with a system it does not know or an on that is not true or false", () => {
    const S = reduce(SEED, logAt(0, ...base, P("project.sync", { system: "trello", on: true }), P("project.sync", { system: "jira" }), P("project.sync", { system: "jira", on: "yes" as unknown as boolean })));
    expect(S.projects[0].sync).toBeNull();
  });

  it("does not change once the project is stopped", () => {
    const S = reduce(SEED, logAt(2, ...base, sync(true, 1), P("project.stopped", { why: "Line closes" }, 2), sync(false, 2)));
    expect(S.projects[0].sync).toMatchObject({ on: true, day: 1 });
  });

  it("the lead or a manager may; nobody else; and only while the project is open", () => {
    const send = (name: string, role: Actor["role"] = "leader", state = sent) => mayAppend(actor(name, role), q("project.sync", { system: "jira", on: true }), state);
    expect(send("L. Brandt").ok).toBe(true);
    expect(send("B. Hartmann", "manager").ok).toBe(true);
    const roth = reduce(SEED, logAt(0, ...base, P("project.member", { name: "M. Roth", on: true })));
    expect(send("M. Roth", "member", roth)).toEqual({ ok: false, error: "Only the project's lead (or a manager) can do that." });
    expect(send("H. Sander", "member", roth).ok).toBe(false);
    expect(send("J. Schmidt", "member").ok).toBe(false);
    const closed = reduce(SEED, logAt(1, ...base, P("project.stopped", { why: "Line closes" }, 1)));
    expect(send("L. Brandt", "leader", closed)).toEqual({ ok: false, error: "This project is closed." });
    expect(mayAppend(actor("L. Brandt"), q("project.sync", { system: "jira", on: true }, "p_nope"), sent).ok).toBe(false);
  });

  it("needs a known system and an on of true or false", () => {
    const check = (payload: Record<string, unknown>) => mayAppend(actor("L. Brandt"), q("project.sync", payload), sent).ok;
    expect(check({ system: "jira", on: false })).toBe(true);
    expect(check({ system: "trello", on: true })).toBe(false);
    expect(check({ on: true })).toBe(false);
    expect(check({ system: "jira" })).toBe(false);
    expect(check({ system: "jira", on: "true" })).toBe(false);
  });

  it("the timeline says what happened", () => {
    const S = reduce(SEED, logAt(2, ...base, sync(true, 1), sync(false, 2)));
    const lines = timelineOf(S.projects[0]).map((l) => l.text);
    expect(lines).toContain("sent it to Jira");
    expect(lines).toContain("stopped syncing with Jira");
  });
});
