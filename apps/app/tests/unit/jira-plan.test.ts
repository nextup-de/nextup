// NextUp -> Jira: what planPush() asks for (features/integrations/jira/plan.ts).
import { describe, expect, it } from "vitest";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { epicIdemKey, issueIdemKey, MAX_CREATES, planPush, type SeqEvent } from "@/features/integrations/jira/plan";
import type { JiraSettings } from "@/features/integrations/jira/types";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };

const SETTINGS: JiraSettings = {
  flavor: "cloud", siteUrl: "https://acme.atlassian.net", email: "bot@acme.example", projectKey: "NUP",
  epicTypeId: "10000", stepTypeId: "10001", autoEpic: true, pullNewIssues: false, pullComments: true,
};

const ENABLED = new Date(1_000_000);
const AFTER = 2_000_000; // ts of an idea decided after the integration was switched on
const BEFORE = 500_000;

const LEAD = "L. Brandt";
const BOT = "system:jira";
let seq = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, ts = 0): SeqEvent =>
  ({ id: "e" + seq, seq: ++seq, ts, type, actor, target, payload, day: 0 });
const P = (type: CaseEventType, payload: EventPayload = {}, actor = LEAD) => ev(type, actor, "p_one", payload);
const open = (ts: number) => [
  ev("case.raised", "Anonymous #4471", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" }),
  ev("case.decided", "T. Vogel", "c_a", { answer: "yes", projectId: "p_one", lead: LEAD, title: "Shorter changeover" }, ts),
];
const stateOf = (events: SeqEvent[]) => reduce(SEED, { events, day: 0 });
const add = (id: string, text = "Step " + id, extra: EventPayload = {}) => P("project.step.added", { stepId: id, text, ...extra });
const linkEpic = () => P("project.linked", { system: "jira", key: "NUP-1", url: "https://acme.atlassian.net/browse/NUP-1" }, BOT);
const linkStep = (id: string, key: string) => P("project.linked", { system: "jira", key, url: "https://acme.atlassian.net/browse/" + key, stepId: id }, BOT);
const plan = (log: SeqEvent[], since: SeqEvent[] = log, settings = SETTINGS, enabledAt: Date | null = ENABLED) =>
  planPush(stateOf(log), since, settings, { enabledAt });

describe("jira plan: creating the epic and the issues", () => {
  it("an idea decided yes after the integration was switched on gets an epic and an issue per step", () => {
    const log = [...open(AFTER), add("s1"), add("s2")];
    const jobs = plan(log);
    expect(jobs.map((j) => j.kind)).toEqual(["epic", "issue", "issue"]);
    expect(jobs[0]).toMatchObject({ kind: "epic", projectId: "p_one", title: "Shorter changeover", label: "nextup-p_one", idemKey: epicIdemKey("p_one") });
    expect(jobs[1]).toMatchObject({ kind: "issue", stepId: "s1", epicKey: null, summary: "Step s1", label: "nextup-step-s1", idemKey: issueIdemKey("s1") });
  });

  it("an idea decided before the switch-on gets nothing by itself, and neither does auto-epic off", () => {
    expect(plan([...open(BEFORE), add("s1")])).toEqual([]);
    expect(plan([...open(AFTER), add("s1")], undefined, { ...SETTINGS, autoEpic: false })).toEqual([]);
    expect(plan([...open(AFTER), add("s1")], undefined, SETTINGS, null)).toEqual([]);
  });

  it("Send to Jira backfills an older project: the epic and all its steps", () => {
    const log = [...open(BEFORE), add("s1"), add("s2"), P("project.sync", { system: "jira", on: true })];
    const jobs = plan(log);
    expect(jobs.map((j) => j.kind)).toEqual(["epic", "issue", "issue"]);
    expect(jobs[0].seq).toBe(log[log.length - 1].seq); // caused by the project.sync
  });

  it("with the epic already linked a new step is just an issue under it", () => {
    const log = [...open(AFTER), linkEpic(), add("s1")];
    expect(plan(log)).toEqual([expect.objectContaining({ kind: "issue", stepId: "s1", epicKey: "NUP-1" })]);
  });

  it("replaying after everything is linked gives no jobs", () => {
    const log = [...open(AFTER), add("s1"), linkEpic(), linkStep("s1", "NUP-2")];
    expect(plan(log)).toEqual([]);
  });

  it("Stop syncing means nothing is created or pushed", () => {
    const log = [...open(AFTER), add("s1"), linkEpic(), linkStep("s1", "NUP-2"), P("project.sync", { system: "jira", on: false }), P("project.step.moved", { stepId: "s1", to: "done" })];
    expect(plan(log)).toEqual([]);
  });

  it("a stopped project gets no new epic", () => {
    const log = [...open(AFTER), add("s1"), P("project.stopped", { why: "no budget" })];
    expect(plan(log)).toEqual([]);
  });

  it("creates at most MAX_CREATES per round; the rest waits for the next", () => {
    const steps = Array.from({ length: 30 }, (_, i) => add("s" + i));
    const jobs = plan([...open(AFTER), ...steps]);
    expect(jobs).toHaveLength(MAX_CREATES);
    expect(jobs[0].kind).toBe("epic");
    expect(plan([...open(AFTER), ...steps], undefined, SETTINGS, ENABLED).filter((j) => j.kind === "issue")).toHaveLength(MAX_CREATES - 1);
  });
});

describe("jira plan: what people do afterwards", () => {
  const base = () => [...open(AFTER), add("s1"), add("s2"), linkEpic(), linkStep("s1", "NUP-2"), linkStep("s2", "NUP-3")];

  it("a person's move becomes a transition to the step's column; blocked stays blocked for the runner to map", () => {
    const b = base();
    const log = [...b, P("project.step.moved", { stepId: "s1", to: "doing" }), P("project.step.moved", { stepId: "s2", to: "blocked", why: "waiting" })];
    const jobs = plan(log, log.slice(b.length));
    expect(jobs).toEqual([
      expect.objectContaining({ kind: "transition", stepId: "s1", issueKey: "NUP-2", to: "doing" }),
      expect.objectContaining({ kind: "transition", stepId: "s2", issueKey: "NUP-3", to: "blocked" }),
    ]);
  });

  it("the sync's own moves are never pushed back", () => {
    const b = base();
    const log = [...b, P("project.step.moved", { stepId: "s1", to: "done" }, BOT)];
    expect(plan(log, log.slice(b.length))).toEqual([]);
  });

  it("when the sync moved it after the person did, Jira already knows: the last move decides", () => {
    const b = base();
    const log = [...b, P("project.step.moved", { stepId: "s1", to: "doing" }), P("project.step.moved", { stepId: "s1", to: "done" }, BOT)];
    expect(plan(log, log.slice(b.length))).toEqual([]);
  });

  it("several moves of one step in a round are one transition, to where it ended", () => {
    const b = base();
    const log = [...b, P("project.step.moved", { stepId: "s1", to: "doing" }), P("project.step.moved", { stepId: "s1", to: "done" })];
    const jobs = plan(log, log.slice(b.length));
    expect(jobs).toEqual([expect.objectContaining({ kind: "transition", stepId: "s1", to: "done" })]);
  });

  it("a move from before the step was linked says nothing about its issue", () => {
    const log = [...open(AFTER), add("s1"), linkEpic(), P("project.step.moved", { stepId: "s1", to: "done" }), linkStep("s1", "NUP-2")];
    expect(plan(log)).toEqual([]);
  });

  it("a text edit puts the step's text in the issue's summary; other edits do not", () => {
    const b = base();
    const log = [...b, P("project.step.edited", { stepId: "s1", text: "A better title" }), P("project.step.edited", { stepId: "s2", owner: "Sam" })];
    expect(plan(log, log.slice(b.length))).toEqual([expect.objectContaining({ kind: "summary", stepId: "s1", issueKey: "NUP-2", summary: "A better title" })]);
  });

  it("a removed step marks its issue; it is never deleted", () => {
    const b = base();
    const log = [...b, P("project.step.edited", { stepId: "s1", removed: true })];
    expect(plan(log, log.slice(b.length))).toEqual([expect.objectContaining({ kind: "remove", stepId: "s1", issueKey: "NUP-2" })]);
  });

  it("a removed step that came from Jira (external on step.added, no link) is still found", () => {
    const log = [...open(AFTER), linkEpic(), add("jira-NUP-9", "From Jira", { external: { system: "jira", key: "NUP-9" } })];
    const more = [...log, P("project.step.edited", { stepId: "jira-NUP-9", removed: true })];
    expect(plan(more, more.slice(log.length))).toEqual([expect.objectContaining({ kind: "remove", issueKey: "NUP-9" })]);
  });

  it("steps linked by hand sync even when the project was never sent: moves go out, nothing is created", () => {
    const log = [...open(BEFORE), add("s1"), add("s2"), P("project.linked", { system: "jira", key: "NUP-7", url: "https://acme.atlassian.net/browse/NUP-7", stepId: "s1" })];
    const more = [...log, P("project.step.moved", { stepId: "s1", to: "done" }), P("project.step.moved", { stepId: "s2", to: "doing" })];
    expect(plan(more, more.slice(log.length))).toEqual([expect.objectContaining({ kind: "transition", issueKey: "NUP-7", to: "done" })]);
  });
});
