// What FilesView holds and hands to its parts, so that FIL-A1 to A3 and FIL-B1 to B3 fill their stub without editing FilesView.
import type { FileRow, FolderAnswer } from "@/features/files/items";
import type { FileFilter, SortField } from "@/features/files/view";
import type { Link, ReducedProject } from "@/features/projects/types";

export type FilesLoad = (path: string, next?: string | null) => Promise<FolderAnswer>;
export type ViewMode = "list" | "grid";
export type Sort = { field: SortField; direction: "asc" | "desc" };

/** The dialog or popover that is open, with what it is about. */
export type FilesDialog =
  | { kind: "delete"; row: FileRow }
  | { kind: "request" }
  | { kind: "link-step"; row: FileRow }
  | { kind: "history"; row: FileRow }
  | { kind: "picker" }
  | { kind: "source" }
  | { kind: "upload-menu" }
  | { kind: "row-menu"; row: FileRow };

export type FilesState = {
  p: ReducedProject;
  /** The project's SharePoint link, or null (not connected). */
  folder: Link | null;
  /** Folder names below the project's folder; empty at its root. */
  path: string[];
  /** "loading" until the first answer of the open folder. */
  answer: FolderAnswer | "loading";
  /** Every row loaded so far for the open folder (a "Show more" adds to it). */
  loaded: FileRow[];
  /** The rows to show: search, filter and sort applied. */
  rows: FileRow[];
  next: string | null;
  selected: FileRow | null;
  view: ViewMode;
  query: string;
  filter: FileFilter;
  sort: Sort;
  dialog: FilesDialog | null;
  busy: boolean;
  /** Who may change the project's files and folder (the rights of adding a step / appending project.linked). */
  editor: boolean;
};

export type FilesActions = {
  /** Open a folder row, or select a file row. */
  open: (row: FileRow) => void;
  /** Go up to breadcrumb level `depth` (0: the project's folder). */
  goTo: (depth: number) => void;
  select: (row: FileRow | null) => void;
  setView: (view: ViewMode) => void;
  setQuery: (query: string) => void;
  setFilter: (filter: FileFilter) => void;
  setSort: (sort: Sort) => void;
  showMore: () => void;
  reload: () => void;
  openDialog: (dialog: FilesDialog) => void;
  closeDialog: () => void;
};

/** The props of every part of the Files page. */
export type FilesPartProps = { state: FilesState; actions: FilesActions };
