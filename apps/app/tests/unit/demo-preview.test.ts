// The click-through preview at /demo/preview (features/demo/preview): the templates name roles and not
// people, a yes fills the board from its template, the start waits for the needed setup items, and
// every suggestion of the agent gets one answer from a person.
import { describe, expect, it } from "vitest";
import { DEMO_NAMES } from "@/features/demo/static-demo";
import { PREVIEW_DAY, PREVIEW_START, canStart, missingSetup, openSuggestions, questionsAt, reducePreview, type PreviewAction, type PreviewState } from "@/features/demo/preview/state";
import { PREVIEW_DRAFT, ROUTE_TEMPLATE } from "@/features/demo/preview/story";
import { PREVIEW_TEMPLATES, templateOf } from "@/features/demo/preview/templates";

const run = (actions: PreviewAction[], from: PreviewState = PREVIEW_START) => actions.reduce(reducePreview, from);
const setUp: PreviewAction[] = (["team", "goal", "baseline"] as const).map((key) => ({ type: "setup", key, mark: "done" }));
const started = (templateKey: "quick-win" | "8d" | "investment" | null) => run([{ type: "decide", templateKey, withDraft: false }, ...setUp, { type: "start" }]);

describe("the preview's templates", () => {
  it("are the three of the plan, each with steps in the order they are due", () => {
    expect(PREVIEW_TEMPLATES.map((t) => t.key)).toEqual(["quick-win", "8d", "investment"]);
    for (const t of PREVIEW_TEMPLATES) {
      const days = t.steps.map((s) => s.dueDay);
      expect(days).toEqual([...days].sort((a, b) => a - b));
      expect(t.steps.every((s) => s.title && s.role)).toBe(true);
    }
    expect(templateOf("8d").steps).toHaveLength(8);
  });

  it("name roles, never the demo's people", () => {
    const names = DEMO_NAMES.map(([, full]) => full);
    const text = JSON.stringify([PREVIEW_TEMPLATES, PREVIEW_DRAFT.team]);
    expect(names.filter((n) => text.includes(n))).toEqual([]);
  });

  it("the agent's draft and the route propose a template that exists", () => {
    expect(templateOf(PREVIEW_DRAFT.templateKey).key).toBe("8d");
    expect(templateOf(ROUTE_TEMPLATE).key).toBe("8d");
  });
});

describe("the yes", () => {
  it("fills the board from the template, every step still to do", () => {
    const s = run([{ type: "decide", templateKey: "8d", withDraft: false }]);
    expect(s.steps.map((x) => x.column)).toEqual(Array(8).fill("todo"));
    expect(s.steps[3]).toMatchObject({ id: "s4", role: "Quality engineer", dueDay: 7, fromAgent: false });
  });

  it("without a template gives today's empty board", () => {
    expect(run([{ type: "decide", templateKey: null, withDraft: false }]).steps).toEqual([]);
  });

  it("takes the agent's draft only when the agent was asked", () => {
    expect(run([{ type: "decide", templateKey: "8d", withDraft: true }]).decided?.withDraft).toBe(false);
    expect(run([{ type: "plan" }, { type: "decide", templateKey: "8d", withDraft: true }]).decided?.withDraft).toBe(true);
  });

  it("is said once", () => {
    const s = run([{ type: "decide", templateKey: "8d", withDraft: false }, { type: "decide", templateKey: "quick-win", withDraft: false }]);
    expect(s.decided?.templateKey).toBe("8d");
  });
});

describe("the setup", () => {
  const decided = run([{ type: "decide", templateKey: "quick-win", withDraft: false }]);

  it("needs team, goal and baseline before the start", () => {
    expect(missingSetup(decided)).toEqual(["team", "goal", "baseline"]);
    expect(reducePreview(decided, { type: "start" }).started).toBe(false);
    const ready = run(setUp, decided);
    expect(canStart(ready)).toBe(true);
    expect(reducePreview(ready, { type: "start" }).started).toBe(true);
  });

  it("lets only the other items be marked as not needed, and undone", () => {
    expect(reducePreview(decided, { type: "setup", key: "goal", mark: "na" }).setup.goal).toBeUndefined();
    const s = reducePreview(decided, { type: "setup", key: "tools", mark: "na" });
    expect(s.setup.tools).toBe("na");
    expect(reducePreview(s, { type: "setup", key: "tools", mark: null }).setup).toEqual({});
  });

  it("is closed once the project runs", () => {
    const s = started("quick-win");
    expect(reducePreview(s, { type: "setup", key: "team", mark: null })).toBe(s);
  });
});

describe("after the start", () => {
  it("the board stands on the preview's day: what was due is done, the next step is open", () => {
    const s = started("8d");
    expect(s.steps.filter((x) => x.dueDay < PREVIEW_DAY).every((x) => x.column === "done")).toBe(true);
    expect(s.steps.map((x) => x.column)).toEqual(["done", "done", "done", "doing", "todo", "todo", "todo", "todo"]);
  });

  it("the agent has a nudge, an update and a step, written from the board", () => {
    const s = started("8d");
    expect(s.suggestions.map((x) => x.kind)).toEqual(["unblock", "report", "plan"]);
    expect(s.suggestions[0]).toMatchObject({ role: "Quality engineer", why: "It is due in 2 days and nobody has taken it yet." });
    expect(s.suggestions[1].draft).toContain("3 of 8 steps are done");
    expect(s.suggestions[2].step).toEqual(templateOf("8d").learned.step);
  });

  it("without a template the agent suggests the update and a first step, and no nudge", () => {
    expect(started(null).suggestions.map((x) => x.kind)).toEqual(["report", "plan"]);
  });

  it("an accepted plan adds its step; a dismissed one adds nothing", () => {
    const s = started("8d");
    const yes = reducePreview(s, { type: "answer", kind: "plan", answer: "accepted" });
    expect(yes.steps).toHaveLength(9);
    expect(yes.steps[8]).toMatchObject({ title: "Check the packaging with the supplier", column: "todo", fromAgent: true });
    expect(reducePreview(s, { type: "answer", kind: "plan", answer: "dismissed" }).steps).toHaveLength(8);
  });

  it("a suggestion is answered once and keeps its words", () => {
    const s = reducePreview(started("8d"), { type: "answer", kind: "report", answer: "dismissed" });
    expect(reducePreview(s, { type: "answer", kind: "report", answer: "accepted" })).toBe(s);
    expect(openSuggestions(s).map((x) => x.kind)).toEqual(["unblock", "plan"]);
    const moved = reducePreview(s, { type: "move", stepId: "s4" });
    expect(moved.steps[3].column).toBe("done");
    expect(moved.suggestions).toBe(s.suggestions);
  });

  it("steps move forward one column, and only once the project runs", () => {
    const before = run([{ type: "decide", templateKey: "8d", withDraft: false }]);
    expect(reducePreview(before, { type: "move", stepId: "s1" })).toBe(before);
    const s = started("8d");
    expect(reducePreview(s, { type: "move", stepId: "s5" }).steps[4].column).toBe("doing");
  });

  it("the ask box answers from the board", () => {
    const [open, time] = questionsAt(started("8d").steps);
    expect(open.a).toBe('"D4 Find the root cause" (Quality engineer, due on day 7).');
    expect(time.a).toBe("3 of 8 steps are done and nothing is late. The last step is due on day 40.");
  });

  it("starting over forgets everything", () => {
    expect(reducePreview(started("8d"), { type: "reset" })).toBe(PREVIEW_START);
  });
});
