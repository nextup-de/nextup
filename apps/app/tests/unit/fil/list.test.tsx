import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { BreadcrumbTrail, trailOf } from "@/components/projects/files/Breadcrumb";
import { FileGrid } from "@/components/projects/files/FileGrid";
import { changedText, FileList, formatSize } from "@/components/projects/files/FileList";
import { FileToolbar } from "@/components/projects/files/FileToolbar";
import type { FilesActions, FilesPartProps, FilesState } from "@/components/projects/files/types";
import { listDemoFolder, resetDemoFiles } from "@/features/demo/files-demo";
import type { FileRow } from "@/features/files/items";
import { filterRows, searchRows, sortRows } from "@/features/files/view";
import type { ReducedProject } from "@/features/projects/types";
import { I18nProvider } from "@/i18n/client";

const FOLDER_URL = "https://acme.sharepoint.com/sites/purchasing/Shared%20Documents/Supplier%20data";
const p = {
  links: [
    { system: "sharepoint", url: FOLDER_URL, key: "", stepId: null, day: 0 },
    { system: "sharepoint", url: "https://acme.sharepoint.com/sites/purchasing/Shared%20Documents/Supplier%20data/Supplier%20scorecard.xlsx", key: "", stepId: "s1", day: 1 },
  ],
  steps: [{ id: "s1", text: "Rate suppliers", external: { system: "jira", key: "KAN-13" } }],
} as unknown as ReducedProject;
const demoRows = (path = ""): FileRow[] => { const a = listDemoFolder(path); return a.state === "ok" ? a.rows : []; };
const noop = () => {};
const actions: FilesActions = { open: noop, goTo: noop, select: noop, setView: noop, setQuery: noop, setFilter: noop, setSort: noop, showMore: noop, reload: noop, openDialog: noop, closeDialog: noop };
const stateOf = (patch: Partial<FilesState> = {}): FilesState => {
  const loaded = patch.loaded ?? demoRows();
  const base: FilesState = { p, folder: p.links[0], path: [], answer: { state: "ok", rows: loaded, next: null }, loaded, rows: sortRows(loaded, "name"), next: null, selected: null, view: "list", query: "", filter: "all", sort: { field: "name", direction: "asc" }, dialog: null, busy: false, editor: true };
  return { ...base, ...patch };
};
const render = (Part: (props: FilesPartProps) => React.ReactNode, state: FilesState, locale: "en" | "de" = "en") => renderToStaticMarkup(h(I18nProvider, { locale, children: h(Part as never, { state, actions }) }));

beforeEach(resetDemoFiles);

describe("FIL list", () => {
  it("FIL list: the list shows the folder first, then the files with kind, step chip, changed by and size", () => {
    const html = render(FileList, stateOf());
    expect(html.indexOf("Delivery reports Q3")).toBeLessThan(html.indexOf("Delivery times by line.xlsx"));
    for (const head of ["Name", "Linked to", "Changed", "Size"]) expect(html).toContain(head);
    expect(html).toContain("Folder · 3 files");
    expect(html).toContain("Excel");
    expect(html).toContain("KAN-13");
    expect(html).toContain("L. Brandt");
    expect(html).toContain("48 KB");
    expect(html).toContain("3.1 MB");
    expect(html).toContain('aria-label="Actions for Kickoff deck.pptx"');
    expect((html.match(/<tr/g) ?? []).length).toBe(1 + 8);
  });

  it("FIL list: a selected row is marked, an empty filter says so, and Show more appears only with a next link", () => {
    const rows = demoRows();
    expect(render(FileList, stateOf({ selected: rows[1] }))).toContain("data-selected");
    expect(render(FileList, stateOf())).not.toContain("data-selected");
    expect(render(FileList, stateOf({ rows: [] }))).toContain("No files match.");
    expect(render(FileList, stateOf())).not.toContain("Show more");
    expect(render(FileList, stateOf({ next: "https://graph.microsoft.com/v1.0/next" }))).toContain("Show more");
  });

  it("FIL list: the grid shows the same rows as tiles, folders in their own strip", () => {
    const html = render(FileGrid, stateOf({ view: "grid" }));
    expect(html).toContain("Folders");
    expect(html).toContain("Files");
    expect(html).toContain('data-kind="folder"');
    expect(html).toContain('width="84"');
    for (const row of demoRows()) expect(html).toContain(row.name);
    expect(html).toContain("KAN-13");
    expect(render(FileGrid, stateOf({ view: "grid", next: "https://graph.microsoft.com/v1.0/n" }))).toContain("Show more");
  });

  it("FIL list: the breadcrumb names the shared folder's path, grows inside a subfolder and offers the way back", () => {
    expect(trailOf(FOLDER_URL)).toEqual(["Shared Documents", "Supplier data"]);
    expect(trailOf("not a url")).toEqual([]);
    const root = render(BreadcrumbTrail, stateOf());
    expect(root).toContain("Shared Documents");
    expect(root).toMatch(/<strong aria-current="page">Supplier data<\/strong>/);
    expect(root).not.toContain("<button");
    const inside = render(BreadcrumbTrail, stateOf({ path: ["Delivery reports Q3"] }));
    expect(inside).toMatch(/<button[^>]*>Supplier data<\/button>/);
    expect(inside).toMatch(/<strong aria-current="page">Delivery reports Q3<\/strong>/);
    expect(inside).not.toContain("Shared Documents");
  });

  it("FIL list: the toolbar has the search, the filter menu button, the view toggle and names an active filter", () => {
    const html = render(FileToolbar, stateOf());
    expect(html).toContain('placeholder="Search in this folder"');
    expect(html).toContain("All files");
    expect(html).toContain('aria-label="List"');
    expect(html).toContain('aria-label="Grid"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("Clear filter");
    const filtered = render(FileToolbar, stateOf({ filter: "pdf" }));
    expect(filtered).toContain("PDF");
    expect(filtered).toContain('aria-label="Clear filter"');
    expect(render(FileToolbar, stateOf(), "de")).toContain("In diesem Ordner suchen");
  });

  it("FIL list: search, filter and sort narrow the demo rows as the page needs", () => {
    const rows = demoRows();
    expect(searchRows(rows, "scorecard").map((r) => r.name)).toEqual(["Supplier scorecard.xlsx"]);
    expect(filterRows(rows, "pdf", p).map((r) => r.name)).toEqual(["Delivery reports Q3", "Framework agreement.pdf"]);
    expect(filterRows(rows, "linked", p).map((r) => r.name)).toEqual(["Delivery reports Q3", "Supplier scorecard.xlsx"]);
    expect(sortRows(rows, "size", "desc")[1].name).toBe("Kickoff deck.pptx");
  });

  it("FIL list: sizes and changed-by texts read like the frames", () => {
    expect(formatSize(0, true)).toBe("—");
    expect(formatSize(812)).toBe("812 B");
    expect(formatSize(240_000)).toBe("240 KB");
    expect(formatSize(1_200_000)).toBe("1.2 MB");
    expect(formatSize(3_000_000)).toBe("3 MB");
    const row = { modifiedBy: "L. Brandt", modifiedAt: "2026-11-12T10:00:00Z" } as FileRow;
    const now = Date.parse("2026-11-14T12:00:00Z");
    expect(changedText(row, "en", now, "today")).toBe("L. Brandt · 2 days");
    expect(changedText({ ...row, modifiedAt: "2026-11-14T08:00:00Z" }, "en", now, "today")).toBe("L. Brandt · today");
    expect(changedText({ ...row, modifiedAt: "2026-10-10T10:00:00Z" }, "en", now, "today")).toBe("L. Brandt · 10 Oct");
    expect(changedText({ ...row, modifiedAt: "" }, "en", now, "today")).toBe("L. Brandt");
  });
});
