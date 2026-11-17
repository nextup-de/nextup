// The Demo data switch's sample data: who gets it, and that every role finds something on every page.
import { describe, expect, it } from "vitest";
import { meFor } from "@/features/auth/identity";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { inboxOf, mineOf } from "@/features/cases/selectors";
import { canOpen, unitsOf } from "@/features/cases/visibility";
import { EMPTY_SEED, LOCAL_SEED } from "@/features/demo";
import { DEMO_FOLDER } from "@/features/demo/files-demo";
import { isSampleId, sampleDataOn, sampleFolderLinks, withSampleData, withSampleFolders, type SampleViewer } from "@/features/demo/sample-data";
import { sampleDecisionLines } from "@/features/demo/sample-decisions";
import { byFolderJob } from "@/features/files/folder-actor";
import { projectFolder } from "@/features/files/link";
import { inboxItems } from "@/features/inbox";
import { visibleProjectsFor } from "@/features/projects/views";
import type { Role } from "@/config/roles";

const viewer = (role: Role): SampleViewer => ({ userId: "u_" + role, name: "R. Tester", handle: role === "member" ? "Anonymous #1000" : null, role });

function stateFor(role: Role, base = EMPTY_SEED) {
  const seed = withSampleData(base, viewer(role), 0);
  const S = reduce(seed, emptyLog());
  return { seed, S, me: meFor("u_" + role, seed.seats) };
}

describe("who gets the sample data", () => {
  it("only after the switch was ticked", () => {
    expect(sampleDataOn({ demoTools: true }, true)).toBe(true);
    expect(sampleDataOn({ demoTools: true }, false)).toBe(false);
    expect(sampleDataOn({ demoTools: true }, undefined)).toBe(false);
  });
  it("never for a company with real people", () => {
    expect(sampleDataOn({ demoTools: false }, true)).toBe(false);
  });
  it("not where demo data is the default: the static demo and the demo tests keep their seed", () => {
    expect(sampleDataOn({ demoTools: true, demoDataDefault: true }, true)).toBe(false);
  });
});

describe("what each role finds", () => {
  it.each(["member", "leader", "manager"] as const)("%s has cases they raised and projects, even in an empty company", (role) => {
    const { S, me } = stateFor(role);
    // Open, asked, decided yes, a reasoned no and one merged into an open case.
    expect(mineOf(S, me).map((c) => c.status).sort()).toEqual(["asked", "decided", "decided", "merged", "open"]);
    const projects = visibleProjectsFor(S, { userId: me.userId, role, me } as Parameters<typeof visibleProjectsFor>[1]);
    expect(new Set(projects.map((p) => p.status))).toEqual(new Set(role === "member" ? ["planning", "running", "measuring", "recognised"] : ["planning", "running", "measuring", "recognised", "stopped"]));
    // Two drafts the viewer is part of: one waits for them to take the lead, one invites them onto the team.
    expect(projects.filter((p) => p.draft).map((p) => p.id).sort()).toEqual(role === "member" ? ["sample-pj2", "sample-pj5"] : ["sample-pj2", "sample-pj5", "sample-pj7"]);
  });

  it.each([
    ["member", ["invitation", "lead", "question", "update", "view"]],
    ["leader", ["approval", "case", "help", "invitation", "lead", "question", "update", "view"]],
    ["manager", ["appeal", "approval", "baseline", "case", "confirm", "help", "idea", "invitation", "lead", "question", "update"]],
  ] as const)("%s finds what the new features ask of them in the inbox", (role, kinds) => {
    const { seed, S, me } = stateFor(role);
    const items = inboxItems({ state: S, me, seats: seed.seats, today: 0, demo: true, flags: { projects: true, discussion: true }, role });
    expect([...new Set(items.map((i) => i.kind))].filter((k) => k !== "move").sort()).toEqual([...kinds]);
    if (role !== "member") expect(items.find((i) => i.caseId === "sample-c2")?.cause).toBe("passed");
  });

  it("the projects show a pause, a stop, a moved done-by, a help ask, a weekly update and a dropped step", () => {
    const { S } = stateFor("leader");
    const p = (id: string) => S.projects.find((x) => x.id === id)!;
    expect(p("sample-pj8").pausedUntil).toBe(9);
    expect(p("sample-pj9").stopped?.why).toMatch(/trays/);
    expect(p("sample-pj1").doneByMoves).toHaveLength(1);
    expect(p("sample-pj1").helpAsks).toHaveLength(1);
    expect(p("sample-pj1").latestUpdate?.week).toBe(-4);
    expect(p("sample-pj3").steps.find((s) => s.id === "s3")?.dropped?.why).toMatch(/spring/);
    expect(p("sample-pj5").invites).toHaveLength(1);
  });

  it("a case waits for an approval, a no carries its category and revisit day, and a second look waits", () => {
    const { S } = stateFor("leader");
    const c = (id: string) => S.cases.find((x) => x.id === id)!;
    expect(c("sample-c12").status).toBe("approval");
    expect(c("sample-c10").decided).toMatchObject({ answer: "no", category: "not-now", revisitDay: 18 });
    expect(c("sample-c8").appeal?.decided).toBeNull();
    expect(c("sample-c11").status).toBe("merged");
  });

  it("a leader's and a manager's desk holds three open cases, an employee's none", () => {
    expect(inboxOf(stateFor("leader").S, stateFor("leader").me)).toHaveLength(3);
    expect(inboxOf(stateFor("manager").S, stateFor("manager").me)).toHaveLength(3);
    expect(inboxOf(stateFor("member").S, stateFor("member").me)).toHaveLength(0);
  });

  it("an employee may open their own cases and the discussion they were asked into, no others", () => {
    const { seed, S, me } = stateFor("member");
    const ctx = { seats: seed.seats, roles: seed.roles ?? [], projects: S.projects };
    const open = S.cases.filter((c) => canOpen(c, { me, role: "member", unitIds: unitsOf(me, ctx) }, ctx)).map((c) => c.id);
    expect(open).toEqual(expect.arrayContaining(["sample-c4", "sample-c5", "sample-c6", "sample-c7"]));
    expect(open).not.toContain("sample-c1");
  });

  it("a manager has two ideas waiting and a decision log with yeses and noes", () => {
    const { seed, S } = stateFor("manager");
    expect(S.ideas.filter((i) => i.status === "Awaiting decision")).toHaveLength(2);
    const filters = { period: "90", answer: "", project: "", q: "" } as const;
    const lines = sampleDecisionLines(S.cases, S, seed.roles ?? [], filters, (d) => String(d));
    expect(lines.map((l) => l.answer).sort()).toEqual(["no", "no", "yes", "yes", "yes", "yes"]);
    expect(lines[0].caseId).toBe("sample-c9"); // the newest first
    expect(sampleDecisionLines(S.cases, S, seed.roles ?? [], { ...filters, answer: "no" }, (d) => String(d))).toHaveLength(2);
  });
});

describe("the data itself", () => {
  it("replaces the company's seed content but keeps its seats and routes in front", () => {
    const seed = withSampleData(LOCAL_SEED, viewer("leader"), 0);
    expect(seed.cases.every((c) => isSampleId(c.id))).toBe(true);
    expect(seed.seats.slice(0, LOCAL_SEED.seats.length)).toEqual(LOCAL_SEED.seats);
    expect(seed.routes.slice(0, LOCAL_SEED.routes.length)).toEqual(LOCAL_SEED.routes);
  });

  it("ignores events on the company's own seed cases", () => {
    const seed = withSampleData(LOCAL_SEED, viewer("leader"), 0);
    const log = { day: 0, events: [{ id: "e1", ts: 1, day: 0, type: "case.read" as const, actor: "x", actorUserId: null, target: "c1", payload: {} }] };
    expect(() => reduce(seed, log)).not.toThrow();
  });

  it("names no real manufacturer, in a public repo", () => {
    const text = JSON.stringify(withSampleData(EMPTY_SEED, viewer("manager"), 0)).toLowerCase();
    expect(text).not.toMatch(/\b(volkswagen|vw|bmw|mercedes|audi|porsche|daimler|skoda)\b/);
  });

  it("moves with the company's day", () => {
    const later = withSampleData(EMPTY_SEED, viewer("member"), 40);
    expect(later.cases.find((c) => c.id === "sample-c6")?.raisedDay).toBe(39);
  });
});

describe("a sample project's folder", () => {
  it("is linked for every project of the sample data, drafts included, from the day it opened", () => {
    for (const role of ["member", "leader", "manager"] as const) {
      const { S } = stateFor(role);
      expect(S.projects.length).toBeGreaterThan(6);
      for (const p of S.projects) expect([p.id, projectFolder(p)?.url]).toEqual([p.id, DEMO_FOLDER.url]);
      expect(sampleFolderLinks(S.projects)).toEqual([]);
    }
  });

  it("is linked as the folder job links one, for a sample project opened in this browser and for no other", () => {
    const seed = withSampleData(EMPTY_SEED, viewer("leader"), 0);
    const yes = { id: "e1", ts: 1, day: 0, type: "case.decided" as const, actor: "R. Tester", actorUserId: "u_leader", target: "sample-c3", payload: { answer: "yes" as const, projectId: "sample-p-new", lead: "R. Tester", leadUserId: "u_leader" } };
    const S = reduce(seed, { day: 0, events: [yes] });
    const opened = S.projects.find((p) => p.id === "sample-p-new")!;
    expect(projectFolder(opened)).toBeNull();
    const links = sampleFolderLinks([...S.projects, { id: "p-real", links: [] }]);
    expect(links).toEqual([{ type: "project.linked", actor: "system:files", actorUserId: null, target: "sample-p-new", payload: DEMO_FOLDER }]);
    expect(byFolderJob(links[0])).toBe(true);
  });

  it("is written to the log once: a second run finds it there and leaves the log alone", () => {
    const seed = withSampleData(EMPTY_SEED, viewer("leader"), 3);
    const yes = { id: "e1", ts: 1, day: 3, type: "case.decided" as const, actor: "R. Tester", actorUserId: "u_leader", target: "sample-c3", payload: { answer: "yes" as const, projectId: "sample-p-new", lead: "R. Tester", leadUserId: "u_leader" } };
    const before = { day: 3, events: [yes] };
    const stale = reduce(seed, before).projects;
    const log = withSampleFolders(before, stale, 3);
    expect(log.events).toHaveLength(2);
    expect(log.events[1]).toMatchObject({ type: "project.linked", day: 3, actor: "system:files", actorUserId: null, target: "sample-p-new", payload: DEMO_FOLDER });
    expect(projectFolder(reduce(seed, log).projects.find((p) => p.id === "sample-p-new")!)?.url).toBe(DEMO_FOLDER.url);
    // The same stale list again (an effect that ran twice), and the list as it now is: neither writes.
    expect(withSampleFolders(log, stale, 3)).toBe(log);
    expect(withSampleFolders(log, reduce(seed, log).projects, 3)).toBe(log);
  });
});
