import { expect, it } from "vitest";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import type { CaseEvent } from "@/features/cases/events";
import type { ReducedProject, Step } from "./types";
import { NO_FILTER, olderDoneCount, stepFilter, type StepFilter } from "./step-filter";

const seed: ReduceSeed = {
  cases: [], ideas: [], problems: [], routes: [], promiseDays: 5,
  projects: [{ id: "p", title: "Project", lead: "Lead", sources: [], authors: [], openedDay: 0, openedBy: "Lead" }],
};
const step = (id: string, patch: Partial<Step> = {}): Step => ({
  id, text: id, owner: "Same label", ownerUserId: "me", dueDay: 22, column: "todo", why: "", note: "",
  addedDay: 0, movedDay: 0, by: "Lead", startedDay: null, doneDay: null, external: null,
  checklist: [], comments: [], waitingOn: null, ...patch,
});
function project(): ReducedProject {
  const p = reduce(seed, { day: 22, events: [] }).projects[0];
  p.steps = [
    step("todo", { text: "Test the gateway", external: { system: "jira", key: "KAN-17" } }),
    step("blocked", { column: "blocked", startedDay: 1, waitingOn: { kind: "outside", name: "Supplier", userId: null } }),
    step("help", { column: "doing", startedDay: 1, ownerUserId: "other" }),
    step("answered", { column: "doing", ownerUserId: "other" }),
    step("no-wait", { column: "blocked", startedDay: 1 }),
    step("old", { column: "done", movedDay: 7, doneDay: 7, dueDay: 19 }),
    step("boundary", { column: "done", movedDay: 8, doneDay: 8, dueDay: 25 }),
    step("dropped", { dropped: { why: "Not needed", day: 10, byUserId: "me" }, dueDay: null }),
    step("unowned", { owner: "Same label", ownerUserId: null, dueDay: 20 }),
  ];
  p.helpAsks = [
    { id: "ask", stepId: "help", text: "Question", day: 20, byUserId: "me", toUserId: "sponsor", toRoleId: null, answeredDay: null },
    { id: "answered", stepId: "answered", text: "Question", day: 20, byUserId: "me", toUserId: "sponsor", toRoleId: null, answeredDay: 21 },
  ];
  return p;
}
const ids = (p: ReducedProject, filter: Partial<StepFilter>, me: string | null = "me", day = 22) => stepFilter(p, { ...NO_FILTER, ...filter }, { day, me }).map((s) => s.id);

it("STP filter: searches every step by text and key, including hidden older Done", () => {
  const p = project();
  expect(ids(p, { query: " GATEWAY " })).toEqual(["todo"]);
  expect(ids(p, { query: "kan-17" })).toEqual(["todo"]);
  expect(ids(p, { query: "old", hideOldDone: true })).toEqual(["old"]);
  expect(ids(p, { query: "unknown" })).toEqual([]);
});

it("STP filter: owner faces combine as a union and Only mine matches ids, never labels", () => {
  const p = project();
  expect(ids(p, { owners: ["other"] })).toEqual(["help", "answered"]);
  expect(ids(p, { owners: ["me", "other"] })).not.toContain("unowned");
  expect(ids(p, { owners: ["other"], mine: true })).toEqual([]);
  expect(ids(p, { mine: true })).not.toContain("help");
  expect(ids(p, { mine: true })).not.toContain("unowned");
  expect(ids(p, { mine: true }, null)).toEqual([]);
});

it("STP filter: waiting includes Blocked with waiting-on or an unanswered help ask", () => {
  const p = project();
  expect(ids(p, { waiting: true })).toEqual(["blocked", "help"]);
  p.steps[1].waitingOn = { kind: "nobody", userId: null, name: null };
  expect(ids(p, { waiting: true })).toEqual(["blocked", "help"]);
  p.steps[1].column = "doing";
  expect(ids(p, { waiting: true })).toEqual(["help"]);
});

it("STP filter: due this week uses the containing five-day week and excludes missing dates", () => {
  const p = project();
  p.steps = [19, 20, 21, 24, 25].map((dueDay) => step(String(dueDay), { dueDay }));
  p.steps.push(step("none", { dueDay: null }));
  expect(ids(p, { dueWeek: true })).toEqual(["20", "21", "24"]);
  expect(ids(p, { dueWeek: true }, "me", 25)).toEqual(["25"]);
});

it("STP filter: Not started excludes moves back to To do, including moves on the added day", () => {
  const p = project();
  p.steps = [step("untouched"), step("same-day"), step("returned", { movedDay: 1, startedDay: 0 }), step("doing", { column: "doing" })];
  p.history = [{ id: "move", ts: 0, type: "project.step.moved", target: "p", actor: "Lead", day: 0, payload: { stepId: "same-day", to: "todo" } } satisfies CaseEvent];
  expect(ids(p, { notStarted: true })).toEqual(["untouched"]);
});

it("STP filter: Dropped and all other filters combine without changing the project or totals", () => {
  const p = project();
  p.steps[1].dropped = { why: "Not needed", day: 22, byUserId: "me" };
  p.steps[1].text = "Gateway blocked";
  const before = structuredClone(p);
  expect(ids(p, { query: "gateway", owners: ["me"], mine: true, waiting: true, dueWeek: true, dropped: true })).toEqual(["blocked"]);
  expect(ids(p, { dropped: true, notStarted: true })).toEqual(["dropped"]);
  expect(p).toEqual(before);
  expect(stepFilter(p, NO_FILTER, { day: 22, me: "me" })).toEqual(p.steps);
});

it("STP filter: only the requested view hides Done older than 14 days, with an exact boundary", () => {
  const p = project();
  expect(olderDoneCount(p, 22)).toBe(1);
  expect(ids(p, { hideOldDone: true })).not.toContain("old");
  expect(ids(p, { hideOldDone: true })).toContain("boundary");
  expect(ids(p, {})).toContain("old");
  expect(ids(p, { hideOldDone: true }, "me", 21)).toContain("old");
  expect(p.steps).toHaveLength(9);
});
