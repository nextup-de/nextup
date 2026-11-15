import { describe, expect, it } from "vitest";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { isWorkday } from "@/features/clock/calendar";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { jiraMilestoneId } from "@/features/integrations";
import type { SeqEvent } from "@/features/integrations/jira/plan";
import type { JiraIssue, JiraSettings, JiraVersion } from "@/features/integrations/jira/types";
import {
  dateOfDay, dayOfDate, markerOf, MAX_VERSION_WRITES, planVersionPull, planVersionPush, sameDay, stripMarker, versionDiffers, versionMarker, withMarker,
} from "@/features/integrations/jira/versions";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };
const SETTINGS: JiraSettings = {
  flavor: "cloud", siteUrl: "https://acme.atlassian.net", email: "bot@acme.example", projectKey: "NUP",
  epicTypeId: "10000", stepTypeId: "10001", autoEpic: true, pullNewIssues: false, pullComments: true,
};
const ENABLED = new Date(1_000_000);
const AFTER = 2_000_000;
const LEAD = "L. Brandt";
const BOT = "system:jira";
const CAL = DEFAULT_CALENDAR;
const CLOCK = { cal: CAL } as const;

let seq = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, ts = 0): SeqEvent =>
  ({ id: "e" + seq, seq: ++seq, ts, type, actor, target, payload, day: 0 });
const P = (type: CaseEventType, payload: EventPayload = {}, actor = LEAD, target = "p_one") => ev(type, actor, target, payload);
const open = (projectId = "p_one", caseId = "c_a") => [
  ev("case.raised", "Anonymous #4471", caseId, { kind: "idea", title: "Idea " + caseId, body: "text", routeId: "r1", assignee: "T. Vogel" }),
  ev("case.decided", "T. Vogel", caseId, { answer: "yes", projectId, lead: LEAD, title: "Shorter changeover" }, AFTER),
];
const stateOf = (events: SeqEvent[]) => reduce(SEED, { events, day: 0 });
const MS = (id: string, extra: EventPayload = {}, actor = LEAD, target = "p_one") => ev("project.milestone.added", actor, target, { milestoneId: id, title: "Pilot", dueDay: 100, ...extra }, 0);
const url = (id: string) => `https://acme.atlassian.net/projects/NUP/versions/${id}`;
const OWN = (id: string) => ({ system: "jira", key: id, url: url(id), mode: "owned" as const });
const IMP = (id: string) => ({ ...OWN(id), mode: "imported" as const });
const d = (n: number) => dateOfDay(n, CAL)!;
const version = (id: string, patch: Partial<JiraVersion> = {}): JiraVersion => ({ id, name: "Pilot", released: false, archived: false, releaseDate: d(100), ...patch });
const marked = (id: string, projectId = "p_one", milestoneId = "m1", patch: Partial<JiraVersion> = {}) =>
  version(id, { description: versionMarker(projectId, milestoneId), ...patch });
const push = (log: SeqEvent[], versions: JiraVersion[], since: SeqEvent[] = log, o: { administer?: boolean } = {}) =>
  planVersionPush(stateOf(log), versions, since, SETTINGS, { enabledAt: ENABLED, administer: o.administer ?? true, ...CLOCK });
const pull = (log: SeqEvent[], versions: JiraVersion[], issues: JiraIssue[] = [], pending?: { milestones?: string[]; steps?: string[] }) =>
  planVersionPull(stateOf(log), versions, issues, SETTINGS, { enabledAt: ENABLED, ...CLOCK, pending });
const issue = (key: string, fixVersions?: { id: string; name: string }[]): JiraIssue =>
  ({ id: key, key, fields: { summary: key, status: { id: "1", name: "To Do", statusCategory: { key: "new" } }, issuetype: { id: "10001", name: "Task" }, labels: [], ...(fixVersions ? { fixVersions } : {}) } }) as unknown as JiraIssue;
const link = (id: string, key: string) => P("project.linked", { system: "jira", key, url: "https://acme.atlassian.net/browse/" + key, stepId: id }, BOT);
const add = (id: string) => P("project.step.added", { stepId: id, text: "Step " + id });
const base = () => [...open(), add("s1"), P("project.linked", { system: "jira", key: "NUP-1", url: "https://acme.atlassian.net/browse/NUP-1" }, BOT), link("s1", "NUP-2")];
const project = (log: SeqEvent[], id = "p_one") => stateOf(log).projects.find((p) => p.id === id)!;

describe("JSY versions equal", () => {
  it("the marker round-trips: last line, stripped, never doubled, just the marker for an empty note", () => {
    expect(versionMarker("p_one", "m1")).toBe("[nextup:p_one:m1]");
    expect(withMarker("Note", "p_one", "m1")).toBe("Note\n\n[nextup:p_one:m1]");
    expect(withMarker("", "p_one", "m1")).toBe("[nextup:p_one:m1]");
    expect(withMarker(withMarker("Note", "p_one", "m1"), "p_one", "m1")).toBe("Note\n\n[nextup:p_one:m1]");
    expect(markerOf("Note\n\n[nextup:p_one:m1]\n")).toEqual({ projectId: "p_one", milestoneId: "m1" });
    expect(markerOf("[nextup:p_one:m1]\nmore text")).toBeNull();
    expect(markerOf(undefined)).toBeNull();
    expect(stripMarker("Note\r\n\r\n[nextup:p_one:m1]")).toBe("Note");
    expect(stripMarker("No marker here ")).toBe("No marker here");
  });

  it("working-day space: a weekend date has the number before it, a date before the calendar has none", () => {
    expect(dayOfDate(d(100), CAL)).toBe(100);
    const weekend = new Date(Date.parse(d(99) + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10); // the day after a Friday
    expect(isWorkday(weekend, CAL)).toBe(false);
    expect(sameDay(weekend, 99, CAL)).toBe(true);
    expect(dayOfDate("2024-06-01", CAL)).toBeNull();
    expect(dayOfDate("nope", CAL)).toBeNull();
    expect(dateOfDay(0, CAL)).toBeNull();
  });

  it("calendar mode counts every day from its epoch", () => {
    const clock = { mode: "calendar", epoch: "2026-01-01" } as const;
    expect(dateOfDay(0, clock)).toBe("2026-01-01");
    expect(dateOfDay(31, clock)).toBe("2026-02-01");
    expect(dayOfDate("2026-02-01", clock)).toBe(31);
    expect(dayOfDate("2025-12-31", clock)).toBeNull();
    expect(dateOfDay(-1, clock)).toBeNull();
  });

  it("a milestone and its version are equal with the marker stripped, a weekend release date, and a long title cut to 80", () => {
    const m = project([...open(), MS("m1", { note: "Why", startDay: 90, dueDay: 99 })]).milestones[0];
    const v = marked("7", "p_one", "m1", { description: withMarker("Why", "p_one", "m1"), startDate: d(90), releaseDate: d(99) });
    expect(versionDiffers(m, v, CAL)).toBe(false);
    const weekend = new Date(Date.parse(d(99) + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
    expect(versionDiffers(m, { ...v, releaseDate: weekend }, CAL)).toBe(false);
    expect(versionDiffers(m, { ...v, name: "Other" }, CAL)).toBe(true);
    expect(versionDiffers(m, { ...v, released: true }, CAL)).toBe(true);
    expect(versionDiffers(m, { ...v, startDate: undefined }, CAL)).toBe(true);
    expect(versionDiffers(m, { ...v, releaseDate: d(98) }, CAL)).toBe(true);
    const long = project([...open(), MS("m2", { title: "T".repeat(80), note: "n".repeat(1000) })]).milestones[0];
    expect(versionDiffers(long, version("8", { name: "T".repeat(80), description: withMarker("n".repeat(1000), "p_one", "m2") }), CAL)).toBe(false);
    expect(versionDiffers(long, version("8", { name: "T".repeat(200), description: "n".repeat(1500) }), CAL)).toBe(false);
  });

  it("the sync's own events, a repeat round and no change ask for no job and no event", () => {
    const log = [...base(), MS("m1", { external: OWN("7") }, BOT)];
    const v = [marked("7")];
    const p = push(log, v);
    expect(p.jobs).toEqual([]);
    expect(pull(log, v).events).toEqual([]);
    // A person's edit that Jira already shows is not pushed either.
    const same = [...log, P("project.milestone.edited", { milestoneId: "m1", title: "Pilot" })];
    expect(push(same, v, same.slice(-1)).jobs).toEqual([]);
  });

  it("the encoded name is compared symmetrically: a suffixed version name equals the plain title", () => {
    const log = [...open(), MS("m1"), MS("m2", { title: "Pilot" })];
    const plan = push(log, [version("1", { name: "Pilot" })]);
    const creates = plan.jobs.filter((j) => j.kind === "create");
    expect(creates.map((j) => (j.kind === "create" ? j.name : "")).every((n) => n !== "Pilot")).toBe(true);
    const m = project(log).milestones[0];
    const named = (creates[0] as { name: string }).name;
    expect(versionDiffers(m, marked("9", "p_one", "m1", { name: named }), CAL)).toBe(false);
  });
});

describe("JSY versions plan", () => {
  it("a linked project (decided before Jira was on) creates no version for its milestones; an owned link still updates and archives", () => {
    const linkedOpen = [
      ev("case.raised", "Anonymous #4471", "c_a", { kind: "idea", title: "Idea c_a", body: "text", routeId: "r1", assignee: "T. Vogel" }),
      ev("case.decided", "T. Vogel", "c_a", { answer: "yes", projectId: "p_one", lead: LEAD, title: "Shorter changeover" }, ENABLED.getTime() - 1),
    ];
    const log = [...linkedOpen, add("s1"), link("s1", "NUP-2"), MS("m1"), MS("m2"), MS("m3", { external: OWN("7") }, BOT)];
    const assign = P("project.step.edited", { stepId: "s1", milestoneId: "m1" });
    const rename = P("project.milestone.edited", { milestoneId: "m3", title: "Renamed" });
    const all = [...log, assign, rename];
    const plan = push(all, [marked("7", "p_one", "m3")]);
    expect(plan.jobs.filter((j) => j.kind === "create" || j.kind === "adopt")).toEqual([]);
    expect(plan.jobs).toEqual([{ kind: "update", seq: rename.seq, milestoneId: "m3", projectId: "p_one", versionId: "7", patch: { name: "Renamed" } }]);
    // The step on an unlinked milestone waits for nothing: no fix version job and no held cursor.
    expect(plan.deferredSeq).toBeNull();
    // Even a version marked for one of its milestones is not adopted: a linked project does not take over versions.
    expect(push(log, [marked("8", "p_one", "m1")]).jobs).toEqual([]);
    const rm = P("project.milestone.edited", { milestoneId: "m3", removed: true });
    expect(push([...log, rm], [marked("7", "p_one", "m3")], [rm]).jobs).toEqual([{ kind: "archive", seq: rm.seq, projectId: "p_one", milestoneId: "m3", versionId: "7" }]);
  });

  it("creates a version for an unlinked milestone, with marker, dates and released; and never twice (adopt by marker)", () => {
    const log = [...open(), MS("m1", { startDay: 90, note: "Why", shipped: undefined }), P("project.milestone.edited", { milestoneId: "m1", shipped: true })];
    const jobs = push(log, []).jobs;
    expect(jobs).toEqual([{ kind: "create", milestoneId: "m1", projectId: "p_one", name: "Pilot", description: "Why\n\n[nextup:p_one:m1]", startDate: d(90), releaseDate: d(100), released: true }]);
    const lost = marked("7", "p_one", "m1");
    expect(push(log, [lost]).jobs).toEqual([{ kind: "adopt", milestoneId: "m1", projectId: "p_one", version: lost }]);
  });

  it("two projects with the same Jira version never share it: a marker for another project is not adopted and not imported", () => {
    const log = [...open(), ...open("p_two", "c_b"), MS("m1"), MS("m1", {}, LEAD, "p_two")];
    const v = marked("7", "p_one", "m1");
    const jobs = push(log, [v]).jobs;
    expect(jobs.filter((j) => j.kind === "adopt").map((j) => (j.kind === "adopt" ? j.projectId : ""))).toEqual(["p_one"]);
    expect(jobs.filter((j) => j.kind === "create").map((j) => (j.kind === "create" ? j.projectId : ""))).toEqual(["p_two"]);
    const withIssue = [...log, add("s9"), link("s9", "NUP-9")];
    const p = pull(withIssue.filter((e) => e.target !== "p_two" || true), [v], [issue("NUP-9", [{ id: "7", name: "Pilot" }])]);
    expect(p.events.some((e) => e.type === "project.milestone.added")).toBe(false);
  });

  it("an unmarked or foreign-owned version never receives an update or an archive", () => {
    const edit = P("project.milestone.edited", { milestoneId: "m1", title: "Renamed" });
    const log = [...base(), MS("m1", { external: OWN("7") }, BOT), edit];
    const unmarked = push(log, [version("7")], [edit]);
    expect(unmarked.jobs).toEqual([]);
    expect(unmarked.warnings.join(" ")).toMatch(/no longer owns/);
    const foreign = push(log, [marked("7", "p_two", "m9")], [edit]);
    expect(foreign.jobs).toEqual([]);
    const rm = P("project.milestone.edited", { milestoneId: "m1", removed: true });
    const gone = [...log, rm];
    expect(push(gone, [version("7")], [rm]).jobs).toEqual([]);
    expect(push(gone, [marked("7")], [rm]).jobs).toEqual([{ kind: "archive", seq: rm.seq, projectId: "p_one", milestoneId: "m1", versionId: "7" }]);
  });

  it("an imported milestone is read-only: person edits make no update", () => {
    const edit = P("project.milestone.edited", { milestoneId: "m1", title: "Mine" });
    const log = [...base(), MS("m1", { external: IMP("7") }, BOT), edit];
    expect(push(log, [version("7")], [edit]).jobs).toEqual([]);
  });

  it("only a person's pending fields go: untouched fields pull, a later system event suppresses an earlier person edit", () => {
    const linked = [...base(), MS("m1", { external: OWN("7"), note: "old" }, BOT)];
    const rename = P("project.milestone.edited", { milestoneId: "m1", title: "Renamed" });
    const log = [...linked, rename];
    const v = marked("7", "p_one", "m1", { description: withMarker("changed in Jira", "p_one", "m1") });
    const plan = push(log, [v], [rename]);
    expect(plan.jobs).toEqual([{ kind: "update", seq: rename.seq, milestoneId: "m1", projectId: "p_one", versionId: "7", patch: { name: "Renamed" } }]);
    expect(plan.pending.milestones).toEqual(["m1"]);
    const pulled = pull(log, [v], [], plan.pending);
    expect(pulled.events).toEqual([]);
    const afterPush = pull(log, [{ ...v, name: "Renamed" }], []);
    expect(afterPush.events.map((e) => e.payload)).toEqual([{ milestoneId: "m1", note: "changed in Jira" }]);
    const sys = P("project.milestone.edited", { milestoneId: "m1", title: "Renamed by Jira" }, BOT);
    expect(push([...log, sys], [v], [rename, sys]).jobs).toEqual([]);
  });

  it("a release or rename only in Jira pulls, with no issue involved", () => {
    const log = [...base(), MS("m1", { external: OWN("7") }, BOT)];
    const out = pull(log, [marked("7", "p_one", "m1", { name: "Pilot 2", released: true })]);
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({ type: "project.milestone.edited", target: "p_one", payload: { milestoneId: "m1", title: "Pilot 2", shipped: true } });
    const again = pull(log, [marked("7", "p_one", "m1", { name: "Pilot 2", released: true })]);
    expect(again.events[0].idemKey).toBe(out.events[0].idemKey);
  });

  it("dates move in working-day space only when the day differs; a version without release date keeps the local due day with a warning", () => {
    const log = [...base(), MS("m1", { external: OWN("7") }, BOT)];
    expect(pull(log, [marked("7", "p_one", "m1", { releaseDate: d(105) })]).events[0].payload).toEqual({ milestoneId: "m1", dueDay: 105 });
    const none = pull(log, [marked("7", "p_one", "m1", { releaseDate: undefined })]);
    expect(none.events).toEqual([]);
    expect(none.warnings.join(" ")).toMatch(/no release date/);
    const inverted = pull(log, [marked("7", "p_one", "m1", { startDate: d(120) })]);
    expect(inverted.events).toEqual([]);
    expect(inverted.warnings.join(" ")).toMatch(/ends before it starts/);
  });

  it("calendar mode converts with its epoch, not with the working-day calendar", () => {
    const clock = { mode: "calendar", epoch: "2026-01-01" } as const;
    const log = [...open(), MS("m1", { dueDay: 31 })];
    const job = planVersionPush(stateOf(log), [], log, SETTINGS, { enabledAt: ENABLED, administer: true, clock }).jobs[0];
    expect(job).toMatchObject({ kind: "create", releaseDate: "2026-02-01" });
    const linked = [...base(), MS("m1", { external: OWN("7"), dueDay: 31 }, BOT)];
    const same = planVersionPull(stateOf(linked), [marked("7", "p_one", "m1", { releaseDate: "2026-02-01" })], [], SETTINGS, { enabledAt: ENABLED, clock });
    expect(same.events).toEqual([]);
  });

  it("long Jira names and descriptions import cut to 80 and 1000, and do not echo back", () => {
    const long = version("7", { name: "N".repeat(255), description: "D".repeat(3000) });
    const log = [...base()];
    const out = pull(log, [long], [issue("NUP-2", [{ id: "7", name: "x" }])]);
    const added = out.events.find((e) => e.type === "project.milestone.added")!;
    expect(added.payload.title).toHaveLength(80);
    expect(added.payload.note).toHaveLength(1000);
    expect(added.payload.milestoneId).toBe(jiraMilestoneId("p_one", "7"));
    expect(added.payload.external).toEqual(IMP("7"));
    expect(added.idemKey).toBe("jira:version:p_one:7");
    const after = [...log, ev("project.milestone.added", BOT, "p_one", added.payload)];
    expect(pull(after, [long], []).events).toEqual([]);
  });

  it("imports a version only from a fix version of a synced issue, with a release date, not archived; one warning for a missing date", () => {
    const log = base();
    const issues = [issue("NUP-2", [{ id: "1", name: "a" }, { id: "2", name: "b" }, { id: "3", name: "c" }])];
    const out = pull(log, [version("1", { released: true }), version("2", { releaseDate: undefined }), version("3", { archived: true }), version("4")], issues);
    expect(out.events.map((e) => [e.type, e.payload.milestoneId, e.payload.shipped])).toEqual([
      ["project.milestone.added", jiraMilestoneId("p_one", "1"), undefined],
      ["project.milestone.edited", jiraMilestoneId("p_one", "1"), true],
    ]);
    expect(out.warnings.filter((w) => /no release date/.test(w))).toHaveLength(1);
  });

  it("a removed milestone's version is never reimported (tombstone), and a deleted version warns without an event", () => {
    const gone = [...base(), MS("m1", { external: IMP("7") }, BOT), P("project.milestone.edited", { milestoneId: "m1", removed: true })];
    const out = pull(gone, [version("7")], [issue("NUP-2", [{ id: "7", name: "Pilot" }])]);
    expect(out.events).toEqual([]);
    const live = [...base(), MS("m1", { external: OWN("7") }, BOT)];
    const del = pull(live, []);
    expect(del.events).toEqual([]);
    expect(del.warnings.join(" ")).toMatch(/gone from Jira/);
  });

  it("steps follow the first mapped fix version, clear when none maps, keep foreign ones, and never clear on an absent field", () => {
    const log = [...base(), MS("m1", { external: OWN("7") }, BOT)];
    const v = [marked("7")];
    const set = pull(log, v, [issue("NUP-2", [{ id: "99", name: "Foreign" }, { id: "7", name: "Pilot" }])]);
    expect(set.events).toEqual([expect.objectContaining({ type: "project.step.edited", payload: { stepId: "s1", milestoneId: "m1" } })]);
    const assigned = [...log, ev("project.step.edited", BOT, "p_one", { stepId: "s1", milestoneId: "m1" })];
    expect(pull(assigned, v, [issue("NUP-2", [{ id: "7", name: "Pilot" }])]).events).toEqual([]);
    const cleared = pull(assigned, v, [issue("NUP-2", [{ id: "99", name: "Foreign" }])]);
    expect(cleared.events[0].payload).toEqual({ stepId: "s1", milestoneId: null });
    expect(pull(assigned, v, [issue("NUP-2")]).events).toEqual([]);
    expect(pull(assigned, v, [issue("NUP-2", [{ id: "99", name: "Foreign" }])], { steps: ["s1"] }).events).toEqual([]);
  });

  it("a person's milestone choice sets the fix version once both are linked; before that it stays pending and holds the cursor", () => {
    const early = P("project.step.edited", { stepId: "s1", milestoneId: "m1" });
    const log = [...base(), MS("m1"), early];
    const waiting = push(log, []);
    expect(waiting.jobs.some((j) => j.kind === "fixVersion")).toBe(false);
    expect(waiting.pending.steps).toEqual(["s1"]);
    expect(waiting.deferredSeq).toBe(early.seq);
    const linked = [...base(), MS("m1", { external: OWN("7") }, BOT), early];
    const ready = push(linked, [marked("7")], [early]);
    expect(ready.jobs).toEqual([{ kind: "fixVersion", seq: early.seq, projectId: "p_one", stepId: "s1", issueKey: "NUP-2", versionId: "7", mappedVersionIds: ["7"] }]);
    expect(ready.deferredSeq).toBeNull();
    const clear = P("project.step.edited", { stepId: "s1", milestoneId: null });
    const cleared = [...linked, early, clear];
    expect(push(cleared, [marked("7")], [early, clear]).jobs).toEqual([{ kind: "fixVersion", seq: clear.seq, projectId: "p_one", stepId: "s1", issueKey: "NUP-2", versionId: null, mappedVersionIds: ["7"] }]);
    const sys = ev("project.step.edited", BOT, "p_one", { stepId: "s1", milestoneId: null });
    expect(push([...linked, early, sys], [marked("7")], [early, sys]).jobs).toEqual([]);
  });

  it("caps creates, updates and archives at MAX_VERSION_WRITES and holds the cursor before the deferred ones", () => {
    const creates = Array.from({ length: MAX_VERSION_WRITES + 5 }, (_, i) => MS("m" + i, { title: "T" + i }));
    const out = push([...open(), ...creates], []);
    expect(out.jobs.filter((j) => j.kind === "create")).toHaveLength(MAX_VERSION_WRITES);
    const ids = Array.from({ length: MAX_VERSION_WRITES + 3 }, (_, i) => "u" + i);
    const adds = ids.map((id, i) => MS(id, { external: OWN("v" + i) }, BOT));
    const edits = ids.map((id) => P("project.milestone.edited", { milestoneId: id, title: id + " new" }));
    const log = [...base(), ...adds, ...edits];
    const versions = ids.map((id, i) => marked("v" + i, "p_one", id));
    const capped = push(log, versions, edits);
    expect(capped.jobs.filter((j) => j.kind === "update")).toHaveLength(MAX_VERSION_WRITES);
    expect(capped.deferredSeq).toBe(edits[MAX_VERSION_WRITES].seq);
    expect(capped.pending.milestones).toHaveLength(ids.length);
  });

  it("without administer no version is created, updated or archived; one warning, edits stay pending, fix versions still go", () => {
    const edit = P("project.milestone.edited", { milestoneId: "m1", title: "Renamed" });
    const step = P("project.step.edited", { stepId: "s1", milestoneId: "m1" });
    const log = [...base(), MS("m1", { external: OWN("7") }, BOT), MS("m2"), edit, step];
    const out = push(log, [marked("7")], [edit, step], { administer: false });
    expect(out.jobs.map((j) => j.kind)).toEqual(["fixVersion"]);
    expect(out.warnings.filter((w) => /does not let the integration account change versions/.test(w))).toHaveLength(1);
    expect(out.deferredSeq).toBe(edit.seq);
    expect(out.pending.milestones).toEqual(["m1"]);
  });

  it("an off project plans nothing", () => {
    const log = [...open(), P("project.started"), P("project.sync", { system: "jira", on: false }), MS("m1")];
    expect(push(log, []).jobs).toEqual([]);
  });
});
