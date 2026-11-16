"use client";
import { useEffect, useRef, useState } from "react";
import type { FileFilter, SortField } from "@/features/files/view";
import { useT } from "@/i18n/client";
import { BreadcrumbTrail } from "./Breadcrumb";
import type { FilesPartProps, ViewMode } from "./types";
import styles from "./List.module.css";

const VIEW_KEY = "nh.filesView";
const LIST_ICON = <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 4.5H13M3 8H13M3 11.5H13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
const GRID_ICON = <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.4">
  <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" />
</svg>;
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

  return <div className={styles.toolbar} data-edge="">
    <BreadcrumbTrail state={state} actions={actions} />
    <label className={styles.search}>
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      <input type="search" aria-label={t("projectFiles.search")} placeholder={t("projectFiles.searchPlaceholder")} value={state.query}
        onChange={(e) => actions.setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); actions.setQuery(""); } }} />
    </label>
    <div className={styles.filterWrap} ref={wrap}>
      <button type="button" className={styles.control} data-on={on || undefined} aria-haspopup="menu" aria-expanded={open} aria-label={t("projectFiles.filterLabel")} onClick={() => setOpen(!open)}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.5 4h11M4.5 8h7M6.5 12h3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        {label(state.filter)}
        <svg className={styles.chevron} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M2.5 4l2.5 2.5L7.5 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
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
      {(["list", "grid"] as const).map((view) => <button key={view} type="button" aria-pressed={state.view === view} aria-label={t(view === "list" ? "projectFiles.viewList" : "projectFiles.viewGrid")} onClick={() => chooseView(view)}>{view === "list" ? LIST_ICON : GRID_ICON}</button>)}
    </div>
  </div>;
}
