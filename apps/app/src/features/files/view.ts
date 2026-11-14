// How the Files page orders, searches and filters rows, and which steps a file is linked to (plan FIL, D7). Pure.
import { stepKey } from "@/features/projects/list-view";
import type { ReducedProject } from "@/features/projects/types";
import type { FileKind, FileRow } from "./items";

export type SortField = "name" | "changed" | "size";
export type FileFilter = "all" | "sheet" | "pdf" | "doc" | "image" | "linked";
export const FILE_FILTERS: readonly FileFilter[] = ["all", "sheet", "pdf", "doc", "image", "linked"];

const byName = (a: FileRow, b: FileRow) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" });

/** Folders first, then the field; `desc` flips the field, never the folders' place. Equal rows keep name order. */
export function sortRows(rows: readonly FileRow[], field: SortField, direction: "asc" | "desc" = "asc"): FileRow[] {
  const sign = direction === "asc" ? 1 : -1;
  const compare = (a: FileRow, b: FileRow): number => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    const by = field === "name" ? byName(a, b) : field === "size" ? a.size - b.size : Date.parse(a.modifiedAt || "0") - Date.parse(b.modifiedAt || "0");
    return by * sign || byName(a, b);
  };
  return [...rows].sort(compare);
}

export function searchRows(rows: readonly FileRow[], query: string): FileRow[] {
  const q = query.trim().toLowerCase();
  return q ? rows.filter((row) => row.name.toLowerCase().includes(q)) : [...rows];
}

/** The steps a file is linked to: the project.linked events with system sharepoint, a step, and the file's webUrl. */
export function linkedSteps(row: Pick<FileRow, "webUrl">, p: Pick<ReducedProject, "links" | "steps">): { stepId: string; key: string }[] {
  if (!row.webUrl) return [];
  const seen = new Set<string>();
  const out: { stepId: string; key: string }[] = [];
  for (const link of p.links) {
    if (link.system !== "sharepoint" || link.stepId === null || link.url !== row.webUrl || seen.has(link.stepId)) continue;
    const step = p.steps.find((s) => s.id === link.stepId);
    if (!step) continue;
    seen.add(link.stepId);
    out.push({ stepId: step.id, key: stepKey(step) });
  }
  return out;
}

const KIND_OF_FILTER: Partial<Record<FileFilter, FileKind>> = { sheet: "sheet", pdf: "pdf", doc: "doc", image: "image" };

/** A folder stays in every filter so the page can still be walked; "linked" keeps only the files with a step. */
export function filterRows(rows: readonly FileRow[], filter: FileFilter, p: Pick<ReducedProject, "links" | "steps">): FileRow[] {
  if (filter === "all") return [...rows];
  if (filter === "linked") return rows.filter((row) => row.isFolder || linkedSteps(row, p).length > 0);
  return rows.filter((row) => row.isFolder || row.kind === KIND_OF_FILTER[filter]);
}
