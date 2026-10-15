// The project pages' helpers (features/projects/views.ts) and the projects in the seeds: who sees which
// project, the list's groups, the desk of moves, the brief's suggestions, the numbers, the wait lines,
// /collaboration's rows and the timeline.
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { SEED } from "@/features/demo/seed";
import { STATIC_DEMO_SEED } from "@/features/demo/static-demo";
import { LOOP_DEFAULTS } from "@/features/loop/rules";
import { projectLabel, projectOfCase } from "@/features/projects/selectors";
import {
  asInitiatives, baselineText, changeText, groupProjects, movement, projectDesk, projectWaits, rewardRuleText, safeUrl,
  suggestedBaseline, suggestedSteps, systemOf, timelineOf, visibleProjects, type Viewer,
} from "@/features/projects/views";

let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "v" + n++, ts: 0, type, actor, target, payload, day });
const at = (day: number, ...events: CaseEvent[]): EventLog => ({ events, day });

const member: Viewer = { role: "member", name: "J. Schmidt", handle: "Anonymous #4471" };
const leader: Viewer = { role: "leader", name: "T. Vogel", handle: null };
const manager: Viewer = { role: "manager", name: "B. Hartmann", handle: null };
const S0 = reduce(SEED, emptyLog());
const byId = (S: typeof S0, id: string) => S.projects.find((p) => p.id === id)!;

describe("the seeded projects", () => {
  it("has one in each state, numbered in the order they opened", () => {
    expect(S0.projects.map((p) => [projectLabel(p), p.status])).toEqual([
      ["P-1", "recognised"], ["P-2", "running"], ["P-3", "measuring"], ["P-4", "planning"],
    ]);
  });
  it("opens P-4 the way a live yes does: c9's decision names it, T. Vogel leads", () => {
    const p = byId(S0, "pj4");
    expect(p).toMatchObject({ lead: "T. Vogel", sources: ["c9"], authors: ["S. Dahl"], openedDay: -2, baseline: null });
    const c9 = S0.cases.find((c) => c.id === "c9")!;
    expect(c9.archived).toBe(true);
    expect(projectOfCase(S0, c9)?.id).toBe("pj4");
  });
  it("records P-3's 30-day check as better and keeps the 90-day one open", () => {
    const p = byId(S0, "pj3");
    expect(p.measures).toEqual([expect.objectContaining({ check: 30, value: 165, verdict: "better", changePct: 37.5 })]);
    expect(p.checks.map((c) => [c.check, c.measured])).toEqual([[30, true], [90, false]]);
  });
  it("P-2 runs with a blocked step and a Jira key on another", () => {
    const p = byId(S0, "pj2");
    expect(p.steps.find((s) => s.column === "blocked")?.why).toMatch(/VPN/);
    expect(p.steps.find((s) => s.id === "s2")?.external?.key).toBe("FS-12");
  });
  it("leaves the ledger without late projects on day 0", () => {
    expect(S0.ledger).toMatchObject({ projectsEscalated: 0, measuresOwed: 0, unmeasured: 0 });
  });
  it("shows the same projects on the static demo, with its names", () => {
    const S = reduce(STATIC_DEMO_SEED, emptyLog());
    expect(S.projects.map((p) => p.status)).toEqual(S0.projects.map((p) => p.status));
    expect(byId(S, "pj1").authors).toEqual(["Jonas Schmidt"]);
    expect(byId(S, "pj4").lead).toBe("Thomas Vogel");
    const me: Viewer = { role: "member", name: "Jonas Schmidt", handle: null };
    expect(visibleProjects(S, me).map((p) => p.id)).toEqual(["pj1", "pj2"]);
  });
});

describe("visibleProjects", () => {
  it("shows a member the projects of their own ideas and the ones they are on", () => {
    expect(visibleProjects(S0, member).map((p) => p.id)).toEqual(["pj1", "pj2"]);
    const S = reduce(SEED, at(0, ev("project.member", "T. Vogel", "pj4", { name: "J. Schmidt", on: true })));
    expect(visibleProjects(S, member).map((p) => p.id)).toEqual(["pj1", "pj2", "pj4"]);
  });
  it("shows leaders and managers all of them, and no seed projects with demo data off", () => {
    expect(visibleProjects(S0, leader)).toHaveLength(4);
    expect(visibleProjects(S0, manager, false)).toHaveLength(0);
  });
});

describe("groupProjects", () => {
  it("keeps the states in the order a project moves, measured and recognised together", () => {
    const g = groupProjects(S0.projects);
    expect(g.map((x) => [x.label, x.projects.map((p) => p.id)])).toEqual([
      ["Planning", ["pj4"]], ["Running", ["pj2"]], ["Measuring", ["pj3"]], ["Measured and recognised", ["pj1"]], ["Stopped", []],
    ]);
  });
});

describe("projectDesk", () => {
  it("gives the lead their next move", () => {
    expect(projectDesk(S0.projects, 0, leader).map((d) => [d.project.id, d.move, d.why])).toEqual([["pj4", "baseline", "lead"]]);
  });
  it("moves a late start to the route's deputy, late first", () => {
    const S = reduce(SEED, at(9));
    const p = byId(S, "pj4");
    expect(p.overdue).toBe(true);
    expect(p.escalated?.to).toBe("M. Roth"); // r7: T. Vogel owns it, M. Roth is the deputy
    expect(projectDesk(S.projects, S.day, { role: "leader", name: "M. Roth", handle: null }).map((d) => [d.project.id, d.why])).toEqual([["pj4", "escalated"]]);
  });
  it("puts a due reward on a manager's desk only", () => {
    const S = reduce({ ...SEED, projects: SEED.projects?.filter((p) => p.id === "pj1").map((p) => ({ ...p, seedEvents: p.seedEvents?.filter((e) => e.type !== "project.rewarded") })) }, emptyLog());
    expect(byId(S, "pj1").rewardDue).toBe(true);
    expect(projectDesk(S.projects, 0, manager).map((d) => d.move)).toEqual(["reward"]);
    expect(projectDesk(S.projects, 0, { role: "leader", name: "L. Brandt", handle: null })).toEqual([]);
  });
});

describe("the brief's suggestions", () => {
  const body = SEED.cases.find((c) => c.id === "c9")!.body;
  it("offers First step, Then and Still open as steps, minus what is on the board", () => {
    expect(suggestedSteps(body, []).map((s) => s.label)).toEqual(["First step", "Then", "Still open"]);
    expect(suggestedSteps(body, [])[2].text).toBe("Clear up: whether Quality needs a second gauge at the new bench");
    const left = suggestedSteps(body, [{ text: "move the spare bench from line 1 next to the press for two weeks" }]);
    expect(left.map((s) => s.label)).toEqual(["Then", "Still open"]);
    expect(suggestedSteps("Just a sentence.", [])).toEqual([]);
  });
  it("reads the metric, unit and direction from the Goal line", () => {
    expect(suggestedBaseline(body)).toEqual({ metric: "Deburring queue", unit: "minutes", better: "down", goal: "Deburring queue under 10 minutes" });
    expect(suggestedBaseline("x\n*Goal* Every changeover under 20 minutes")).toMatchObject({ metric: "changeover time", unit: "minutes", better: "down" });
    expect(suggestedBaseline("x\n*Goal* First-pass yield above 98 %")).toMatchObject({ metric: "First-pass yield", unit: "%", better: "up" });
  });
  it("falls back to the goal as said, then to the idea's KPI, then to nothing", () => {
    expect(suggestedBaseline("x\n*Goal* Fewer surprises at the customer")).toEqual({ metric: "Fewer surprises at the customer", unit: "", better: null, goal: "Fewer surprises at the customer" });
    expect(suggestedBaseline("no goal", "service revenue")).toEqual({ metric: "service revenue", unit: "", better: null, goal: "" });
    expect(suggestedBaseline("no goal", null)).toBeNull();
  });
});

describe("numbers and words", () => {
  const b = byId(S0, "pj1").baseline!;
  it("says the movement in the baseline's unit, with a signed percent", () => {
    expect(movement(b, { value: 11 })).toBe("35 → 11 days");
    expect(movement(null, { value: 11 })).toBe("11");
    expect(changeText(-68.6)).toBe("−68.6 %");
    expect(changeText(37.5)).toBe("+37.5 %");
    expect(changeText(0)).toBe("±0 %");
    expect(changeText(null)).toBe("");
    expect(baselineText(b)).toBe("35 days · time to first productive day · lower is better");
    expect(baselineText({ none: true, why: "No counter", day: 0, by: "x" })).toBe("No number possible: No counter");
  });
  it("puts each reward rule in words", () => {
    expect(rewardRuleText(LOOP_DEFAULTS.reward)).toBe("A thank-you, on record");
    expect(rewardRuleText({ kind: "fixed", amount: 250, sharePct: null, capEur: null })).toBe("€250 for the authors");
    expect(rewardRuleText({ kind: "share", amount: null, sharePct: 10, capEur: 2000 })).toBe("10% of the measured yearly saving, up to €2,000");
    expect(rewardRuleText({ kind: "none", amount: null, sharePct: null, capEur: null })).toMatch(/No reward/);
  });
  it("only links http(s) addresses, and knows a Jira key", () => {
    expect(safeUrl("https://jira.acme.example/browse/FS-12")).toBe("https://jira.acme.example/browse/FS-12");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("")).toBeNull();
    expect(systemOf("FS-12")).toBe("jira");
    expect(systemOf("drawing 4")).toBe("url");
  });
});

describe("projectWaits", () => {
  it("counts decided -> started and done -> measured as medians, with what still waits", () => {
    const w = projectWaits(S0.projects);
    // started: P-1 2 days after the yes, P-2 84, P-3 5 -> median 5; P-4 not started
    expect(w.started).toEqual({ n: 3, medianDays: 5, waiting: 1 });
    // first measure: P-1 32 days after done, P-3 32
    expect(w.measured).toEqual({ n: 2, medianDays: 32, waiting: 0 });
  });
});

describe("asInitiatives", () => {
  const deptOf = (name: string) => SEED.people.find((p) => p.name === name)?.dept ?? null;
  it("turns projects into /collaboration's rows, stuck where they wait", () => {
    const rows = asInitiatives(S0.projects, deptOf, (id) => id, (p) => "because " + p.id);
    expect(rows.map((r) => [r.id, r.status])).toEqual([["pj1", "Shipped"], ["pj2", "Building"], ["pj3", "Shipped"], ["pj4", "Proposed"]]);
    const pj2 = rows.find((r) => r.id === "pj2")!;
    expect(pj2).toMatchObject({ people: 2, stage: "1 of 4 steps done", why: "because pj2" });
    expect(pj2.stuckOn).toEqual({ name: "L. Brandt", reason: "blocked: Waiting for the VPN profile for the vans" });
    expect(pj2.members[0]).toEqual({ name: "D. Ferraro", role: "Lead · FLD" });
  });
  it("leaves stopped projects out", () => {
    const S = reduce(SEED, at(0, ev("project.stopped", "T. Vogel", "pj4", { why: "No space by the press" })));
    expect(asInitiatives(S.projects, deptOf, (id) => id, () => "").map((r) => r.id)).not.toContain("pj4");
  });
});

describe("timelineOf", () => {
  it("tells what happened, one line per event, without the comments", () => {
    const S = reduce(SEED, at(1,
      ev("project.baseline", "T. Vogel", "pj4", { metric: "Deburring queue", unit: "minutes", value: 25, better: "down", source: "stopwatch" }),
      ev("project.step.added", "T. Vogel", "pj4", { stepId: "sA", text: "Move the bench" }),
      ev("project.step.moved", "T. Vogel", "pj4", { stepId: "sA", to: "blocked", why: "No forklift" }),
      ev("project.commented", "T. Vogel", "pj4", { text: "On it" }),
      ev("project.started", "T. Vogel", "pj4", {}, 1)));
    expect(timelineOf(byId(S, "pj4")).map((l) => l.text)).toEqual([
      "said yes, and the project opened with T. Vogel as lead",
      "took the baseline: 25 minutes Deburring queue (stopwatch)",
      "added a step: Move the bench",
      "moved “Move the bench” to Blocked: No forklift",
      "started the project",
    ]);
  });
});
