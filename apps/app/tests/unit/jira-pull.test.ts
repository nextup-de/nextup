// Jira -> NextUp: what planPull() writes (features/integrations/jira/pull.ts).
import { describe, expect, it } from "vitest";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { MAX_COMMENT, planPull, type PullInput } from "@/features/integrations/jira/pull";
import type { JiraComment, JiraHistory, JiraIssue, JiraSettings, JiraStatus } from "@/features/integrations/jira/types";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };
const SETTINGS: JiraSettings = {
  flavor: "cloud", siteUrl: "https://acme.atlassian.net", email: "bot@acme.example", projectKey: "NUP",
  epicTypeId: "10000", stepTypeId: "10001", autoEpic: true, pullNewIssues: true, pullComments: true,
};
const BOT = { id: "acc-bot", name: "NextUp Bot" };

let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}) =>
  ({ id: "e" + n++, ts: 0, type, actor, target, payload, day: 0 });
const P = (type: CaseEventType, payload: EventPayload = {}, actor = "L. Brandt") => ev(type, actor, "p_one", payload);

/** A project with an epic NUP-1 and two steps: s1 (NUP-2) and s2 (NUP-3, on the Doing column). */
const log = [
  ev("case.raised", "Anonymous #4471", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" }),
  ev("case.decided", "T. Vogel", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", title: "Shorter changeover" }),
  P("project.step.added", { stepId: "s1", text: "Pre-stage the tools" }),
  P("project.step.added", { stepId: "s2", text: "Label the bins", to: "doing" }),
  P("project.linked", { system: "jira", key: "NUP-1", url: "https://acme.atlassian.net/browse/NUP-1" }, "system:jira"),
  P("project.linked", { system: "jira", key: "NUP-2", url: "https://acme.atlassian.net/browse/NUP-2", stepId: "s1" }, "system:jira"),
  P("project.linked", { system: "jira", key: "NUP-3", url: "https://acme.atlassian.net/browse/NUP-3", stepId: "s2" }, "system:jira"),
];
const state = (extra: ReturnType<typeof ev>[] = []) => reduce(SEED, { events: [...log, ...extra], day: 0 });

const TODO: JiraStatus = { id: "1", name: "To Do", statusCategory: { key: "new" } };
const DOING: JiraStatus = { id: "3", name: "In Progress", statusCategory: { key: "indeterminate" } };
const DONE: JiraStatus = { id: "10", name: "Done", statusCategory: { key: "done" } };

const hist = (id: string, accountId: string | undefined, field: string, created = "2026-10-29T10:00:00.000+0100"): JiraHistory => ({
  id, created, ...(accountId ? { author: { accountId } } : {}),
  items: [{ field, from: null, to: null, fromString: null, toString: null }],
});
const issue = (key: string, o: { status?: JiraStatus; summary?: string; parent?: string; labels?: string[]; typeId?: string; histories?: JiraHistory[] } = {}): JiraIssue => ({
  id: "1" + key.replace(/\D/g, ""), key,
  fields: {
    summary: o.summary ?? "Pre-stage the tools", status: o.status ?? TODO, issuetype: { id: o.typeId ?? "10001", name: "Task" },
    ...(o.parent ? { parent: { key: o.parent } } : {}), labels: o.labels ?? [],
  },
  changelog: { histories: o.histories ?? [] },
});
const comment = (id: string, text: string, accountId = "acc-alice", created = "2026-10-29T10:00:00.000+0100"): JiraComment => ({
  id, author: { accountId }, created, body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
});

const pull = (o: Partial<PullInput> & { issues?: JiraIssue[] }, extra: ReturnType<typeof ev>[] = []) =>
  planPull({ state: state(extra), settings: SETTINGS, account: BOT, enabledAt: new Date(0), issues: [], comments: {}, commentsSince: null, ...o });

describe("jira pull: status", () => {
  it("a person's status change moves the step, once, under the history's key", () => {
    const out = pull({ issues: [issue("NUP-2", { status: DONE, histories: [hist("501", "acc-alice", "status")] })] });
    expect(out).toEqual([{
      type: "project.step.moved", target: "p_one", payload: { stepId: "s1", to: "done", why: "Moved in Jira (Done)" }, idemKey: "jira:NUP-2:status:501",
    }]);
  });

  it("the integration account's own change coming back is skipped", () => {
    expect(pull({ issues: [issue("NUP-2", { status: DONE, histories: [hist("502", "acc-bot", "status")] })] })).toEqual([]);
  });

  it("an automation (a history without an author) counts as a change; the newest history decides", () => {
    const out = pull({ issues: [issue("NUP-2", { status: DOING, histories: [hist("1", "acc-bot", "status", "2026-10-29T09:00:00.000+0100"), hist("2", undefined, "status", "2026-10-29T10:00:00.000+0100")] })] });
    expect(out).toMatchObject([{ payload: { stepId: "s1", to: "doing" }, idemKey: "jira:NUP-2:status:2" }]);
    // The sync's own was the newer one: NextUp has moved on since, NextUp wins.
    expect(pull({ issues: [issue("NUP-2", { status: DOING, histories: [hist("1", "acc-alice", "status", "2026-10-29T09:00:00.000+0100"), hist("2", "acc-bot", "status", "2026-10-29T10:00:00.000+0100")] })] })).toEqual([]);
  });

  it("no event when NextUp already shows it: same column, or Blocked against In Progress", () => {
    expect(pull({ issues: [issue("NUP-2", { status: TODO, histories: [hist("3", "acc-alice", "status")] })] })).toEqual([]);
    const blocked = [P("project.step.moved", { stepId: "s2", to: "blocked", why: "waiting" })];
    expect(pull({ issues: [issue("NUP-3", { status: DOING, histories: [hist("4", "acc-alice", "status")] })] }, blocked)).toEqual([]);
    // ...but Done in Jira moves a Blocked card.
    expect(pull({ issues: [issue("NUP-3", { status: DONE, histories: [hist("5", "acc-alice", "status")] })] }, blocked)).toMatchObject([{ payload: { stepId: "s2", to: "done" } }]);
  });

  it("an issue linked by hand whose status never changed takes Jira's status once", () => {
    const out = pull({ issues: [issue("NUP-2", { status: DONE })] });
    expect(out).toMatchObject([{ payload: { stepId: "s1", to: "done" }, idemKey: "jira:NUP-2:status:init" }]);
  });

  it("a project told to stop syncing is not touched", () => {
    const off = [P("project.sync", { system: "jira", on: false })];
    expect(pull({ issues: [issue("NUP-2", { status: DONE, histories: [hist("6", "acc-alice", "status")] })] }, off)).toEqual([]);
  });

  it("a status pinned in the settings is exact", () => {
    const settings = { ...SETTINGS, statusFor: { blocked: "3" } };
    const out = pull({ settings, issues: [issue("NUP-2", { status: DOING, histories: [hist("7", "acc-alice", "status")] })] });
    expect(out).toMatchObject([{ payload: { stepId: "s1", to: "blocked" } }]);
  });
});

describe("jira pull: summary", () => {
  it("a person's rename edits the step's text", () => {
    const out = pull({ issues: [issue("NUP-2", { summary: "Stage tools at the line", histories: [hist("11", "acc-alice", "summary")] })] });
    expect(out).toEqual([{ type: "project.step.edited", target: "p_one", payload: { stepId: "s1", text: "Stage tools at the line" }, idemKey: "jira:NUP-2:summary:11" }]);
  });

  it("our own rename, an unchanged summary, or an issue with no summary history writes nothing", () => {
    expect(pull({ issues: [issue("NUP-2", { summary: "Other", histories: [hist("12", "acc-bot", "summary")] })] })).toEqual([]);
    expect(pull({ issues: [issue("NUP-2", { histories: [hist("13", "acc-alice", "summary")] })] })).toEqual([]);
    expect(pull({ issues: [issue("NUP-2", { summary: "Other" })] })).toEqual([]);
  });
});

describe("jira pull: new issues under the epic", () => {
  it("a child of the epic becomes a step with its status as the column", () => {
    const out = pull({ issues: [issue("NUP-9", { parent: "NUP-1", summary: "Found in Jira", status: DOING })] });
    expect(out).toEqual([{
      type: "project.step.added", target: "p_one",
      payload: { stepId: "jira-NUP-9", text: "Found in Jira", to: "doing", external: { system: "jira", key: "NUP-9", url: "https://acme.atlassian.net/browse/NUP-9" } },
      idemKey: "jira:added:NUP-9",
    }]);
  });

  it("not when the switch is off, for our own labelled issues, for epics, or for strangers", () => {
    const child = issue("NUP-9", { parent: "NUP-1" });
    expect(pull({ settings: { ...SETTINGS, pullNewIssues: false }, issues: [child] })).toEqual([]);
    expect(pull({ issues: [issue("NUP-9", { parent: "NUP-1", labels: ["nextup-step-s9"] })] })).toEqual([]);
    expect(pull({ issues: [issue("NUP-9", { parent: "NUP-1", typeId: "10000" })] })).toEqual([]);
    expect(pull({ issues: [issue("NUP-9", { parent: "NUP-77" }), issue("NUP-10")] })).toEqual([]);
  });

  it("not into a stopped project, and not twice", () => {
    expect(pull({ issues: [issue("NUP-9", { parent: "NUP-1" })] }, [P("project.stopped", { why: "no budget" })])).toEqual([]);
    expect(pull({ issues: [issue("NUP-9", { parent: "NUP-1" })] }, [P("project.step.added", { stepId: "jira-NUP-9", text: "x" })])).toEqual([]);
  });
});

describe("jira pull: comments", () => {
  it("a comment becomes a project comment with no author, under its idempotency key", () => {
    const out = pull({ comments: { "NUP-2": [comment("900", "Looks good")], "NUP-1": [comment("901", "Epic note")] } });
    expect(out).toEqual([
      { type: "project.commented", target: "p_one", payload: { text: "Jira NUP-2: Looks good" }, idemKey: "jira:comment:900" },
      { type: "project.commented", target: "p_one", payload: { text: "Jira NUP-1: Epic note" }, idemKey: "jira:comment:901" },
    ]);
    expect(JSON.stringify(out)).not.toContain("alice");
  });

  it("is cut to 2000 characters, the most the app takes", () => {
    const [e] = pull({ comments: { "NUP-2": [comment("902", "x".repeat(5000))] } });
    expect(String(e.payload.text)).toHaveLength(MAX_COMMENT);
  });

  it("skips the integration account's comments, older ones, empty ones, and all when the switch is off", () => {
    const since = new Date("2026-10-29T09:00:00.000Z");
    const list = {
      "NUP-2": [comment("1", "ours", "acc-bot"), comment("2", "old", "acc-alice", "2026-10-29T08:00:00.000+0000"), comment("3", "   "), comment("4", "new", "acc-alice", "2026-10-29T09:30:00.000+0000")],
    };
    expect(pull({ comments: list, commentsSince: since }).map((e) => e.idemKey)).toEqual(["jira:comment:4"]);
    expect(pull({ settings: { ...SETTINGS, pullComments: false }, comments: list })).toEqual([]);
  });

  it("an issue the log does not know has its comments ignored", () => {
    expect(pull({ comments: { "NUP-99": [comment("5", "stranger")] } })).toEqual([]);
  });
});
