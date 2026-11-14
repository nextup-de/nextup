import { expect, it } from "vitest";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { DEFAULT_SORT, cellEdit, listRows, type ListColumn } from "./list-view";
import { NO_FILTER } from "./step-filter";
import type { Step } from "./types";

const seed: ReduceSeed = { cases: [], ideas: [], problems: [], routes: [], promiseDays: 5, projects: [{ id: "p", title: "Project", lead: "Lead", sources: [], authors: [], openedDay: 0, openedBy: "Lead" }] };
const step = (id: string, patch: Partial<Step> = {}): Step => ({ id, text: id, owner: null, ownerUserId: null, dueDay: null, column: "todo", why: "", note: "", addedDay: 0, movedDay: 0, by: "Lead", startedDay: null, doneDay: null, external: null, checklist: [], comments: [], waitingOn: null, ...patch });
const project = (steps: Step[]) => ({ ...reduce(seed, { day: 22, events: [] }).projects[0], steps });
const ctx = { day: 22, me: "me" };

it("STP list: sorts all six columns in both directions without changing priority order", () => {
  const fixtures: Record<ListColumn, [Partial<Step>, Partial<Step>]> = {
    key: [{ external: { system: "jira", key: "KAN-2" } }, { external: { system: "jira", key: "KAN-10" } }],
    step: [{ text: "Alpha" }, { text: "Beta" }],
    owner: [{ owner: "Alice", ownerUserId: "a" }, { owner: "Bob", ownerUserId: "b" }],
    status: [{ column: "todo" }, { column: "done" }],
    due: [{ dueDay: 20 }, { dueDay: 24 }],
    waitingOn: [{ waitingOn: { kind: "outside", name: "Alpha", userId: null } }, { waitingOn: { kind: "person", name: "Beta", userId: "b" } }],
  };
  for (const column of Object.keys(fixtures) as ListColumn[]) {
    const [a, b] = fixtures[column];
    const p = project([step("b", b), step("a", a)]);
    const before = structuredClone(p);
    expect(listRows(p, NO_FILTER, { column, direction: "asc" }, ctx).map((s) => s.id)).toEqual(["a", "b"]);
    expect(listRows(p, NO_FILTER, { column, direction: "desc" }, ctx).map((s) => s.id)).toEqual(["b", "a"]);
    expect(p).toEqual(before);
  }
});

it("STP list: default puts late first, then blocked, then due day, with completed and dropped work never late", () => {
  const p = project([step("no-date"), step("due", { dueDay: 22 }), step("blocked", { column: "blocked", dueDay: 26 }), step("late", { dueDay: 21 }), step("earliest", { dueDay: 19 }), step("late-blocked", { dueDay: 21, column: "blocked" }), step("done", { column: "done", dueDay: 1 }), step("dropped", { dropped: { why: "No longer needed", day: 10, byUserId: "me" }, dueDay: 2 })]);
  expect(listRows(p, NO_FILTER, DEFAULT_SORT, ctx).map((s) => s.id)).toEqual(["late-blocked", "earliest", "late", "blocked", "done", "dropped", "due", "no-date"]);
});

it("STP list: missing values and ties sort deterministically, with every status in workflow order", () => {
  const p = project([step("b"), step("a"), step("c", { dueDay: 24 }), step("d", { dueDay: 20 })]);
  expect(listRows(p, NO_FILTER, { column: "due", direction: "asc" }, ctx).map((s) => s.id)).toEqual(["d", "c", "a", "b"]);
  expect(listRows(p, NO_FILTER, { column: "due", direction: "desc" }, ctx).map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
  const statuses = project(["done", "blocked", "doing", "todo"].map((column) => step(column, { column: column as Step["column"] })));
  expect(listRows(statuses, NO_FILTER, { column: "status", direction: "asc" }, ctx).map((s) => s.id)).toEqual(["todo", "doing", "blocked", "done"]);
});

it("STP list: combines shared filters by ids and keeps older Done visible", () => {
  const p = project([step("mine", { text: "Gateway", ownerUserId: "me", dueDay: 22 }), step("other", { text: "Gateway", ownerUserId: "other", dueDay: 22 }), step("old", { column: "done", movedDay: 0 })]);
  expect(listRows(p, { ...NO_FILTER, query: "gateway", mine: true, dueWeek: true }, DEFAULT_SORT, ctx).map((s) => s.id)).toEqual(["mine"]);
  expect(listRows(p, { ...NO_FILTER, hideOldDone: true }, DEFAULT_SORT, ctx).map((s) => s.id)).toContain("old");
});

it("STP list: cell edits map status to moved and owner and due to edited, including clearing", () => {
  const s = step("s");
  for (const to of ["todo", "doing", "blocked", "done"] as const) expect(cellEdit(s, "status", to)).toEqual({ type: "project.step.moved", payload: { stepId: "s", to } });
  expect(cellEdit(s, "owner", { userId: "user-1", name: "Same label" })).toEqual({ type: "project.step.edited", payload: { stepId: "s", owner: "Same label", ownerUserId: "user-1" } });
  expect(cellEdit(s, "owner", null)).toEqual({ type: "project.step.edited", payload: { stepId: "s", owner: "", ownerUserId: null } });
  expect(cellEdit(s, "due", 0)).toEqual({ type: "project.step.edited", payload: { stepId: "s", dueDay: 0 } });
  expect(cellEdit(s, "due", null)).toEqual({ type: "project.step.edited", payload: { stepId: "s", dueDay: null } });
});

it("STP list: waiting-on sorting includes open help requests and ignores answered requests", () => {
  const p = project([step("outside", { waitingOn: { kind: "outside", name: "Beta", userId: null } }), step("ask"), step("answered")]);
  p.helpAsks = [
    { id: "open", stepId: "ask", text: "Alpha", day: 20, byUserId: "me", toUserId: null, toRoleId: null, answeredDay: null },
    { id: "closed", stepId: "answered", text: "Zulu", day: 20, byUserId: "me", toUserId: null, toRoleId: null, answeredDay: 21 },
  ];
  expect(listRows(p, NO_FILTER, { column: "waitingOn", direction: "asc" }, ctx).map((s) => s.id)).toEqual(["answered", "ask", "outside"]);
  expect(listRows(p, { ...NO_FILTER, waiting: true }, { column: "waitingOn", direction: "desc" }, ctx).map((s) => s.id)).toEqual(["ask"]);
});

it("STP list: Not started and Dropped remain distinct filters and never change project totals", () => {
  const p = project([step("fresh"), step("returned", { startedDay: 10 }), step("dropped", { column: "doing", dropped: { why: "Replaced", day: 20, byUserId: "me" } })]);
  const before = structuredClone(p);
  expect(listRows(p, { ...NO_FILTER, notStarted: true }, DEFAULT_SORT, ctx).map((s) => s.id)).toEqual(["fresh"]);
  expect(listRows(p, { ...NO_FILTER, dropped: true }, DEFAULT_SORT, ctx).map((s) => s.id)).toEqual(["dropped"]);
  expect(listRows(p, { ...NO_FILTER, dropped: true, notStarted: true }, DEFAULT_SORT, ctx)).toEqual([]);
  expect(p).toEqual(before);
});
