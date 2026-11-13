// The Projects sidebar (features/projects/sidebar.ts): which projects layer 1 lists, and the editable
// list of pages in layer 2.
import { describe, expect, it } from "vitest";
import { IDEA_TABS, NO_PAGES, addPage, caseIdAt, daysLate, mayEditIdeaPages, movePage, pageList, projectIdAt, removePage, ringOf, sidebarIdeas, sidebarProjects, updatePage } from "@/features/projects/sidebar";
import type { ReducedProject } from "@/features/projects/types";

const proj = (number: number, status: ReducedProject["status"], overdue = false, title = "P" + number) =>
  ({ id: "p" + number, number, status, overdue, title, dueDay: overdue ? 10 : null }) as ReducedProject;

const keys = (s: Parameters<typeof pageList>[0]) => pageList(s).map((e) => (e.kind === "tab" ? e.key : e.page.id));

describe("projectIdAt", () => {
  it("finds one project's page, not the area's other pages", () => {
    expect(projectIdAt("/projects/abc")).toBe("abc");
    expect(projectIdAt("/projects/abc/")).toBe("abc");
    expect(projectIdAt("/projects")).toBeNull();
    expect(projectIdAt("/projects/collaboration")).toBeNull();
    expect(projectIdAt("/projects/progress")).toBeNull();
    expect(projectIdAt("/decisions")).toBeNull();
  });
});

describe("sidebarProjects", () => {
  it("puts late ones first, then running, measuring, planning, measured, and leaves stopped ones out", () => {
    const list = [proj(1, "planning"), proj(2, "measured"), proj(3, "running"), proj(4, "stopped"), proj(5, "measuring"), proj(6, "planning", true)];
    expect(sidebarProjects(list).map((p) => p.number)).toEqual([6, 3, 5, 1, 2]);
  });

  it("filters by title", () => {
    expect(sidebarProjects([proj(1, "running", false, "Line-stop alerts"), proj(2, "running", false, "Gloves")], "glo").map((p) => p.number)).toEqual([2]);
  });

  it("draws a recognised project as measured and counts late days", () => {
    expect(ringOf("recognised")).toBe("measured");
    expect(daysLate({ overdue: true, dueDay: 10 }, 12)).toBe(2);
    expect(daysLate({ overdue: false, dueDay: 10 }, 12)).toBe(0);
  });
});

describe("project pages", () => {
  it("starts with the standard pages (the seven tabs, Agent included)", () => {
    expect(keys(NO_PAGES)).toEqual(["overview", "board", "team", "results", "activity", "files", "agent"]);
  });

  it("adds a page at the end, renames it and keeps the old title when the new one is empty", () => {
    let s = addPage(NO_PAGES, "checklist", "c1", "Checklist");
    expect(keys(s).at(-1)).toBe("c1");
    expect(s.pages[0]).toMatchObject({ kind: "checklist", icon: "checklist", title: "Checklist" });
    s = updatePage(s, "c1", { title: "Pilot checklist" });
    s = updatePage(s, "c1", { title: "  " });
    expect(s.pages[0].title).toBe("Pilot checklist");
  });

  it("moves any page by dragging, standard ones too", () => {
    let s = addPage(NO_PAGES, "page", "x", "Supplier contacts");
    s = movePage(s, "x", "board");
    expect(keys(s)).toEqual(["overview", "x", "board", "team", "results", "activity", "files", "agent"]);
    s = movePage(s, "overview", null);
    expect(keys(s).at(-1)).toBe("overview");
  });

  it("deletes a custom page but never a standard one", () => {
    const s = addPage(NO_PAGES, "link", "l", "Jira");
    expect(keys(removePage(s, "l"))).not.toContain("l");
    expect(removePage(s, "board")).toBe(s);
  });
});

describe("ideas in the sidebar", () => {
  const row = (id: string, o: Partial<Parameters<typeof sidebarIdeas>[0][number]> = {}) =>
    ({ id, title: id, open: true, paused: false, overdue: false, talk: false, status: "waiting", archive: null, sortDay: 0, ...o });

  it("finds an idea's page", () => {
    expect(caseIdAt("/cases/c7")).toBe("c7");
    expect(caseIdAt("/cases")).toBeNull();
  });

  it("lists the open ones by stage: late first, then your move, then the newest", () => {
    const list = sidebarIdeas([
      row("old", { sortDay: 1 }), row("new", { sortDay: 5 }), row("mine", { sortDay: 0 }), row("late", { overdue: true }),
      row("talk", { talk: true, sortDay: 3 }), row("done", { open: false }), row("project", { archive: "project" }),
    ], (id) => id === "mine");
    expect(list.map((i) => i.id)).toEqual(["late", "mine", "new", "talk", "old"]);
    expect(list.find((i) => i.id === "talk")?.stage).toBe("decision");
    expect(list.find((i) => i.id === "new")?.stage).toBe("lead");
  });

  it("lets everyone added to an idea edit its pages, not a viewer", () => {
    const c = { fromUserId: "u1", discussion: { invitedUserIds: ["u2"] } };
    const who = (userId: string | null, o: { manager?: boolean; holdsDesk?: boolean } = {}) => ({ userId, manager: false, holdsDesk: false, ...o });
    expect(mayEditIdeaPages(c, who("u1"))).toBe(true);
    expect(mayEditIdeaPages(c, who("u2"))).toBe(true);
    expect(mayEditIdeaPages(c, who("u3", { holdsDesk: true }))).toBe(true);
    expect(mayEditIdeaPages(c, who("u4", { manager: true }))).toBe(true);
    expect(mayEditIdeaPages(c, who("u5"))).toBe(false);
    expect(mayEditIdeaPages(c, who(null))).toBe(false);
  });

  it("gives an idea Overview, Files and Chats, and adds pages after them", () => {
    const s = addPage(NO_PAGES, "page", "n", "Notes", IDEA_TABS);
    expect(pageList(s, IDEA_TABS).map((e) => (e.kind === "tab" ? e.key : e.page.id))).toEqual(["overview", "files", "chats", "n"]);
    expect(pageList(movePage(s, "n", "files", IDEA_TABS), IDEA_TABS).map((e) => (e.kind === "tab" ? e.key : e.page.id))).toEqual(["overview", "n", "files", "chats"]);
  });
});
