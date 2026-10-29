// Whole sync rounds (server/jira/round.ts) against the fake Jira over real HTTP, with the company's
// log in memory: create, push, pull, and - the point - that rounds with nothing to do do nothing.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { JIRA_ACTOR } from "@/features/integrations";
import type { SeqEvent } from "@/features/integrations/jira/plan";
import { JiraError, type JiraAccount, type JiraSettings } from "@/features/integrations/jira/types";
import { createCloudApi } from "@/server/jira/cloud";
import { runRound, type RoundResult, type RoundStore } from "@/server/jira/round";
import { testJira } from "@/server/jira/test";
import { startFakeJira, type FakeJira } from "../fake-jira/fake-jira";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };
const LEAD = "L. Brandt";

/** The company's log in memory, with the same duplicate rule as the database's idempotency key. */
class MemoryLog {
  events: SeqEvent[] = [];
  private keys = new Set<string>();
  private n = 0;
  /** Everything the sync appended, for "this round wrote nothing". */
  appended: SeqEvent[] = [];

  add(type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, ts = Date.now()): SeqEvent {
    const e: SeqEvent = { id: "m" + this.n, seq: ++this.n, ts, type, actor, target, payload, day: 0 };
    this.events.push(e);
    return e;
  }
  human(type: CaseEventType, payload: EventPayload = {}, target = "p_one") {
    return this.add(type, LEAD, target, payload);
  }
  store: RoundStore = {
    state: async () => reduce(SEED, { events: [...this.events], day: 0 }),
    eventsSince: async (after) => this.events.filter((e) => e.seq > after && e.type.startsWith("project.")),
    append: async (ev) => {
      if (this.keys.has(ev.idemKey)) return { ok: true, duplicate: true };
      this.keys.add(ev.idemKey);
      this.appended.push(this.add(ev.type as CaseEventType, JIRA_ACTOR, ev.target, ev.payload));
      return { ok: true, duplicate: false };
    },
  };
  stateNow() {
    return reduce(SEED, { events: [...this.events], day: 0 });
  }
  project() {
    return this.stateNow().projects.find((p) => p.id === "p_one")!;
  }
}

let fake: FakeJira;
let settings: JiraSettings;
// A fresh Jira for every test: the labels are per project id, and every test uses p_one.
beforeEach(async () => {
  fake = await startFakeJira({ token: "tok" });
  settings = {
    flavor: "cloud", siteUrl: fake.url, email: fake.email, projectKey: "NUP", epicTypeId: "10000", stepTypeId: "10001",
    autoEpic: true, pullNewIssues: true, pullComments: true,
  };
});
afterEach(async () => {
  await fake.close();
});

/** A company that runs rounds like server/jira-sync.ts: the cursors from one round feed the next. */
function company(over: { enabledAt?: Date; settings?: Partial<JiraSettings> } = {}) {
  const log = new MemoryLog();
  const enabledAt = over.enabledAt ?? new Date(Date.now() - 60_000);
  const api = createCloudApi({ ...settings, ...over.settings }, "tok");
  const cur: { pushedSeq: number; pulledAt: Date | null; account: JiraAccount | null; n: number } = { pushedSeq: 0, pulledAt: null, account: null, n: 0 };
  const round = async (reconcile = false): Promise<RoundResult> => {
    const r = await runRound(api, log.store, {
      settings: { ...settings, ...over.settings }, enabledAt, pushedSeq: cur.pushedSeq, pulledAt: cur.pulledAt, account: cur.account,
      reconcile: reconcile || cur.pulledAt === null, now: new Date(),
    });
    cur.pushedSeq = r.pushedSeq;
    cur.pulledAt = r.pulledAt;
    cur.account = r.account;
    cur.n++;
    return r;
  };
  /** A project that was decided yes after the switch-on and has steps. */
  const open = (steps: { id: string; text: string; to?: string }[]) => {
    log.add("case.raised", "Anonymous #4471", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" });
    log.add("case.decided", "T. Vogel", "c_a", { answer: "yes", projectId: "p_one", lead: LEAD, title: "Shorter changeover" });
    for (const s of steps) log.human("project.step.added", { stepId: s.id, text: s.text, ...(s.to ? { to: s.to } : {}) });
  };
  /** Rounds with nothing to do: no events appended, nothing written to Jira. */
  const expectSilent = async (rounds: number) => {
    const events = log.events.length;
    const writes = fake.writes().length;
    for (let i = 0; i < rounds; i++) {
      const r = await round();
      expect(r.wrote).toBe(0);
      expect(r.warnings).toEqual([]);
    }
    expect(log.events).toHaveLength(events);
    expect(fake.writes()).toHaveLength(writes);
  };
  return { log, api, round, open, expectSilent, cur };
}

describe("jira sync: a whole project through the fake Jira", () => {
  it("creates the epic and the issues, links them, and then does nothing for five rounds", async () => {
    const c = company();
    c.open([{ id: "s1", text: "Pre-stage the tools" }, { id: "s2", text: "Label the bins" }, { id: "s3", text: "Walk the line", to: "doing" }]);

    const first = await c.round();
    expect(first.warnings).toEqual([]);
    const issues = [...fake.issues.values()];
    expect(issues.map((i) => i.summary)).toEqual(["Shorter changeover", "Pre-stage the tools", "Label the bins", "Walk the line"]);
    const [epic, ...kids] = issues;
    expect(epic.labels).toEqual(["nextup-p_one"]);
    expect(epic.typeId).toBe("10000");
    expect(kids.map((k) => [k.typeId, k.parentKey, k.labels[0]])).toEqual([
      ["10001", epic.key, "nextup-step-s1"], ["10001", epic.key, "nextup-step-s2"], ["10001", epic.key, "nextup-step-s3"],
    ]);
    // A step already on Doing catches up after its issue exists (To Do -> In Progress).
    expect(kids[2].status.name).toBe("In Progress");

    const p = c.log.project();
    expect(p.links.filter((l) => l.stepId === null).map((l) => l.key)).toEqual([epic.key]);
    expect(p.steps.map((s) => s.external?.key)).toEqual(kids.map((k) => k.key));
    expect(c.log.appended.every((e) => e.actor === JIRA_ACTOR)).toBe(true);
    expect(c.log.appended.map((e) => e.type)).toEqual(Array(4).fill("project.linked"));

    await c.expectSilent(5);
  });

  it("a person's move in NextUp reaches Jira (hopping through In Progress), and the echo stays quiet", async () => {
    const c = company();
    c.open([{ id: "s1", text: "Pre-stage the tools" }]);
    await c.round();
    const key = c.log.project().steps[0].external!.key;

    c.log.human("project.step.moved", { stepId: "s1", to: "done" });
    const r = await c.round();
    expect(r.warnings).toEqual([]);
    expect(fake.issues.get(key)!.status.name).toBe("Done");
    expect(fake.writes().filter((w) => w.path.includes(`/issue/${key}/transitions`))).toHaveLength(2); // To Do -> In Progress -> Done
    expect(c.log.project().steps[0].column).toBe("done");
    await c.expectSilent(5);
  });

  it("blocked shows as In Progress in Jira and stays Blocked on the board", async () => {
    const c = company();
    c.open([{ id: "s1", text: "Wait for parts" }]);
    await c.round();
    const key = c.log.project().steps[0].external!.key;
    c.log.human("project.step.moved", { stepId: "s1", to: "blocked", why: "waiting for parts" });
    await c.round();
    expect(fake.issues.get(key)!.status.name).toBe("In Progress");
    expect(c.log.project().steps[0].column).toBe("blocked");
    await c.expectSilent(3);
    expect(c.log.project().steps[0].column).toBe("blocked");
  });

  it("a person's change in Jira reaches the board: status, rename, comment, new child", async () => {
    const c = company();
    c.open([{ id: "s1", text: "Pre-stage the tools" }]);
    await c.round();
    const epic = c.log.project().links.find((l) => l.stepId === null)!.key;
    const key = c.log.project().steps[0].external!.key;
    const writes = fake.writes().length;

    fake.human.move(key, "In Progress");
    fake.human.rename(key, "Stage the tools at line 3");
    fake.human.comment(epic, "Parts arrive Friday.");
    fake.human.comment(key, "y".repeat(3000), "acc-bob");
    const child = fake.human.createChild(epic, "Check the torque wrench");
    const r = await c.round();
    expect(r.warnings).toEqual([]);

    const p = c.log.project();
    expect(p.steps.find((s) => s.id === "s1")).toMatchObject({ column: "doing", text: "Stage the tools at line 3" });
    expect(p.steps.find((s) => s.id === "jira-" + child)).toMatchObject({ text: "Check the torque wrench", column: "todo", external: { system: "jira", key: child } });
    const said = p.history.filter((e) => e.type === "project.commented").map((e) => String(e.payload.text));
    expect(said).toHaveLength(2);
    expect(said[0]).toBe(`Jira ${epic}: Parts arrive Friday.`);
    expect(said[1]).toHaveLength(2000);
    expect(said.join("")).not.toMatch(/acc-|bob|alice/);
    // The pull wrote events, and nothing went back to Jira.
    expect(fake.writes()).toHaveLength(writes);
    await c.expectSilent(5);
  });

  it("a rename and a move in NextUp reach Jira; a removed step is marked, never deleted", async () => {
    const c = company();
    c.open([{ id: "s1", text: "Pre-stage the tools" }, { id: "s2", text: "Label the bins" }]);
    await c.round();
    const [k1, k2] = c.log.project().steps.map((s) => s.external!.key);

    c.log.human("project.step.edited", { stepId: "s1", text: "A clearer title" });
    c.log.human("project.step.edited", { stepId: "s2", removed: true });
    const r = await c.round();
    expect(r.warnings).toEqual([]);
    expect(fake.issues.get(k1)!.summary).toBe("A clearer title");
    expect(fake.issues.get(k2)!.labels).toContain("nextup-removed");
    expect(fake.issues.get(k2)!.comments).toHaveLength(1);
    expect(c.log.project().steps.map((s) => s.id)).toEqual(["s1"]);
    await c.expectSilent(5);
    expect(fake.issues.get(k2)!.comments).toHaveLength(1); // not again
  });

  it("when both sides change the same step in one round, NextUp wins", async () => {
    const c = company();
    c.open([{ id: "s1", text: "Pre-stage the tools" }]);
    await c.round();
    const key = c.log.project().steps[0].external!.key;
    fake.human.move(key, "Done");
    c.log.human("project.step.moved", { stepId: "s1", to: "doing" });
    await c.round();
    expect(c.log.project().steps[0].column).toBe("doing");
    expect(fake.issues.get(key)!.status.name).toBe("In Progress");
    await c.expectSilent(3);
  });

  it("Send to Jira backfills an older project; Stop syncing freezes it", async () => {
    const c = company({ enabledAt: new Date(Date.now() + 3_600_000) }); // nothing counts as 'after the switch-on'
    c.open([{ id: "s1", text: "Old step" }]);
    await c.round();
    expect(c.log.project().links).toEqual([]);

    c.log.human("project.sync", { system: "jira", on: true });
    await c.round();
    expect(c.log.project().links).toHaveLength(2);
    await c.expectSilent(3);

    c.log.human("project.sync", { system: "jira", on: false });
    c.log.human("project.step.added", { stepId: "s2", text: "Added while stopped" });
    const key = c.log.project().steps[0].external!.key;
    c.log.human("project.step.moved", { stepId: "s1", to: "done" });
    await c.round();
    expect(c.log.project().steps.find((s) => s.id === "s2")!.external).toBeNull();
    expect(fake.issues.get(key)!.status.name).toBe("To Do");
  });

  it("an issue a person links by hand takes Jira's status, and then both sides sync", async () => {
    const c = company({ enabledAt: new Date(Date.now() + 3_600_000) });
    c.open([{ id: "s1", text: "Existing work" }]);
    await c.round();
    const existing = fake.human.createChild("NUP-0", "Existing work in Jira");
    fake.human.move(existing, "Done");
    c.log.human("project.linked", { system: "jira", key: existing, url: `${fake.url}/browse/${existing}`, stepId: "s1" });
    await c.round();
    expect(c.log.project().steps[0].column).toBe("done");
    expect(c.log.project().steps[0].external?.key).toBe(existing);
    c.log.human("project.step.moved", { stepId: "s1", to: "todo" });
    await c.round();
    expect(fake.issues.get(existing)!.status.name).toBe("To Do"); // Done -> In Progress -> To Do
  });

  it("repeating a create finds the labelled issue and adopts it instead of making a second", async () => {
    const c = company();
    c.open([{ id: "s1", text: "Pre-stage the tools" }]);
    await c.round();
    const before = fake.issues.size;
    // The company lost its links (a restore, a re-import): the same project, no link events.
    const again = company();
    again.open([{ id: "s1", text: "Pre-stage the tools" }]);
    await again.round();
    // The label is per project and step, so the second company's project finds the first one's issues.
    expect(fake.issues.size).toBe(before);
    expect(again.log.project().steps[0].external?.key).toBe(c.log.project().steps[0].external?.key);
  });
});

describe("jira sync: Jira says no", () => {
  it("a 429 ends the round with the wait Jira asked for, and the next round carries on", async () => {
    const c = company();
    c.open([{ id: "s1", text: "Pre-stage the tools" }]);
    fake.inject429(1, 60);
    const err = await c.round().catch((e) => e);
    expect(err).toBeInstanceOf(JiraError);
    expect(err).toMatchObject({ status: 429, retryAfterMs: 60_000 });
    expect(c.log.appended).toHaveLength(0);
    await c.round();
    expect(c.log.project().steps[0].external).not.toBeNull();
  });

  it("a short 429 is waited out once inside the client", async () => {
    const waits: number[] = [];
    const api = createCloudApi({ ...settings }, "tok", { sleep: async (ms) => void waits.push(ms) });
    fake.inject429(1, 1);
    await expect(api.myself()).resolves.toMatchObject({ id: fake.accountId });
    expect(waits).toEqual([1000]);
  });

  it("a wrong token is a 401 that starts the error line, so the admin sees 'expired'", async () => {
    const api = createCloudApi({ ...settings }, "wrong");
    await expect(api.myself()).rejects.toMatchObject({ status: 401, message: expect.stringMatching(/^401 /) });
  });

  it("a step Jira's workflow cannot reach is one warning, not a stuck round", async () => {
    await fake.close();
    fake = await startFakeJira({ token: "tok", stuckDone: true });
    const c = company({ settings: { siteUrl: fake.url } });
    c.open([{ id: "s1", text: "Pre-stage the tools" }]);
    await c.round();
    const key = c.log.project().steps[0].external!.key;
    fake.human.move(key, "Done");
    await c.round(); // the board follows Jira to Done
    c.log.human("project.step.moved", { stepId: "s1", to: "todo" });
    const r = await c.round();
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/cannot move to todo/);
    // The event is spent: the next rounds are quiet, and the board keeps what the person chose.
    await c.expectSilent(3);
    expect(c.log.project().steps[0].column).toBe("todo");
  });
});

describe("jira sync: the connection test", () => {
  it("passes against a good site", async () => {
    const r = await testJira(settings, "tok");
    expect(r.ok).toBe(true);
    expect(r.checks.map((c) => c.id)).toEqual(["auth", "project", "types", "permissions", "labels"]);
    expect(r.account).toMatchObject({ id: fake.accountId });
    expect(r.issueTypes.map((t) => t.id)).toEqual(["10000", "10001"]);
  });

  it("names what is wrong: bad token, unknown project, missing type, no permission", async () => {
    const bad = await testJira(settings, "nope");
    expect(bad).toMatchObject({ ok: false, account: null });
    expect(bad.checks[0]).toMatchObject({ id: "auth", ok: false });

    const noProject = await testJira({ ...settings, projectKey: "ZZZ" }, "tok");
    expect(noProject.checks.find((c) => c.id === "project")).toMatchObject({ ok: false });

    const noType = await testJira({ ...settings, stepTypeId: "99999" }, "tok");
    expect(noType.checks.find((c) => c.id === "types")).toMatchObject({ ok: false });

    const limited = await startFakeJira({ token: "tok", permissions: { CREATE_ISSUES: false } });
    try {
      const r = await testJira({ ...settings, siteUrl: limited.url }, "tok");
      expect(r.ok).toBe(false);
      expect(r.checks.find((c) => c.id === "permissions")?.detail).toMatch(/create issues/);
    } finally {
      await limited.close();
    }
  });

  it("a Data Center site is a failed check, not a throw", async () => {
    const r = await testJira({ ...settings, flavor: "dc" }, "tok");
    expect(r.ok).toBe(false);
    expect(r.checks[0].detail).toMatch(/not supported yet/);
  });
});
