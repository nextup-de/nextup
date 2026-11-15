// JSY-P1: whole push rounds for milestones and fix versions against the fake Jira over real HTTP (cloud and Data Center), with the
// company's log in memory. Failure paths included: a lost create response, a dropped connection, a refused link append, no
// Administer Projects permission, the cap, and the cursor that never acknowledges unfinished work.
import { afterEach, describe, expect, it } from "vitest";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { JIRA_ACTOR } from "@/features/integrations";
import type { SeqEvent } from "@/features/integrations/jira/plan";
import { JiraError, type JiraAccount, type JiraSettings } from "@/features/integrations/jira/types";
import { dateOfDay, MAX_VERSION_WRITES, versionMarker, withMarker } from "@/features/integrations/jira/versions";
import { kicksJira } from "@/features/projects/pages";
import { jiraApiFor } from "@/server/jira/flavors";
import { runRound, type RoundResult, type RoundStore } from "@/server/jira/round";
import { startFakeJira, type FakeJira } from "../../fake-jira/fake-jira";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };
const LEAD = "L. Brandt";
const d = (n: number) => dateOfDay(n, DEFAULT_CALENDAR)!;

class MemoryLog {
  events: SeqEvent[] = [];
  private keys = new Set<string>();
  private n = 0;
  appended: SeqEvent[] = [];
  /** Refuse the next appends of this type (a crash between the Jira write and the link). */
  refuse: { type: string; left: number } | null = null;
  add(type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}): SeqEvent {
    const e: SeqEvent = { id: "m" + this.n, seq: ++this.n, ts: Date.now(), type, actor, target, payload, day: 0 };
    this.events.push(e);
    return e;
  }
  human(type: CaseEventType, payload: EventPayload = {}, target = "p_one") { return this.add(type, LEAD, target, payload); }
  store: RoundStore = {
    state: async () => reduce(SEED, { events: [...this.events], day: 0 }),
    eventsSince: async (after) => this.events.filter((e) => e.seq > after && e.type.startsWith("project.")),
    append: async (ev) => {
      if (this.refuse && this.refuse.type === ev.type && this.refuse.left > 0) { this.refuse.left--; return { ok: false, error: "disk full" }; }
      if (this.keys.has(ev.idemKey)) return { ok: true, duplicate: true };
      this.keys.add(ev.idemKey);
      this.appended.push(this.add(ev.type as CaseEventType, JIRA_ACTOR, ev.target, ev.payload));
      return { ok: true, duplicate: false };
    },
  };
  project() { return reduce(SEED, { events: [...this.events], day: 0 }).projects.find((p) => p.id === "p_one")!; }
}

let fake: FakeJira | null = null;
afterEach(async () => { await fake?.close(); fake = null; });

async function setup(flavor: "cloud" | "dc" = "cloud", permissions?: Parameters<typeof startFakeJira>[0] extends infer O ? (O extends { permissions?: infer P } ? P : never) : never) {
  const f = await startFakeJira({ flavor, token: "tok", permissions });
  fake = f;
  const settings: JiraSettings = {
    flavor, siteUrl: f.url, email: flavor === "cloud" ? f.email : "", projectKey: "NUP", epicTypeId: "10000", stepTypeId: "10001",
    autoEpic: true, pullNewIssues: false, pullComments: false,
  };
  const log = new MemoryLog();
  const api = jiraApiFor(settings, "tok");
  const enabledAt = new Date(Date.now() - 60_000);
  const cur: { pushedSeq: number; pulledAt: Date | null; account: JiraAccount | null } = { pushedSeq: 0, pulledAt: null, account: null };
  const round = async (): Promise<RoundResult> => {
    const r = await runRound(api, log.store, { settings, enabledAt, pushedSeq: cur.pushedSeq, pulledAt: cur.pulledAt, account: cur.account, reconcile: cur.pulledAt === null, now: new Date(), calendar: DEFAULT_CALENDAR });
    Object.assign(cur, { pushedSeq: r.pushedSeq, pulledAt: r.pulledAt, account: r.account });
    return r;
  };
  log.add("case.raised", "Anonymous #4471", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" });
  log.add("case.decided", "T. Vogel", "c_a", { answer: "yes", projectId: "p_one", lead: LEAD, title: "Shorter changeover" });
  const ms = (id: string, extra: EventPayload = {}) => log.human("project.milestone.added", { milestoneId: id, title: "Pilot " + id, dueDay: 99, ...extra });
  const versionWrites = () => f.writes().filter((r) => /\/version/.test(r.path));
  const ids = (id: string) => log.project().milestones.find((m) => m.id === id)?.external?.key ?? "";
  const version = (id: string) => f.versions.get(ids(id))!;
  return { f, log, round, cur, ms, versionWrites, ids, version, settings, api };
}

describe.each(["cloud", "dc"] as const)("JSY push %s", (flavor) => {
  it("creates a version with marker, dates and released, links it, and a repeat round writes nothing", async () => {
    const c = await setup(flavor);
    c.log.human("project.step.added", { stepId: "s1", text: "Step one" });
    c.ms("m1", { startDay: 90, note: "Why" });
    c.log.human("project.milestone.edited", { milestoneId: "m1", shipped: true });
    const r = await c.round();
    expect(r.warnings).toEqual([]);
    const v = c.version("m1");
    expect(v).toMatchObject({ name: "Pilot m1", description: withMarker("Why", "p_one", "m1"), startDate: d(90), releaseDate: d(99), released: true });
    expect(c.log.project().milestones[0].external).toEqual({ system: "jira", key: v.id, url: `${c.f.url}/projects/NUP/versions/${v.id}`, mode: "owned" });
    expect(c.log.appended.every((e) => e.actor === JIRA_ACTOR)).toBe(true);
    const writes = c.f.writes().length;
    const again = await c.round();
    expect([again.wrote, again.warnings, c.f.writes().length]).toEqual([0, [], writes]);
  });

  it("adopts a version that already carries the marker: nothing is created", async () => {
    const c = await setup(flavor);
    c.ms("m1");
    const id = c.f.human.createVersion("Pilot m1", { description: versionMarker("p_one", "m1"), releaseDate: d(99) });
    const r = await c.round();
    expect(r.warnings).toEqual([]);
    expect(c.ids("m1")).toBe(id);
    expect(c.versionWrites().filter((w) => w.method === "POST")).toEqual([]);
    expect(c.f.versions.size).toBe(1);
  });

  it("a weekend release date in Jira is the same working day: round two writes 0 requests", async () => {
    const c = await setup(flavor);
    c.ms("m1");
    await c.round();
    const saturday = new Date(Date.parse(d(99) + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
    c.f.human.setVersionDates(c.ids("m1"), { releaseDate: saturday });
    const before = c.f.writes().length;
    const r = await c.round();
    expect([r.wrote, r.warnings, c.f.writes().length]).toEqual([0, [], before]);
  });

  it("updates name, description, dates and released from a person's edits, only those fields", async () => {
    const c = await setup(flavor);
    c.ms("m1", { startDay: 90, note: "old" });
    await c.round();
    const id = c.ids("m1");
    c.f.human.renameVersion(id, "Renamed in Jira"); // an untouched field: stays as Jira has it
    c.log.human("project.milestone.edited", { milestoneId: "m1", note: "new note", startDay: 91, dueDay: 100 });
    c.log.human("project.milestone.edited", { milestoneId: "m1", shipped: true });
    const r = await c.round();
    expect(r.warnings).toEqual([]);
    expect(c.version("m1")).toMatchObject({ name: "Renamed in Jira", description: withMarker("new note", "p_one", "m1"), startDate: d(91), releaseDate: d(100), released: true });
    const before = c.f.writes().length;
    await c.round();
    expect(c.f.writes().length).toBe(before);
  });

  it("archives the version of a removed milestone, never deletes it, and a foreign version is left alone", async () => {
    const c = await setup(flavor);
    c.ms("m1");
    c.ms("m2");
    await c.round();
    const stranger = c.f.human.createVersion("Someone else's", { releaseDate: d(99) });
    const keep = c.ids("m1");
    c.log.human("project.milestone.edited", { milestoneId: "m1", removed: true });
    await c.round();
    expect(c.f.versions.get(keep)?.archived).toBe(true);
    expect(c.f.versions.get(c.ids("m2"))?.archived).toBe(false);
    expect(c.f.versions.get(stranger)?.archived).toBe(false);
    const after = c.f.writes().length;
    await c.round();
    expect(c.f.writes().length).toBe(after);
  });

  it("sets a step's fix version, keeps a foreign one, and clears only ours", async () => {
    const c = await setup(flavor);
    c.log.human("project.step.added", { stepId: "s1", text: "Step one" });
    c.ms("m1");
    await c.round();
    const issue = [...c.f.issues.values()].find((i) => i.labels.includes("nextup-step-s1"))!;
    // No release date: the pull never makes a milestone of it, so no milestone maps it and it stays foreign.
    const foreign = c.f.human.createVersion("Foreign", {});
    c.f.human.setFixVersions(issue.key, [foreign]);
    c.log.human("project.step.edited", { stepId: "s1", milestoneId: "m1" });
    expect((await c.round()).warnings.filter((w) => !/no release date/.test(w))).toEqual([]);
    expect([...issue.fixVersions].sort()).toEqual([foreign, c.ids("m1")].sort());
    c.log.human("project.step.edited", { stepId: "s1", milestoneId: null });
    await c.round();
    expect(issue.fixVersions).toEqual([foreign]);
  });
});

describe("JSY push permission and scope", () => {
  it("without Administer Projects no version is written, one warning says so, and a fix version on an existing version still goes", async () => {
    const c = await setup("cloud", { ADMINISTER_PROJECTS: false });
    c.log.human("project.step.added", { stepId: "s1", text: "Step one" });
    c.ms("m1");
    c.ms("m2");
    const vid = c.f.human.createVersion("Linked", { description: versionMarker("p_one", "m2"), releaseDate: d(99) });
    c.log.add("project.milestone.edited", JIRA_ACTOR, "p_one", { milestoneId: "m2", external: { system: "jira", key: vid, url: `${c.f.url}/projects/NUP/versions/${vid}`, mode: "owned" } });
    await c.round(); // the issue for s1 is made
    c.log.human("project.step.edited", { stepId: "s1", milestoneId: "m2" });
    const r = await c.round();
    expect(c.versionWrites()).toEqual([]);
    expect(r.warnings.filter((w) => /does not let the integration account change versions/.test(w))).toHaveLength(1);
    const issue = [...c.f.issues.values()].find((i) => i.labels.includes("nextup-step-s1"))!;
    expect(issue.fixVersions).toEqual([vid]);
  });

  it("a person's edit stays pending without the permission and goes once it is granted: the cursor holds before it", async () => {
    const c = await setup("cloud", { ADMINISTER_PROJECTS: false });
    const vid = c.f.human.createVersion("Pilot m1", { description: versionMarker("p_one", "m1"), releaseDate: d(99) });
    c.ms("m1");
    c.log.add("project.milestone.edited", JIRA_ACTOR, "p_one", { milestoneId: "m1", external: { system: "jira", key: vid, url: `${c.f.url}/projects/NUP/versions/${vid}`, mode: "owned" } });
    await c.round(); // the first round only looks: what people did before it is not for Jira
    const edit = c.log.human("project.milestone.edited", { milestoneId: "m1", title: "Renamed" });
    await c.round();
    expect(c.cur.pushedSeq).toBeLessThan(edit.seq);
    expect(c.f.versions.get(vid)?.name).toBe("Pilot m1");
    c.f.setPermissions({ ADMINISTER_PROJECTS: true });
    await c.round();
    expect(c.f.versions.get(vid)?.name).toBe("Renamed");
    expect(c.cur.pushedSeq).toBeGreaterThanOrEqual(edit.seq);
  });

  it("a project that does not sync makes no request to Jira at all", async () => {
    const c = await setup("cloud");
    c.log.human("project.started");
    c.log.human("project.sync", { system: "jira", on: false });
    c.ms("m1");
    const before = c.f.requests.length;
    const r = await c.round();
    expect(r.wrote).toBe(0);
    expect(c.f.requests.slice(before).filter((q) => /version|permissions/.test(q.path))).toEqual([]);
    expect(c.f.versions.size).toBe(0);
  });
});

describe("JSY push retry and cursor", () => {
  it("caps creates at the limit per round and finishes in the next", async () => {
    const c = await setup("cloud");
    for (let i = 0; i < MAX_VERSION_WRITES + 5; i++) c.ms("m" + i, { title: "T" + i });
    await c.round();
    expect(c.f.versions.size).toBe(MAX_VERSION_WRITES);
    await c.round();
    expect(c.f.versions.size).toBe(MAX_VERSION_WRITES + 5);
    const done = c.f.writes().length;
    await c.round();
    expect(c.f.writes().length).toBe(done);
  });

  it("25 edits take two rounds and the cursor never passes unfinished work", async () => {
    const c = await setup("cloud");
    const ids = Array.from({ length: 25 }, (_, i) => "m" + i);
    for (let i = 0; i < 25; i++) c.ms(ids[i], { title: "T" + i });
    await c.round();
    await c.round();
    expect(c.f.versions.size).toBe(25);
    const edits = ids.map((id) => c.log.human("project.milestone.edited", { milestoneId: id, title: id + " new" }));
    await c.round();
    const renamed = () => ids.filter((id) => c.f.versions.get(c.ids(id))?.name === id + " new").length;
    expect(renamed()).toBe(MAX_VERSION_WRITES);
    expect(c.cur.pushedSeq).toBeLessThan(edits[MAX_VERSION_WRITES].seq);
    await c.round();
    expect(renamed()).toBe(25);
    expect(c.cur.pushedSeq).toBeGreaterThanOrEqual(edits[24].seq);
  });

  it("a failure after the create and before the link append is retried by marker adoption: one version", async () => {
    const c = await setup("cloud");
    c.ms("m1");
    c.log.refuse = { type: "project.milestone.edited", left: 1 };
    const first = await c.round();
    expect(first.warnings.join(" ")).toMatch(/create m1/);
    expect(c.f.versions.size).toBe(1);
    expect(c.log.project().milestones[0].external ?? null).toBeNull();
    await c.round();
    expect(c.f.versions.size).toBe(1);
    expect(c.log.project().milestones[0].external?.key).toBe([...c.f.versions.keys()][0]);
  });

  it("a lost create response and a dropped connection end the round, and the next one adopts, never duplicates", async () => {
    const c = await setup("cloud");
    c.ms("m1");
    c.f.loseResponse("POST", /\/version$/);
    await expect(c.round()).rejects.toThrow();
    expect(c.f.versions.size).toBe(1);
    await c.round();
    expect(c.f.versions.size).toBe(1);
    expect(c.ids("m1")).not.toBe("");
    c.ms("m2");
    c.f.dropConnection(1);
    await expect(c.round()).rejects.toThrow();
    await c.round();
    expect(c.f.versions.size).toBe(2);
  });

  it("a step assigned before its issue and version exist stays pending and is set in a later round", async () => {
    const c = await setup("cloud", { ADMINISTER_PROJECTS: false });
    c.log.human("project.step.added", { stepId: "s1", text: "Step one" });
    c.ms("m1");
    await c.round(); // the first round only looks
    const assign = c.log.human("project.step.edited", { stepId: "s1", milestoneId: "m1" });
    const first = await c.round();
    expect(first.warnings.join(" ")).toMatch(/Administer Projects/);
    expect(c.cur.pushedSeq).toBeLessThan(assign.seq);
    const issue = [...c.f.issues.values()].find((i) => i.labels.includes("nextup-step-s1"))!;
    expect(issue.fixVersions).toEqual([]);
    c.f.setPermissions({ ADMINISTER_PROJECTS: true });
    const second = await c.round();
    expect(second.warnings).toEqual([]);
    expect(issue.fixVersions).toEqual([c.ids("m1")]);
    expect(c.cur.pushedSeq).toBeGreaterThanOrEqual(assign.seq);
  });

  it("a permanent 4xx on a version update or a fix-version write is warned and dropped: the cursor moves on", async () => {
    const c = await setup("cloud");
    c.log.human("project.step.added", { stepId: "s1", text: "Step one" });
    c.ms("m1");
    await c.round();
    // 400 on the version update
    const update = c.api.updateVersion;
    c.api.updateVersion = async () => { throw new JiraError("Jira 400: the field is not valid", 400); };
    const edit = c.log.human("project.milestone.edited", { milestoneId: "m1", title: "Renamed" });
    const r1 = await c.round();
    expect(r1.warnings.join(" ")).toMatch(/update m1: Jira 400/);
    expect(c.cur.pushedSeq).toBeGreaterThanOrEqual(edit.seq);
    c.api.updateVersion = update;
    const writes = c.versionWrites().length;
    await c.round(); // the stale edit is not pushed again
    expect(c.versionWrites().length).toBe(writes);
    // 403 on the fix-version write
    c.f.setPermissions({ EDIT_ISSUES: false });
    const assign = c.log.human("project.step.edited", { stepId: "s1", milestoneId: "m1" });
    const r2 = await c.round();
    expect(r2.warnings.join(" ")).toMatch(/fixVersion s1/);
    expect(c.cur.pushedSeq).toBeGreaterThanOrEqual(assign.seq);
  });

  it("a 429 on a version update ends the round and the cursor stays before the edit", async () => {
    const c = await setup("cloud");
    c.ms("m1");
    await c.round();
    const update = c.api.updateVersion;
    c.api.updateVersion = async () => { throw new JiraError("Jira 429: too many requests", 429); };
    const edit = c.log.human("project.milestone.edited", { milestoneId: "m1", title: "Renamed" });
    await expect(c.round()).rejects.toThrow(/429/);
    expect(c.cur.pushedSeq).toBeLessThan(edit.seq);
    c.api.updateVersion = update;
    await c.round();
    expect(c.version("m1").name).toBe("Renamed");
  });

  it("creates and edits share one write budget per round", async () => {
    const c = await setup("cloud");
    for (let i = 0; i < 10; i++) c.ms("a" + i, { title: "A" + i });
    await c.round();
    expect(c.f.versions.size).toBe(10);
    for (let i = 0; i < 10; i++) c.log.human("project.milestone.edited", { milestoneId: "a" + i, title: "A" + i + " new" });
    for (let i = 0; i < 15; i++) c.ms("b" + i, { title: "B" + i });
    const before = c.versionWrites().length;
    await c.round();
    expect(c.versionWrites().length - before).toBe(MAX_VERSION_WRITES);
    expect(c.f.versions.size).toBe(25);
    await c.round();
    const renamed = Array.from({ length: 10 }, (_, i) => c.version("a" + i).name === "A" + i + " new").filter(Boolean).length;
    expect(renamed).toBe(10);
  });

  it("a version someone else owns by marker is never updated", async () => {
    const c = await setup("cloud");
    c.ms("m1");
    await c.round();
    const id = c.ids("m1");
    c.f.versions.get(id)!.description = versionMarker("p_two", "mX");
    c.log.human("project.milestone.edited", { milestoneId: "m1", title: "Renamed" });
    const r = await c.round();
    expect(c.f.versions.get(id)?.name).toBe("Pilot m1");
    expect(r.warnings.join(" ")).toMatch(/no longer owns/);
  });
});

describe("JSY kick", () => {
  it("milestone events wake the sync like a step move; page, tool and form events still do not", () => {
    expect(kicksJira("project.milestone.added")).toBe(true);
    expect(kicksJira("project.milestone.edited")).toBe(true);
    expect(kicksJira("project.step.moved")).toBe(true);
    for (const t of ["project.page.added", "project.tool.edited", "project.form.saved", "project.step.checklist", "project.step.commented"]) expect(kicksJira(t)).toBe(false);
  });

  it("a company whose projects all stop syncing, or have no milestone, gets no version call", async () => {
    const c = await setup("cloud");
    c.log.human("project.step.added", { stepId: "s1", text: "Step one" });
    await c.round();
    expect(c.f.requests.filter((q) => /version|permissions/.test(q.path))).toEqual([]);
  });
});
