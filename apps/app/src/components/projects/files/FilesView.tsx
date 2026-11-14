"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FileRow, FolderAnswer } from "@/features/files/items";
import { projectFolder } from "@/features/files/link";
import { filterRows, searchRows, sortRows, type FileFilter } from "@/features/files/view";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { Breadcrumb } from "./Breadcrumb";
import { DeleteDialog } from "./DeleteDialog";
import { DropZone } from "./DropZone";
import { FileGrid } from "./FileGrid";
import { FileList } from "./FileList";
import { FilePanel } from "./FilePanel";
import { FileStates } from "./FileStates";
import { FileToolbar } from "./FileToolbar";
import { FolderPanel } from "./FolderPanel";
import { FolderPicker } from "./FolderPicker";
import { HistoryPanel } from "./HistoryPanel";
import { LinkStepDialog } from "./LinkStepDialog";
import { RequestDialog } from "./RequestDialog";
import { RowMenu } from "./RowMenu";
import { SourcePopover } from "./SourcePopover";
import { UploadMenu } from "./UploadMenu";
import { UploadProgress } from "./UploadProgress";
import type { FilesActions, FilesDialog, FilesLoad, FilesState, Sort, ViewMode } from "./types";
import styles from "./Files.module.css";

/** The Files page's shell: it owns the open folder, the selection, the view mode and the answer; its parts get typed props and handlers. */
export function FilesView({ p, load, editor }: { p: ReducedProject; load: FilesLoad; editor: boolean }) {
  const t = useT();
  const folder = projectFolder(p);
  const [path, setPath] = useState<string[]>([]);
  const [answer, setAnswer] = useState<FolderAnswer | "loading">("loading");
  const [loaded, setLoaded] = useState<FileRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [selected, setSelected] = useState<FileRow | null>(null);
  const [view, setView] = useState<ViewMode>("list");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FileFilter>("all");
  const [sort, setSort] = useState<Sort>({ field: "name", direction: "asc" });
  const [dialog, setDialog] = useState<FilesDialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);
  const key = path.join("/");

  useEffect(() => {
    let stale = false;
    void load(key).then((a) => {
      if (stale) return;
      setAnswer(a);
      if (a.state === "ok") { setLoaded(a.rows); setNext(a.next); }
    });
    return () => { stale = true; };
  }, [load, key, round]);

  const rows = useMemo(() => sortRows(filterRows(searchRows(loaded, query), filter, p), sort.field, sort.direction), [loaded, query, filter, sort, p]);

  /** A new folder (or a reload) starts from nothing: the effect above only fetches. */
  const begin = useCallback((to: string[]) => {
    setAnswer("loading"); setLoaded([]); setNext(null); setSelected(null); setQuery(""); setFilter("all");
    setPath(to);
  }, []);
  const open = useCallback((row: FileRow) => {
    if (row.isFolder) begin([...path, row.name]); else setSelected(row);
  }, [begin, path]);
  const showMore = useCallback(() => {
    if (!next || busy) return;
    setBusy(true);
    void load(key, next).then((a) => {
      setBusy(false);
      if (a.state === "ok") { setLoaded((current) => [...current, ...a.rows]); setNext(a.next); }
    });
  }, [load, key, next, busy]);

  const state: FilesState = { p, folder, path, answer, loaded, rows, next, selected, view, query, filter, sort, dialog, busy, editor };
  const actions: FilesActions = {
    open,
    goTo: (depth) => begin(path.slice(0, depth)),
    select: setSelected, setView, setQuery, setFilter, setSort, showMore,
    reload: () => { setAnswer("loading"); setRound((n) => n + 1); },
    openDialog: setDialog,
    closeDialog: () => setDialog(null),
  };
  const part = { state, actions };

  return <div className={styles.files} data-testid="files-view">
    <section className={styles.list} aria-label={t("projectFiles.pageLabel")} data-testid="files-list-card">
      <Breadcrumb {...part} />
      <FileToolbar {...part} />
      <DropZone {...part} />
      <FileStates {...part} />
      {answer !== "loading" && answer.state === "ok" && (view === "list" ? <FileList {...part} /> : <FileGrid {...part} />)}
      <UploadProgress {...part} />
    </section>
    <aside className={styles.side} data-testid="files-side">
      {selected ? <FilePanel {...part} /> : <FolderPanel {...part} />}
      <HistoryPanel {...part} />
    </aside>
    <UploadMenu {...part} />
    <SourcePopover {...part} />
    <FolderPicker {...part} />
    <RowMenu {...part} />
    <DeleteDialog {...part} />
    <RequestDialog {...part} />
    <LinkStepDialog {...part} />
  </div>;
}
