// The static demo's SharePoint folder (plan FIL, D11): no database, no Graph. A tree shaped like the Paper frames
// (Shared documents › Supplier data, with the subfolder Delivery reports Q3 and seven files) answering with the
// same shapes as server/files. Uploads, deletes and requests change it in memory only; a reload starts again.
import { extOf, kindOf, type FileRow, type FolderAnswer, type VersionsAnswer } from "@/features/files/items";

/** Where the demo folder sits: the breadcrumb above the project's own folder. */
export const DEMO_TRAIL = ["Shared documents", "Supplier data"] as const;
const BASE = "https://acme.sharepoint.com/sites/purchasing/Shared%20Documents/Supplier%20data";

/**
 * The demo folder as a project's own (the payload of project.linked, D4). The folder job links every real project to its
 * idea's folder at the yes (server/files/auto-folder.ts); it never sees a project that lives in the browser, so the sample
 * data links this one instead.
 */
export const DEMO_FOLDER = { system: "sharepoint", url: BASE } as const;

const file = (path: string, name: string, size: number, modifiedBy: string, modifiedAt: string, createdBy = modifiedBy): FileRow => ({
  id: `demo-${path ? path + "/" : ""}${name}`, name, kind: kindOf(name), ext: extOf(name), size, isFolder: false, childCount: 0,
  modifiedBy, modifiedAt, createdBy, createdAt: modifiedAt, webUrl: `${BASE}/${path ? path.split("/").map(encodeURIComponent).join("/") + "/" : ""}${encodeURIComponent(name)}`, parentPath: path,
});
const folder = (name: string, childCount: number, modifiedBy: string, modifiedAt: string): FileRow => ({
  id: `demo-${name}`, name, kind: "folder", ext: "", size: 0, isFolder: true, childCount, modifiedBy, modifiedAt, createdBy: modifiedBy, createdAt: modifiedAt, webUrl: `${BASE}/${encodeURIComponent(name)}`, parentPath: "",
});

const SEED: Record<string, FileRow[]> = {
  "": [
    folder("Delivery reports Q3", 3, "L. Brandt", "2026-11-06T09:30:00Z"),
    file("", "Supplier scorecard.xlsx", 48_211, "L. Brandt", "2026-11-05T14:10:00Z", "H. Sander"),
    file("", "Delivery times by line.xlsx", 31_850, "H. Sander", "2026-11-04T08:45:00Z"),
    file("", "Framework agreement.pdf", 912_004, "T. Vogel", "2026-10-28T16:20:00Z"),
    file("", "Escalation contacts.docx", 20_311, "H. Sander", "2026-10-27T11:05:00Z"),
    file("", "Kickoff deck.pptx", 3_100_200, "T. Vogel", "2026-10-20T10:00:00Z"),
    file("", "Line 3 delivery bay.png", 440_120, "L. Brandt", "2026-10-19T13:30:00Z"),
    file("", "Open questions.docx", 18_442, "L. Brandt", "2026-11-02T17:15:00Z"),
  ],
  "Delivery reports Q3": [
    file("Delivery reports Q3", "July.xlsx", 22_100, "L. Brandt", "2026-08-02T08:00:00Z"),
    file("Delivery reports Q3", "August.xlsx", 23_480, "L. Brandt", "2026-09-02T08:00:00Z"),
    file("Delivery reports Q3", "September.xlsx", 24_020, "L. Brandt", "2026-10-02T08:00:00Z"),
  ],
};

const clone = (rows: Record<string, FileRow[]>) => Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
let tree = clone(SEED);

const clean = (path: string) => path.split("/").filter(Boolean).join("/");

/** The folder's items in the shapes server/files answers with: ok, empty, or no-access for a folder that is not there. */
export function listDemoFolder(path: string): FolderAnswer {
  const rows = tree[clean(path)];
  if (!rows) return { state: "no-access" };
  return rows.length ? { state: "ok", rows: rows.map((r) => ({ ...r })), next: null } : { state: "empty" };
}

/** A demo file's versions: each was written once, so the history holds the version there is. */
export function demoVersions(id: string): VersionsAnswer {
  const row = Object.values(tree).flat().find((r) => r.id === id && !r.isFolder);
  return row ? { state: "ok", versions: [{ id: "1.0", modifiedAt: row.modifiedAt, modifiedBy: row.modifiedBy, size: row.size }] } : { state: "no-access" };
}

/** A file put into a folder (memory only). Returns the new row, or null when the folder is not there. */
export function addDemoFile(path: string, input: { name: string; size: number; by: string; at?: string }): FileRow | null {
  const key = clean(path);
  const rows = tree[key];
  if (!rows) return null;
  const row = file(key, input.name, input.size, input.by, input.at ?? new Date().toISOString());
  const taken = rows.some((r) => r.id === row.id);
  tree = { ...tree, [key]: taken ? rows.map((r) => (r.id === row.id ? row : r)) : [row, ...rows] };
  return row;
}

/** A file or an empty folder removed (memory only); a folder with items stays. */
export function removeDemoItem(path: string, id: string): boolean {
  const key = clean(path);
  const rows = tree[key];
  const item = rows?.find((r) => r.id === id);
  if (!rows || !item || (item.isFolder && (tree[item.name]?.length ?? 0) > 0)) return false;
  tree = { ...tree, [key]: rows.filter((r) => r.id !== id) };
  if (item.isFolder) delete tree[item.name];
  return true;
}

/** Back to the seeded tree (a demo reset, and the tests). */
export function resetDemoFiles(): void { tree = clone(SEED); }
