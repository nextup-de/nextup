// The Jira Data Center client (server/jira/dc.ts) against the fake Jira in Data Center mode, the
// choice of client by flavor (server/jira/flavors.ts), and what accepts a Data Center site.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import type { SeqEvent } from "@/features/integrations/jira/plan";
import type { CaseEventType } from "@/features/cases/events";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { JIRA_ACTOR } from "@/features/integrations";
import { JiraError, type JiraSettings } from "@/features/integrations/jira/types";
import { emptyStatusFor, settingsFromForm } from "@/features/admin/jira-admin";
import { createDcApi } from "@/server/jira/dc";
import { jiraApiFor } from "@/server/jira/flavors";
import { runRound, type RoundStore } from "@/server/jira/round";
import { testJira } from "@/server/jira/test";
import { startFakeJira, EPIC_TYPE, TASK_TYPE, type FakeJira } from "../fake-jira/fake-jira";

const TOKEN = "pat-123";
let fake: FakeJira;
let settings: JiraSettings;

const dcSettings = (f: FakeJira): JiraSettings => ({
  flavor: "dc", siteUrl: f.url, email: "", projectKey: "NUP", epicTypeId: EPIC_TYPE.id, stepTypeId: TASK_TYPE.id,
  autoEpic: true, pullNewIssues: true, pullComments: true,
});

beforeEach(async () => {
  fake = await startFakeJira({ flavor: "dc", token: TOKEN });
  settings = dcSettings(fake);
});
afterEach(async () => {
  await fake.close();
});

describe("CNX Jira Data Center client", () => {
  it("myself gives the account key as id; project, issue types and permissions answer", async () => {
    const api = createDcApi(settings, TOKEN);
    expect(await api.myself()).toEqual({ id: "acc-bot", name: "NextUp Bot" });
    expect(await api.project("NUP")).toMatchObject({ key: "NUP", name: "NextUp test" });
    expect(await api.project("NOPE")).toBeNull();
    expect((await api.issueTypes("NUP")).map((t) => t.id)).toEqual([EPIC_TYPE.id, TASK_TYPE.id]);
    expect(await api.permissions("NUP")).toEqual({ browse: true, create: true, edit: true, transition: true, comment: true });
  });

  it("creates an epic and a child with labels; edits, labels and moves it", async () => {
    const api = createDcApi(settings, TOKEN);
    const epic = await api.createIssue({ typeId: EPIC_TYPE.id, summary: "Epic", parentKey: null, labels: ["nextup-p1"] });
    const child = await api.createIssue({ typeId: TASK_TYPE.id, summary: "Child", parentKey: epic.key, labels: ["nextup-step-s1", "x"] });
    expect(fake.get(epic.key).labels).toEqual(["nextup-p1"]);
    expect(fake.get(child.key)).toMatchObject({ parentKey: epic.key, labels: ["nextup-step-s1", "x"], typeId: TASK_TYPE.id });

    await api.setSummary(child.key, "Renamed");
    await api.addLabel(child.key, "extra");
    expect(fake.get(child.key)).toMatchObject({ summary: "Renamed", labels: ["nextup-step-s1", "x", "extra"] });

    const moves = await api.transitions(child.key);
    expect(moves.map((t) => t.to.name)).toEqual(["In Progress"]);
    await api.transition(child.key, moves[0].id);
    expect(fake.get(child.key).status.name).toBe("In Progress");
  });

  it("searches across pages and with the changelog; the author is the user's key", async () => {
    const api = createDcApi(settings, TOKEN);
    for (let i = 0; i < 105; i++) await api.createIssue({ typeId: TASK_TYPE.id, summary: "I" + i, parentKey: null, labels: [] });
    const all = await api.search("project = NUP");
    expect(all).toHaveLength(105);
    expect(new Set(all.map((i) => i.key)).size).toBe(105);
    expect(fake.requests.filter((r) => r.path.startsWith("/rest/api/2/search")).length).toBe(2);

    fake.human.rename("NUP-1", "By Alice", "alice");
    const [one] = await api.search('key = "NUP-1"', { changelog: true });
    expect(one.changelog?.histories[0].author).toMatchObject({ accountId: "alice" });
  });

  it("reads one issue (null when gone), and comments as plain text", async () => {
    const api = createDcApi(settings, TOKEN);
    const { key } = await api.createIssue({ typeId: TASK_TYPE.id, summary: "S", parentKey: null, labels: [] });
    expect((await api.issue(key))?.fields.summary).toBe("S");
    expect(await api.issue("NUP-999")).toBeNull();

    await api.addComment(key, "Hello from NextUp");
    fake.human.comment(key, "Hi back", "alice");
    const list = await api.comments(key);
    expect(list.map((c) => c.body)).toEqual(["Hello from NextUp", "Hi back"]);
    expect(list.map((c) => c.author?.accountId)).toEqual(["acc-bot", "alice"]);
  });

  it("a wrong token is a JiraError 401 whose message starts with 401", async () => {
    const api = createDcApi(settings, "wrong");
    const e = await api.myself().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(JiraError);
    expect((e as JiraError).status).toBe(401);
    expect((e as JiraError).message).toMatch(/^401/);
  });

  it("waits out a short 429 once", async () => {
    const slept: number[] = [];
    const api = createDcApi(settings, TOKEN, { sleep: async (ms) => void slept.push(ms) });
    fake.inject429(1, 1);
    expect((await api.myself()).id).toBe("acc-bot");
    expect(slept).toEqual([1000]);
    fake.inject429(2, 1);
    const e = await api.myself().catch((x: unknown) => x);
    expect((e as JiraError).status).toBe(429);
  });

  it("every request used /rest/api/2 and a Bearer header", async () => {
    const seen: (string | null)[] = [];
    const api = createDcApi(settings, TOKEN, {
      fetch: (input, init) => {
        seen.push(new Headers(init?.headers).get("authorization"));
        return fetch(input, init);
      },
    });
    await api.myself();
    await api.search("project = NUP");
    await api.createIssue({ typeId: TASK_TYPE.id, summary: "S", parentKey: null, labels: [] });
    expect(fake.requests.length).toBeGreaterThan(2);
    expect(fake.requests.every((r) => r.path.startsWith("/rest/api/2/"))).toBe(true);
    expect(seen.every((h) => h === "Bearer " + TOKEN)).toBe(true);
  });
});

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };

describe("CNX Jira flavor dc accepted", () => {
  it("jiraApiFor returns a working client for cloud and for dc", async () => {
    expect((await jiraApiFor(settings, TOKEN).myself()).id).toBe("acc-bot");

    const cloud = await startFakeJira({ token: TOKEN });
    try {
      const cs: JiraSettings = { ...settings, flavor: "cloud", siteUrl: cloud.url, email: cloud.email };
      expect((await jiraApiFor(cs, TOKEN).myself()).id).toBe("acc-bot");
      expect(cloud.requests.every((r) => r.path.startsWith("/rest/api/3/"))).toBe(true);
    } finally {
      await cloud.close();
    }
  });

  it("settingsFromForm accepts a Data Center form without an email", () => {
    const r = settingsFromForm({
      flavor: "dc", siteUrl: "https://jira.acme.com/", email: "", token: "pat", projectKey: "nup", epicTypeId: "10000", stepTypeId: "10001",
      autoEpic: true, pullNewIssues: false, pullComments: true, statusFor: emptyStatusFor(),
    });
    expect(r.ok && r.settings).toMatchObject({ flavor: "dc", siteUrl: "https://jira.acme.com", projectKey: "NUP", email: "" });
  });

  it("the connection test passes every check against the Data Center fake", async () => {
    const r = await testJira(settings, TOKEN);
    expect(r.checks.map((c) => [c.id, c.ok])).toEqual([["auth", true], ["project", true], ["types", true], ["permissions", true], ["labels", true]]);
    expect(r.ok).toBe(true);
    expect(r.account).toEqual({ id: "acc-bot", name: "NextUp Bot" });
  });

  it("one round with the Data Center client creates the epic for a synced project", async () => {
    const events: SeqEvent[] = [];
    const keys = new Set<string>();
    const add = (type: CaseEventType, actor: string, target: string | null, payload: Record<string, unknown>): SeqEvent => {
      const e = { id: "m" + events.length, seq: events.length + 1, ts: Date.now(), type, actor, target, payload, day: 0 } as SeqEvent;
      events.push(e);
      return e;
    };
    const store: RoundStore = {
      state: async () => reduce(SEED, { events: [...events], day: 0 }),
      eventsSince: async (after) => events.filter((e) => e.seq > after && e.type.startsWith("project.")),
      append: async (ev) => {
        if (keys.has(ev.idemKey)) return { ok: true, duplicate: true };
        keys.add(ev.idemKey);
        add(ev.type as CaseEventType, JIRA_ACTOR, ev.target, ev.payload);
        return { ok: true, duplicate: false };
      },
    };
    add("case.raised", "Anonymous #4471", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" });
    add("case.decided", "T. Vogel", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", title: "Shorter changeover" });

    const r = await runRound(jiraApiFor(settings, TOKEN), store, {
      settings, enabledAt: new Date(Date.now() - 60_000), pushedSeq: 0, pulledAt: null, account: null, reconcile: true, now: new Date(),
    });
    expect(r.warnings).toEqual([]);
    const epics = [...fake.issues.values()].filter((i) => i.typeId === EPIC_TYPE.id);
    expect(epics.map((e) => [e.summary, e.labels])).toEqual([["Shorter changeover", ["nextup-p_one"]]]);
    expect(r.account.id).toBe("acc-bot");
  });
});
