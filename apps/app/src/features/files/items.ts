// What the Files page knows about a file or folder, read from a Graph driveItem (plan FIL). Pure.
export type FileKind = "sheet" | "pdf" | "doc" | "slides" | "image" | "folder" | "other";

export type FileRow = {
  id: string;
  name: string;
  kind: FileKind;
  /** Lower-case extension without the dot; "" for a folder or a name without one. */
  ext: string;
  size: number;
  isFolder: boolean;
  childCount: number;
  modifiedBy: string;
  modifiedAt: string;
  createdBy: string;
  createdAt: string;
  webUrl: string;
  /** The folder it sits in, relative to the drive root ("" at the root). */
  parentPath: string;
};

/** D6: what reading a folder can answer. Reading never throws. */
export type FolderAnswer =
  | { state: "ok"; rows: FileRow[]; next: string | null }
  | { state: "empty" }
  | { state: "not-connected" }
  | { state: "no-access" }
  | { state: "offline" };

export type FileVersion = { id: string; modifiedAt: string; modifiedBy: string; size: number };
export type VersionsAnswer = { state: "ok"; versions: FileVersion[] } | { state: "not-connected" | "no-access" | "offline" };

const KINDS: Record<string, FileKind> = {
  xls: "sheet", xlsx: "sheet", xlsm: "sheet", csv: "sheet", ods: "sheet",
  pdf: "pdf",
  doc: "doc", docx: "doc", odt: "doc", rtf: "doc", txt: "doc", md: "doc",
  ppt: "slides", pptx: "slides", odp: "slides",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image", heic: "image",
};

export function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : "";
}

/** The kind of a file by its name; a folder is told apart by the caller. */
export const kindOf = (name: string): FileKind => KINDS[extOf(name)] ?? "other";

const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === "string" ? v : "");
const whole = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
const person = (v: unknown): string => (record(v) && record(v.user) ? text(v.user.displayName) : "");

/** The path of a driveItem's folder relative to the drive root: Graph says "/drives/<id>/root:/Supplier data". */
function parentOf(ref: unknown): string {
  const path = record(ref) ? text(ref.path) : "";
  const at = path.indexOf("root:");
  return at < 0 ? "" : path.slice(at + 5).replace(/^\/+|\/+$/g, "");
}

/** One FileRow from a Graph driveItem, or null for an answer that has no id or name. */
export function rowOf(item: unknown): FileRow | null {
  if (!record(item)) return null;
  const id = text(item.id), name = text(item.name);
  if (!id || !name) return null;
  const isFolder = record(item.folder);
  return {
    id, name,
    kind: isFolder ? "folder" : kindOf(name),
    ext: isFolder ? "" : extOf(name),
    size: whole(item.size),
    isFolder,
    childCount: isFolder ? whole((item.folder as Record<string, unknown>).childCount) : 0,
    modifiedBy: person(item.lastModifiedBy),
    modifiedAt: text(item.lastModifiedDateTime),
    createdBy: person(item.createdBy),
    createdAt: text(item.createdDateTime),
    webUrl: text(item.webUrl),
    parentPath: parentOf(item.parentReference),
  };
}
