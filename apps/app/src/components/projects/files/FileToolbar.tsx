"use client";
import { useEffect, useRef, useState } from "react";
import type { FileFilter, SortField } from "@/features/files/view";
import { useT } from "@/i18n/client";
import { BreadcrumbTrail } from "./Breadcrumb";
import type { FilesPartProps, ViewMode } from "./types";
import styles from "./List.module.css";

const VIEW_KEY = "nh.filesView";
const TYPES = ["sheet", "pdf", "doc", "image"] as const;

/** The breadcrumb, 'Search in this folder', the 'All files ▾' menu (filter and sort) and the list / grid toggle (kept per browser). */
export function FileToolbar({ state, actions }: FilesPartProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const { setView } = actions;
  useEffect(() => {
    try { const saved = window.localStorage.getItem(VIEW_KEY); if (saved === "list" || saved === "grid") setView(saved); } catch { /* storage off: the list */ }
  }, [setView]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const chooseView = (view: ViewMode) => {
    actions.setView(view);
    try { window.localStorage.setItem(VIEW_KEY, view); } catch { /* storage off */ }
  };
  const label = (filter: FileFilter) => t(filter === "all" ? "projectFiles.filterAll" : filter === "sheet" ? "projectFiles.filterSheet" : filter === "pdf" ? "projectFiles.filterPdf" : filter === "doc" ? "projectFiles.filterDoc" : filter === "image" ? "projectFiles.filterImage" : "projectFiles.filterLinked");
  const sortLabel = (field: SortField) => t(field === "name" ? "projectFiles.sortName" : field === "changed" ? "projectFiles.sortChanged" : "projectFiles.sortSize");
  const on = state.filter !== "all";

  return <div className={styles.toolbar}>
    <BreadcrumbTrail state={state} actions={actions} />
    <input className={`nh-input ${styles.search}`} type="search" aria-label={t("projectFiles.search")} placeholder={t("projectFiles.searchPlaceholder")} value={state.query}
      onChange={(e) => actions.setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); actions.setQuery(""); } }} />
    <div className={styles.filterWrap} ref={wrap}>
      <button type="button" className={styles.control} data-on={on || undefined} aria-haspopup="menu" aria-expanded={open} aria-label={t("projectFiles.filterLabel")} onClick={() => setOpen(!open)}>
        {label(state.filter)} <span aria-hidden="true">▾</span>
      </button>
      {on && <button type="button" className={styles.clear} aria-label={t("projectFiles.clearFilter")} onClick={() => actions.setFilter("all")}>×</button>}
      {open && <div role="menu" className={styles.menu} aria-label={t("projectFiles.filterLabel")} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
        <span className={styles.menuHead}>{t("projectFiles.filterShow")}</span>
        {(["all", "linked"] as const).map((filter) => <button key={filter} type="button" role="menuitemradio" aria-checked={state.filter === filter} onClick={() => { actions.setFilter(filter); setOpen(false); }}>{label(filter)}</button>)}
        <span className={styles.menuHead}>{t("projectFiles.filterType")}</span>
        {TYPES.map((filter) => <button key={filter} type="button" role="menuitemradio" aria-checked={state.filter === filter} onClick={() => { actions.setFilter(filter); setOpen(false); }}>{label(filter)}</button>)}
        <span className={styles.menuHead}>{t("projectFiles.sortLabel")}</span>
        {(["name", "changed", "size"] as const).map((field) => <button key={field} type="button" role="menuitemradio" aria-checked={state.sort.field === field} onClick={() => { actions.setSort({ field, direction: state.sort.field === field && state.sort.direction === "asc" ? "desc" : "asc" }); setOpen(false); }}>{sortLabel(field)}{state.sort.field === field ? (state.sort.direction === "asc" ? " ↑" : " ↓") : ""}</button>)}
      </div>}
    </div>
    <div className={styles.toggle} role="group" aria-label={t("projectFiles.viewLabel")}>
      {(["list", "grid"] as const).map((view) => <button key={view} type="button" aria-pressed={state.view === view} aria-label={t(view === "list" ? "projectFiles.viewList" : "projectFiles.viewGrid")} onClick={() => chooseView(view)}>{view === "list" ? "☰" : "▦"}</button>)}
    </div>
  </div>;
}
