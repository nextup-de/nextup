// The Projects Overview as one list (features/overview/items.ts): ideas and projects as items, their status chip, the
// pills, the search and the sort.
import { describe, expect, it } from "vitest";
import type { ReducedCase } from "@/features/cases/reducer";
import type { DeskLabel } from "@/features/overview/rows";
import {
  deskStats, ideaItem, listedIdea, listedProject, projectItem, searchItems, showCounts, showItems, sortItems, urgency, type OverviewItem,
} from "@/features/overview/items";
import type { ReducedProject, Step } from "@/features/projects/types";

const DAY = 20;
const desk = (role: string | null, names: string[] = [], escalation: string | null = null): DeskLabel => ({ role, names, more: 0, escalation });

const idea = (id: string, extra: Partial<ReducedCase> = {}) => ({
  id, title: "Idea " + id, from: "S. Dahl", fromDept: "Production, 4-series", raisedDay: 16, dueDay: 24, overdue: false,
  status: "open", open: true, archived: false, withdrawn: null, history: [{ day: 16 }, { day: 19 }], ...extra,
}) as unknown as ReducedCase;

const step = (column: Step["column"]) => ({ column, dropped: false }) as unknown as Step;

const project = (number: number, extra: Partial<ReducedProject> = {}) => ({
  id: "p" + number, number, title: "Project " + number, status: "running", lead: "D. Ferraro", leadUserId: "u-df",
  steps: [step("done"), step("doing"), step("todo")], baseline: null, checks: [], rewardDue: false, verdict: null,
  dueDay: null, overdue: false, escalated: null, openedDay: 2, history: [{ day: 2 }, { day: 18 }], ...extra,
}) as unknown as ReducedProject;

describe("ideaItem", () => {
  it("says past promise, days left or your move", () => {
    expect(ideaItem(idea("a", { overdue: true, dueDay: 16 }), DAY, desk("Team lead", ["T. Vogel"]), false).status).toEqual({ what: "pastPromise", n: 4 });
    expect(ideaItem(idea("b", { dueDay: 21 }), DAY, desk("Team lead"), false).status).toEqual({ what: "daysLeft", n: 1 });
    expect(ideaItem(idea("c"), DAY, desk("Team lead"), true).status).toEqual({ what: "yourMove" });
  });

  it("puts it on the role it moved up to, with the first holder, and takes the last change as updated", () => {
    const i = ideaItem(idea("a"), DAY, desk("Team lead", ["T. Vogel", "K. Lenz"], "Engineering"), false);
    expect(i.stage).toEqual({ kind: "desk", role: "Engineering", movedUp: true });
    expect(i.desk.name).toBe("T. Vogel");
    expect(i.updatedDay).toBe(19);
    expect(i.path).toBe("/idea?id=a");
  });
});

describe("projectItem", () => {
  it("counts the board and opens on the project's page", () => {
    const i = projectItem(project(2), DAY, null);
    expect(i.key).toBe("P-2");
    expect(i.stage).toEqual({ kind: "project", status: "running", done: 1, total: 3, blocked: 0 });
    expect(i.path).toBe("/projects/p2");
  });

  it("is your move when you lead it and a move is open; blocked before late; recognised and verdicts after", () => {
    expect(projectItem(project(5, { leadUserId: "me" }), DAY, "me").status.what).toBe("yourMove");
    expect(projectItem(project(2, { steps: [step("blocked"), step("todo")], overdue: true, dueDay: 18 }), DAY, "me").status).toEqual({ what: "blocked", n: 1 });
    expect(projectItem(project(4, { status: "planning", overdue: true, dueDay: 17 }), DAY, null).status).toEqual({ what: "late", n: 3 });
    expect(projectItem(project(1, { status: "recognised" }), DAY, null).status.what).toBe("recognised");
    expect(projectItem(project(3, { status: "measuring", verdict: "better" }), DAY, null).status).toEqual({ what: "verdict", verdict: "better" });
  });

  it("puts a late move on the desk it went up to", () => {
    const i = projectItem(project(6, { escalated: { to: "Plant manager" } as ReducedProject["escalated"] }), DAY, "u-df");
    expect(i.desk).toEqual({ name: "Plant manager", userId: null, you: false });
  });
});

describe("what the page lists", () => {
  it("lists ideas still moving and every project but a stopped one", () => {
    expect(listedIdea(idea("a"))).toBe(true);
    expect(listedIdea(idea("b", { archived: true }))).toBe(false);
    expect(listedIdea(idea("c", { open: false, status: "asked" }))).toBe(true);
    expect(listedProject(project(1, { status: "stopped" }))).toBe(false);
    expect(listedProject(project(1, { status: "recognised" }))).toBe(true);
  });
});

describe("pills, search and sort", () => {
  const items: OverviewItem[] = [
    ideaItem(idea("late", { overdue: true, dueDay: 12, title: "Rework on the housing" }), DAY, desk("Team lead", ["T. Vogel"]), false),
    ideaItem(idea("soon", { dueDay: 21, title: "Night shift parts order", fromDept: "Line 3" }), DAY, desk("Team lead", ["T. Vogel"]), false),
    ideaItem(idea("later", { dueDay: 24, title: "Changeover sheet" }), DAY, desk("Team lead", ["T. Vogel"]), false),
    projectItem(project(5, { leadUserId: "me", title: "Tool cart on line 3" }), DAY, "me"),
    projectItem(project(1, { status: "recognised", title: "Bundle new-hire access", history: [{ day: 1 }] as ReducedProject["history"] }), DAY, "me"),
  ];

  it("counts and filters by pill", () => {
    expect(showCounts(items)).toEqual({ all: 5, ideas: 3, projects: 2, move: 1 });
    expect(showItems(items, "move").map((i) => i.id)).toEqual(["p5"]);
  });

  it("searches every word across title, key, area and desk", () => {
    expect(searchItems(items, "line 3").map((i) => i.id)).toEqual(["soon", "p5"]);
    expect(searchItems(items, "p-1").map((i) => i.id)).toEqual(["p1"]);
    expect(searchItems(items, "vogel housing").map((i) => i.id)).toEqual(["late"]);
    expect(searchItems(items, "  ")).toHaveLength(5);
  });

  it("puts what needs you first: your move, late, a day left, then the rest", () => {
    expect(sortItems(items, "needs").map((i) => i.id)).toEqual(["p5", "late", "soon", "later", "p1"]);
    expect(urgency(items[2])).toBe(3);
  });

  it("sorts by a column, newest or oldest first", () => {
    expect(sortItems(items, "updated").at(-1)?.id).toBe("p1");
    expect(sortItems(items, "updated", "oldest")[0].id).toBe("p1");
    expect(sortItems(items, "name").map((i) => i.title)[0]).toBe("Bundle new-hire access");
    expect(sortItems(items, "stage").map((i) => i.kind)).toEqual(["idea", "idea", "idea", "project", "project"]);
  });

  it("counts a person's desk for the person card", () => {
    expect(deskStats(items, "T. Vogel")).toEqual({ held: 3, late: 1 });
  });
});
