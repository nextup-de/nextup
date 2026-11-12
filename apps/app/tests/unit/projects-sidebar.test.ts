// The Projects sidebar (features/projects/sidebar.ts): which projects layer 1 lists, and the editable
// list of pages in layer 2.
import { describe, expect, it } from "vitest";
import { NO_PAGES, addPage, daysLate, movePage, pageList, projectIdAt, removePage, ringOf, sidebarProjects, updatePage } from "@/features/projects/sidebar";
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
  it("starts with the six standard pages", () => {
    expect(keys(NO_PAGES)).toEqual(["overview", "board", "team", "results", "activity", "files"]);
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
    expect(keys(s)).toEqual(["overview", "x", "board", "team", "results", "activity", "files"]);
    s = movePage(s, "overview", null);
    expect(keys(s).at(-1)).toBe("overview");
  });

  it("deletes a custom page but never a standard one", () => {
    const s = addPage(NO_PAGES, "link", "l", "Jira");
    expect(keys(removePage(s, "l"))).not.toContain("l");
    expect(removePage(s, "board")).toBe(s);
  });
});
