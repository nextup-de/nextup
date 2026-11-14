import { expect, it } from "vitest";
import { kindOf, rowOf } from "./items";
import { folderOf, projectFolder } from "./link";
import { filterRows, linkedSteps, searchRows, sortRows } from "./view";
import type { FileRow } from "./items";
import type { Link, Step } from "@/features/projects/types";

const link = (patch: Partial<Link>): Link => ({ system: "sharepoint", url: "https://t.sharepoint.com/sites/a/Shared%20Documents/Supplier", key: "", stepId: null, day: 0, ...patch });
const row = (name: string, patch: Partial<FileRow> = {}): FileRow => ({ id: name, name, kind: kindOf(name), ext: name.split(".").pop() ?? "", size: 1, isFolder: false, childCount: 0, modifiedBy: "A", modifiedAt: "2026-11-01T10:00:00Z", createdBy: "A", createdAt: "2026-10-01T10:00:00Z", webUrl: "https://t.sharepoint.com/" + name, parentPath: "", ...patch });
const step = (id: string, patch: Partial<Step> = {}) => ({ id, text: id, external: null, ...patch }) as Step;

it("FIL files model: a SharePoint or OneDrive link becomes a share id, anything else none", () => {
  const url = "https://t.sharepoint.com/sites/a/Shared%20Documents/Supplier?e=1";
  const id = folderOf(url)!;
  expect(id.startsWith("u!")).toBe(true);
  expect(id).not.toMatch(/[+/=]/);
  expect(Buffer.from(id.slice(2).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()).toBe(new URL(url).toString());
  expect(folderOf("https://onedrive.live.com/?id=1")).not.toBeNull();
  expect(folderOf("http://t.sharepoint.com/x")).toBeNull();
  expect(folderOf("https://evil.example/sharepoint.com")).toBeNull();
  expect(folderOf("https://notsharepoint.com/x")).toBeNull();
  expect(folderOf("not a url")).toBeNull();
});

it("FIL files model: the project's folder is its newest sharepoint link without a step", () => {
  const older = link({ url: "https://t.sharepoint.com/old" }), newer = link({ url: "https://t.sharepoint.com/new", day: 3 });
  expect(projectFolder({ links: [older, newer] })).toBe(newer);
  expect(projectFolder({ links: [older, link({ stepId: "s1", url: "https://t.sharepoint.com/file" })] })).toBe(older);
  expect(projectFolder({ links: [link({ system: "jira" }), link({ system: "teams" })] })).toBeNull();
  expect(projectFolder({ links: [] })).toBeNull();
});

it("FIL files model: a driveItem becomes a row with kind, size and who changed it", () => {
  expect(rowOf({
    id: "i1", name: "Delivery Q3.XLSX", size: 20480, webUrl: "https://t/x", file: { mimeType: "x" },
    lastModifiedBy: { user: { displayName: "L. Brandt" } }, lastModifiedDateTime: "2026-11-02T08:00:00Z",
    createdBy: { user: { displayName: "H. Sander" } }, createdDateTime: "2026-10-01T08:00:00Z",
    parentReference: { path: "/drives/b!x/root:/Supplier data" },
  })).toEqual({ id: "i1", name: "Delivery Q3.XLSX", kind: "sheet", ext: "xlsx", size: 20480, isFolder: false, childCount: 0, modifiedBy: "L. Brandt", modifiedAt: "2026-11-02T08:00:00Z", createdBy: "H. Sander", createdAt: "2026-10-01T08:00:00Z", webUrl: "https://t/x", parentPath: "Supplier data" });
  expect(rowOf({ id: "f", name: "Reports", folder: { childCount: 4 }, parentReference: { path: "/drives/b!x/root:" } })).toMatchObject({ kind: "folder", isFolder: true, childCount: 4, ext: "", parentPath: "", modifiedBy: "" });
  expect(rowOf({ name: "no id" })).toBeNull();
  expect(rowOf(null)).toBeNull();
  for (const [name, kind] of [["a.pdf", "pdf"], ["a.docx", "doc"], ["a.pptx", "slides"], ["a.PNG", "image"], ["a.zip", "other"], ["noext", "other"], [".hidden", "other"]] as const) expect(kindOf(name)).toBe(kind);
});

it("FIL files model: rows sort with folders first, search by name and filter by kind or step", () => {
  const rows = [row("b.pdf", { size: 5, modifiedAt: "2026-11-03T00:00:00Z" }), row("Folder", { isFolder: true, kind: "folder" }), row("a.xlsx", { size: 9, modifiedAt: "2026-11-01T00:00:00Z" }), row("c10.docx"), row("c2.docx")];
  expect(sortRows(rows, "name").map((r) => r.name)).toEqual(["Folder", "a.xlsx", "b.pdf", "c2.docx", "c10.docx"]);
  expect(sortRows(rows, "name", "desc").map((r) => r.name)).toEqual(["Folder", "c10.docx", "c2.docx", "b.pdf", "a.xlsx"]);
  expect(sortRows(rows, "size", "desc").slice(0, 3).map((r) => r.name)).toEqual(["Folder", "a.xlsx", "b.pdf"]);
  expect(sortRows(rows, "changed", "desc").slice(1, 3).map((r) => r.name)).toEqual(["b.pdf", "c2.docx"]);
  expect(searchRows(rows, " PDF ").map((r) => r.name)).toEqual(["b.pdf"]);
  expect(searchRows(rows, "")).toHaveLength(5);

  const p = { steps: [step("s1", { external: { system: "jira", key: "KAN-7" } }), step("s2")], links: [link({ stepId: "s1", url: "https://t.sharepoint.com/a.xlsx" }), link({ stepId: "s2", url: "https://t.sharepoint.com/a.xlsx" }), link({ stepId: "s1", url: "https://t.sharepoint.com/a.xlsx" }), link({ system: "jira", stepId: "s2", url: "https://t.sharepoint.com/b.pdf" })] };
  expect(filterRows(rows, "all", p)).toHaveLength(5);
  expect(filterRows(rows, "pdf", p).map((r) => r.name)).toEqual(["b.pdf", "Folder"]);
  expect(filterRows(rows, "sheet", p).map((r) => r.name)).toEqual(["Folder", "a.xlsx"]);
  expect(linkedSteps(row("a.xlsx"), p)).toEqual([{ stepId: "s1", key: "KAN-7" }, { stepId: "s2", key: "s2" }]);
  expect(filterRows(rows, "linked", p).map((r) => r.name)).toEqual(["Folder", "a.xlsx"]);
  expect(linkedSteps(row("b.pdf"), p)).toEqual([]);
});
