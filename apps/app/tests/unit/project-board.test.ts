// The project board as a Kanban: a step can start in any column but Blocked, cards are reordered
// with `before`, a card's details change through project.step.edited, and the page reads its numbers,
// its life and its tools off the reduced project. Reducer, permissions and views.
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS, ROUTES } from "@/features/demo/seed";
import { board } from "@/features/projects/selectors";
import { boardStats, connectionsOf, lifecycle, systemFrom, timelineOf } from "@/features/projects/views";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS };

let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "b" + n++, ts: 0, type, actor, target, payload, day });
const logAt = (day: number, ...events: CaseEvent[]): EventLog => ({ events, day });
const P = (type: CaseEventType, payload: EventPayload = {}, day = 0, actor = "L. Brandt") => ev(type, actor, "p_one", payload, day);
const open = [
  ev("case.raised", "Anonymous #4471", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" }),
  ev("case.decided", "T. Vogel", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", title: "Shorter changeover" }),
  P("project.member", { name: "M. Roth", on: true }),
  P("project.baseline", { metric: "Changeover time", unit: "min", value: 42, better: "down", source: "MES" }),
  P("project.started"),
];
const add = (stepId: string, text: string, more: EventPayload = {}, day = 0, actor = "L. Brandt") => P("project.step.added", { stepId, text, ...more }, day, actor);
const move = (stepId: string, to: string, more: EventPayload = {}, day = 0, actor = "L. Brandt") => P("project.step.moved", { stepId, to, ...more }, day, actor);
const project = (day: number, ...events: CaseEvent[]) => reduce(SEED, logAt(day, ...open, ...events)).projects[0];
const ids = (list: { id: string }[]) => list.map((s) => s.id);

describe("board: columns and order", () => {
  it("a new step starts in the column it was added to - never in Blocked", () => {
    const p = project(0, add("s1", "A"), add("s2", "B", { to: "doing" }), add("s3", "C", { to: "done" }), add("s4", "D", { to: "blocked" }));
    const b = board(p);
    expect([ids(b.todo), ids(b.doing), ids(b.blocked), ids(b.done)]).toEqual([["s1", "s4"], ["s2"], [], ["s3"]]);
    expect(p.steps.find((s) => s.id === "s3")).toMatchObject({ startedDay: 0, doneDay: 0 });
  });

  it("a card lands above `before`, or at the foot of its new column", () => {
    const p = project(1, add("s1", "A"), add("s2", "B"), add("s3", "C"),
      move("s3", "todo", { before: "s1" }, 1), // reordered inside To do
      move("s1", "doing", {}, 1), move("s2", "doing", { before: "s1" }, 1));
    const b = board(p);
    expect(ids(b.todo)).toEqual(["s3"]);
    expect(ids(b.doing)).toEqual(["s2", "s1"]);
  });

  it("a move that keeps the column and names no place stays put (a connector repeating a status)", () => {
    const p = project(1, add("s1", "A"), add("s2", "B"), move("s1", "todo", {}, 1));
    expect(ids(board(p).todo)).toEqual(["s1", "s2"]);
  });

  it("a reorder keeps the day the card reached its column, and a blocked card's reason", () => {
    const p = project(5, add("s1", "A"), add("s2", "B"), move("s1", "blocked", { why: "parts" }, 1), move("s2", "blocked", { why: "tools" }, 2),
      move("s2", "blocked", { before: "s1" }, 4));
    expect(ids(board(p).blocked)).toEqual(["s2", "s1"]);
    expect(p.steps.find((s) => s.id === "s2")).toMatchObject({ movedDay: 2, why: "tools" });
  });

  it("cycle time: first Doing to the last Done", () => {
    const p = project(9, add("s1", "A", {}, 0), move("s1", "doing", {}, 2), move("s1", "blocked", { why: "parts" }, 3), move("s1", "doing", {}, 5), move("s1", "done", {}, 6));
    expect(p.steps[0]).toMatchObject({ startedDay: 2, doneDay: 6 });
    const back = project(9, add("s1", "A"), move("s1", "done", {}, 2), move("s1", "doing", {}, 4));
    expect(back.steps[0].doneDay).toBeNull();
  });
});

describe("board: editing a card", () => {
  it("only the fields sent change; owner '' and dueDay null clear them; removed takes it off", () => {
    const p = project(2,
      add("s1", "A", { owner: "M. Roth", dueDay: 5 }), add("s2", "B"),
      P("project.step.edited", { stepId: "s1", note: "Done when the cart is on line 3" }, 1),
      P("project.step.edited", { stepId: "s1", text: "Order the cart", owner: "" }, 2),
      P("project.step.edited", { stepId: "s2", dueDay: 9 }, 2),
      P("project.step.edited", { stepId: "s2", dueDay: null }, 2),
      P("project.step.edited", { stepId: "s2", removed: true }, 2));
    expect(p.steps).toHaveLength(1);
    expect(p.steps[0]).toMatchObject({ text: "Order the cart", owner: null, dueDay: 5, note: "Done when the cart is on line 3" });
    const lines = timelineOf(p).map((l) => l.text);
    expect(lines).toContain("changed “Order the cart”: renamed it, took the owner off");
    expect(lines).toContain("removed the step “B”");
  });

  it("the timeline leaves out a reorder inside one column", () => {
    const p = project(1, add("s1", "A"), add("s2", "B"), move("s2", "todo", { before: "s1" }, 1), move("s1", "doing", {}, 1));
    expect(timelineOf(p).filter((l) => l.text.startsWith("moved")).map((l) => l.text)).toEqual(["moved “A” to Doing"]);
  });
});

const actor = (name: string, role: Actor["role"] = "leader"): Actor => ({ role, name, handle: null });
const q = (type: string, payload: Record<string, unknown> = {}) => ({ type, target: "p_one", payload });

describe("board: who may", () => {
  const S = reduce(SEED, logAt(0, ...open, add("s1", "Mine", { owner: "M. Roth" }), add("s2", "Nobody's"), add("s3", "The lead's", { owner: "L. Brandt" }, 0, "M. Roth")));

  it("the team moves an unowned step; an owned one moves by its owner or the lead", () => {
    expect(mayAppend(actor("M. Roth"), q("project.step.moved", { stepId: "s2", to: "doing" }), S).ok).toBe(true);
    expect(mayAppend(actor("M. Roth"), q("project.step.moved", { stepId: "s3", to: "doing" }), S).ok).toBe(false);
    expect(mayAppend(actor("H. Sander"), q("project.step.moved", { stepId: "s2", to: "doing" }), S).ok).toBe(false);
    expect(mayAppend(actor("L. Brandt"), q("project.step.moved", { stepId: "s1", to: "todo", before: "s2" }), S).ok).toBe(true);
    expect(mayAppend(actor("L. Brandt"), q("project.step.moved", { stepId: "s1", to: "todo", before: "nope" }), S).ok).toBe(false);
  });

  it("a new step starts in To do, Doing or Done", () => {
    expect(mayAppend(actor("M. Roth"), q("project.step.added", { stepId: "s_9", text: "X", to: "doing" }), S).ok).toBe(true);
    expect(mayAppend(actor("M. Roth"), q("project.step.added", { stepId: "s_9", text: "X", to: "blocked" }), S).ok).toBe(false);
  });

  it("the team edits a card; the lead or whoever added it removes it", () => {
    expect(mayAppend(actor("M. Roth"), q("project.step.edited", { stepId: "s1", owner: "L. Brandt", dueDay: 4 }), S).ok).toBe(true);
    expect(mayAppend(actor("M. Roth"), q("project.step.edited", { stepId: "s1", text: " " }), S).ok).toBe(false);
    expect(mayAppend(actor("J. Schmidt", "member"), q("project.step.edited", { stepId: "s1", note: "hi" }), S).ok).toBe(false);
    expect(mayAppend(actor("M. Roth"), q("project.step.edited", { stepId: "s1", removed: true }), S).ok).toBe(false);
    expect(mayAppend(actor("M. Roth"), q("project.step.edited", { stepId: "s3", removed: true }), S).ok).toBe(true);
    expect(mayAppend(actor("L. Brandt"), q("project.step.edited", { stepId: "s1", removed: true }), S).ok).toBe(true);
  });
});

describe("board: what the page reads", () => {
  it("the numbers: done, blocked, late, unowned, this week, cycle time and the stalest card", () => {
    const p = project(10,
      add("s1", "A", { owner: "M. Roth" }, 0), move("s1", "doing", {}, 1), move("s1", "done", {}, 5),
      add("s2", "B", { dueDay: 8 }, 0), move("s2", "doing", {}, 2), move("s2", "done", {}, 4),
      add("s3", "C", { dueDay: 6, owner: "M. Roth" }, 0), move("s3", "blocked", { why: "parts" }, 3),
      add("s4", "D", {}, 0));
    const st = boardStats(p, 10);
    expect(st).toMatchObject({ total: 4, pct: 50, late: 1, unowned: 1, doneWeek: 2, cycleDays: 3 });
    expect(st.by).toEqual({ todo: 1, doing: 0, blocked: 1, done: 2 });
    expect(st.stalest).toMatchObject({ days: 7 });
    expect(st.stalest?.step.id).toBe("s3");
  });

  it("the life: reached stages carry their day, the next one is 'now', a stop ends the line", () => {
    const run = project(3);
    expect(lifecycle(run).map((s) => [s.key, s.state])).toEqual([
      ["opened", "done"], ["baseline", "done"], ["started", "done"], ["done", "now"], ["measured", "next"], ["recognised", "next"],
    ]);
    const stopped = project(3, P("project.stopped", { why: "Line closes" }, 2));
    expect(lifecycle(stopped).find((s) => s.state === "stopped")).toMatchObject({ key: "done", label: "Stopped", day: 2 });
  });

  it("the tools: an address names its tool, a Jira-style key means Jira, the rest is a plain link", () => {
    expect(systemFrom("https://acme.atlassian.net/browse/FS-1")).toBe("jira");
    expect(systemFrom("https://dev.azure.com/acme/line/_workitems/edit/12")).toBe("azure");
    expect(systemFrom("https://teams.microsoft.com/l/channel/x")).toBe("teams");
    expect(systemFrom("https://acme.sharepoint.com/sites/x")).toBe("sharepoint");
    expect(systemFrom("", "FS-12")).toBe("jira");
    expect(systemFrom("https://example.com/teams.microsoft.com")).toBe("url");
    const p = project(0, add("s1", "A"),
      P("project.linked", { system: "jira", key: "FS-9", url: "https://acme.atlassian.net/browse/FS-9" }),
      P("project.linked", { system: "jira", key: "FS-10", stepId: "s1" }),
      P("project.linked", { system: "teams", url: "https://teams.microsoft.com/l/channel/x" }));
    const rows = connectionsOf(p);
    expect(rows.slice(0, 2).map((r) => [r.tool.id, r.links.length, r.steps])).toEqual([["jira", 2, 1], ["teams", 1, 0]]);
    expect(rows.some((r) => r.tool.id === "url")).toBe(false);
  });
});
