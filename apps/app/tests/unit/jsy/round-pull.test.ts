// JSY-R1: whole pull rounds for versions against the fake Jira over real HTTP (cloud and Data Center): what people do in Jira comes
// back as milestone and step events, what a person did in NextUp and is not in Jira yet is never overwritten, and quiet rounds are silent.
import { afterEach, describe, expect, it } from "vitest";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { JIRA_ACTOR } from "@/features/integrations";
import type { SeqEvent } from "@/features/integrations/jira/plan";
import { JiraError, type JiraAccount, type JiraSettings } from "@/features/integrations/jira/types";
import { dateOfDay, versionMarker } from "@/features/integrations/jira/versions";
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


const quiet = async (c: Awaited<ReturnType<typeof setup>>, rounds = 2) => {
  const events = c.log.events.length;
  const writes = c.f.writes().length;
  for (let i = 0; i < rounds; i++) {
    const r = await c.round();
    expect([r.wrote, r.warnings]).toEqual([0, []]);
  }
  expect(c.log.events.length).toBe(events);
  expect(c.f.writes().length).toBe(writes);
};
const issueOf = (c: Awaited<ReturnType<typeof setup>>, stepId: string) => [...c.f.issues.values()].find((i) => i.labels.includes("nextup-step-" + stepId))!;
const milestone = (c: Awaited<ReturnType<typeof setup>>, id: string) => c.log.project().milestones.find((m) => m.id === id)!;

describe.each(["cloud", "dc"] as const)("JSY pull %s", (flavor) => {
  /** A linked, owned milestone m1 (pushed by round one) and a step s1 with its issue. */
  async function linked() {
    const c = await setup(flavor);
    c.log.human("project.step.added", { stepId: "s1", text: "Step one" });
    c.ms("m1", { startDay: 90 });
    await c.round();
    await quiet(c, 1);
    return c;
  }

  it("a version released, renamed and re-dated only in Jira comes back as shipped, title and days, with no issue changed", async () => {
    const c = await linked();
    const id = c.ids("m1");
    c.f.human.releaseVersion(id, true);
    c.f.human.renameVersion(id, "Pilot, renamed");
    c.f.human.setVersionDates(id, { startDate: d(91), releaseDate: d(100) });
    const r = await c.round();
    expect(r.warnings).toEqual([]);
    expect(milestone(c, "m1")).toMatchObject({ title: "Pilot, renamed", startDay: 91, dueDay: 100, shipped: true });
    await quiet(c);
  });

  it("a weekend release date maps to the working day before: nothing changes, and the next round does nothing", async () => {
    const c = await linked();
    const saturday = new Date(Date.parse(d(99) + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
    c.f.human.setVersionDates(c.ids("m1"), { releaseDate: saturday });
    const events = c.log.events.length;
    await c.round();
    expect(c.log.events.length).toBe(events);
    expect(milestone(c, "m1").dueDay).toBe(99);
    await quiet(c);
  });

  it("a version without a release date keeps the due day and warns; an unusable or inverted date is skipped with a warning", async () => {
    const c = await linked();
    const id = c.ids("m1");
    c.f.human.setVersionDates(id, { releaseDate: null });
    const gone = await c.round();
    expect(gone.warnings.join(" ")).toMatch(/no release date/);
    expect(milestone(c, "m1").dueDay).toBe(99);
    c.f.human.setVersionDates(id, { startDate: d(120), releaseDate: d(99) });
    const inverted = await c.round();
    expect(inverted.warnings.join(" ")).toMatch(/ends before it starts/);
    expect(milestone(c, "m1")).toMatchObject({ startDay: 90, dueDay: 99 });
    c.f.human.setVersionDates(id, { startDate: "2024-06-01", releaseDate: d(99) });
    expect((await c.round()).warnings.join(" ")).toMatch(/cannot place/);
    expect(milestone(c, "m1").startDay).toBe(90);
  });

  it("a fix version set on a step's issue becomes its milestone; removing it in Jira does not clear the step", async () => {
    const c = await linked();
    c.f.human.setFixVersions(issueOf(c, "s1").key, [c.ids("m1")]);
    await c.round();
    expect(c.log.project().steps[0].milestoneId).toBe("m1");
    c.f.human.setFixVersions(issueOf(c, "s1").key, []);
    await c.round();
    expect(c.log.project().steps[0].milestoneId).toBe("m1");
    await quiet(c);
  });

  it("a new version named by a fix version becomes one read-only milestone, once; a second round adds none", async () => {
    const c = await linked();
    const vid = c.f.human.createVersion("From Jira", { description: "A note", startDate: d(95), releaseDate: d(110), released: true });
    c.f.human.setFixVersions(issueOf(c, "s1").key, [vid]);
    const r = await c.round();
    expect(r.warnings).toEqual([]);
    const m = c.log.project().milestones.find((x) => x.external?.key === vid)!;
    expect(m).toMatchObject({ title: "From Jira", note: "A note", startDay: 95, dueDay: 110, shipped: true, external: { system: "jira", key: vid, mode: "imported" } });
    expect(m.id).toMatch(/^jv_p_one_/);
    await c.round();
    expect(c.log.project().steps[0].milestoneId).toBe(m.id);
    expect(c.log.project().milestones).toHaveLength(2);
    await quiet(c);
  });

  it("a version without a release date and an archived one produce no milestone; one warning for the missing date", async () => {
    const c = await linked();
    const a = c.f.human.createVersion("No date", {});
    const b = c.f.human.createVersion("Archived", { releaseDate: d(105) });
    c.f.human.archiveVersion(b);
    c.f.human.setFixVersions(issueOf(c, "s1").key, [a, b]);
    const r = await c.round();
    expect(r.warnings.filter((w) => /no release date/.test(w))).toHaveLength(1);
    expect(c.log.project().milestones).toHaveLength(1);
  });

  it("a version deleted in Jira leaves its milestone alone and warns once", async () => {
    const c = await linked();
    c.f.human.deleteVersion(c.ids("m1"));
    const events = c.log.events.length;
    const r = await c.round();
    expect(r.warnings.filter((w) => /gone from Jira/.test(w))).toHaveLength(1);
    expect(c.log.events.length).toBe(events);
    expect(c.f.versions.size).toBe(0);
  });

  it("a release toggled back and forth comes back every time: the idem key does not swallow a repeat", async () => {
    const c = await linked();
    const id = c.ids("m1");
    for (const released of [true, false, true]) {
      c.f.human.releaseVersion(id, released);
      await c.round();
      expect(milestone(c, "m1").shipped).toBe(released);
    }
  });

  it("a removed imported milestone is never imported again while the issue still names its version", async () => {
    const c = await linked();
    const vid = c.f.human.createVersion("From Jira", { releaseDate: d(110) });
    c.f.human.setFixVersions(issueOf(c, "s1").key, [vid]);
    await c.round();
    const imported = c.log.project().milestones.find((x) => x.external?.key === vid)!;
    c.log.human("project.milestone.edited", { milestoneId: imported.id, removed: true });
    await c.round();
    await c.round();
    expect(c.log.project().milestones.map((m) => m.id)).toEqual(["m1"]);
    expect(c.log.project().milestoneTombstones?.some((t) => t.id === imported.id)).toBe(true);
    expect(c.f.versions.get(vid)?.archived).toBe(false); // an imported version is never archived by us
  });

  it("long names and descriptions come in cut to 80 and 1000 and do not echo", async () => {
    const c = await linked();
    const vid = c.f.human.createVersion("N".repeat(255), { description: "D".repeat(3000), releaseDate: d(110) });
    c.f.human.setFixVersions(issueOf(c, "s1").key, [vid]);
    await c.round();
    const m = c.log.project().milestones.find((x) => x.external?.key === vid)!;
    expect([m.title.length, m.note.length]).toEqual([80, 1000]);
    await c.round(); // the step follows its fix version
    await quiet(c);
  });

  it("a version marked for another project is not imported and its fix version on the issue stays", async () => {
    const c = await linked();
    const vid = c.f.human.createVersion("Theirs", { description: versionMarker("p_other", "mx"), releaseDate: d(105) });
    c.f.human.setFixVersions(issueOf(c, "s1").key, [vid]);
    const r = await c.round();
    expect(r.warnings.join(" ")).toMatch(/another NextUp project/);
    expect(c.log.project().milestones).toHaveLength(1);
    expect(issueOf(c, "s1").fixVersions).toEqual([vid]);
  });
});

describe("JSY pull projects", () => {
  it("two projects naming the same unmarked version each get their own milestone", async () => {
    const c = await setup("cloud");
    c.log.human("project.step.added", { stepId: "s1", text: "Step one" });
    c.log.add("case.raised", "Anonymous #4471", "c_b", { kind: "idea", title: "Other", body: "text", routeId: "r1", assignee: "T. Vogel" });
    c.log.add("case.decided", "T. Vogel", "c_b", { answer: "yes", projectId: "p_two", lead: LEAD, title: "Second" });
    c.log.human("project.step.added", { stepId: "t1", text: "Step two" }, "p_two");
    await c.round();
    const vid = c.f.human.createVersion("Shared", { releaseDate: d(110) });
    c.f.human.setFixVersions(issueOf(c, "s1").key, [vid]);
    c.f.human.setFixVersions(issueOf(c, "t1").key, [vid]);
    await c.round();
    const state = reduce(SEED, { events: [...c.log.events], day: 0 });
    const ids = state.projects.flatMap((p) => p.milestones.filter((m) => m.external?.key === vid).map((m) => m.id));
    expect(ids.sort()).toEqual(["jv_p_one_" + vid, "jv_p_two_" + vid]);
  });
});

describe("JSY both ways", () => {
  it("the same field changed on both sides in one round ends as NextUp's value in both, then two quiet rounds", async () => {
    const c = await setup("cloud");
    c.ms("m1");
    await c.round();
    await c.round();
    c.log.human("project.milestone.edited", { milestoneId: "m1", title: "Mine" });
    c.f.human.renameVersion(c.ids("m1"), "Theirs");
    c.f.human.releaseVersion(c.ids("m1"), true); // an untouched field: this one pulls
    const r = await c.round();
    expect(r.warnings).toEqual([]);
    expect(c.f.versions.get(c.ids("m1"))?.name).toBe("Mine");
    expect(milestone(c, "m1")).toMatchObject({ title: "Mine", shipped: true });
    await quiet(c);
  });

  it("when the push half cannot read the versions, the pull leaves milestones alone that round and issues still pull", async () => {
    const c = await setup("cloud");
    c.log.human("project.step.added", { stepId: "s1", text: "Step one" });
    c.ms("m1");
    await c.round();
    await c.round();
    const read = c.api.versions;
    let calls = 0;
    c.api.versions = async (key) => (++calls === 1 ? Promise.reject(new JiraError("Jira 403: no access to versions", 403)) : read(key));
    const edit = c.log.human("project.milestone.edited", { milestoneId: "m1", title: "Mine" });
    c.f.human.renameVersion(c.ids("m1"), "Theirs");
    c.f.human.move(issueOf(c, "s1").key, "Done");
    const r = await c.round();
    expect(r.warnings.join(" ")).toMatch(/versions: Jira 403/);
    expect(milestone(c, "m1").title).toBe("Mine");
    expect(c.log.project().steps[0].column).toBe("done");
    expect(c.cur.pushedSeq).toBeLessThan(edit.seq);
    c.api.versions = read;
    await c.round();
    expect(c.f.versions.get(c.ids("m1"))?.name).toBe("Mine");
    expect(milestone(c, "m1").title).toBe("Mine");
  });

  it("a person's edit that is not in Jira yet is never pulled over", async () => {
    const c = await setup("cloud", { ADMINISTER_PROJECTS: false });
    const vid = c.f.human.createVersion("Pilot m1", { description: versionMarker("p_one", "m1"), releaseDate: d(99) });
    c.ms("m1");
    c.log.add("project.milestone.edited", JIRA_ACTOR, "p_one", { milestoneId: "m1", external: { system: "jira", key: vid, url: `${c.f.url}/projects/NUP/versions/${vid}`, mode: "owned" } });
    await c.round();
    c.log.human("project.milestone.edited", { milestoneId: "m1", title: "Mine" });
    c.f.human.renameVersion(vid, "Theirs");
    await c.round();
    expect(milestone(c, "m1").title).toBe("Mine");
    c.f.setPermissions({ ADMINISTER_PROJECTS: true });
    await c.round();
    expect(c.f.versions.get(vid)?.name).toBe("Mine");
    await quiet(c);
  });
});
