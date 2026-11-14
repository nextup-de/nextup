"use client";
import { useState } from "react";
import { formatDate } from "@/i18n/format";
import { days } from "@/i18n/format";
import { linkedSteps } from "@/features/files/view";
import type { FileKind, FileRow } from "@/features/files/items";
import { useLocale, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { FileIcon } from "./FileIcon";
import type { FilesPartProps, Sort } from "./types";
import styles from "./List.module.css";

/** 240 KB, 1.2 MB: one decimal from a megabyte up; "—" for a folder. */
export function formatSize(bytes: number, isFolder = false): string {
  if (isFolder) return "—";
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1).replace(/\.0$/, "")} MB`;
  return `${(bytes / 1_000_000_000).toFixed(1).replace(/\.0$/, "")} GB`;
}

const KIND_KEY: Record<FileKind, MessageKey> = {
  sheet: "projectFiles.kindSheet", pdf: "projectFiles.kindPdf", doc: "projectFiles.kindDoc", slides: "projectFiles.kindSlides",
  image: "projectFiles.kindImage", folder: "projectFiles.kindFolder", other: "projectFiles.kindOther",
};
export const kindKey = (kind: FileKind): MessageKey => KIND_KEY[kind];

/** "L. Brandt · 2 days", "L. Brandt · 10 Nov": recent changes as an age, older ones as a date. */
export function changedText(row: FileRow, locale: "en" | "de", now = Date.now(), today = ""): string {
  const at = Date.parse(row.modifiedAt);
  if (!Number.isFinite(at)) return row.modifiedBy;
  const age = Math.floor((now - at) / 86_400_000);
  const when = age < 0 || age > 6 ? formatDate(locale, row.modifiedAt, "dayMonth") : age === 0 ? today : days(locale, age);
  return [row.modifiedBy, when].filter(Boolean).join(" · ");
}


export function FileList({ state, actions }: FilesPartProps) {
  const t = useT();
  const locale = useLocale();
  const [now] = useState(() => Date.now());
  const flip = (field: Sort["field"]): Sort => ({ field, direction: state.sort.field === field && state.sort.direction === "asc" ? "desc" : "asc" });
  const arrow = (field: Sort["field"]) => (state.sort.field === field ? (state.sort.direction === "asc" ? " ↑" : " ↓") : "");
  const move = (e: React.KeyboardEvent<HTMLTableRowElement>, row: FileRow) => {
    if ((e.target as HTMLElement).closest("button") && e.key === "Enter") return;
    const tr = e.currentTarget;
    if (e.key === "ArrowDown") { e.preventDefault(); (tr.nextElementSibling as HTMLElement | null)?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); (tr.previousElementSibling as HTMLElement | null)?.focus(); }
    else if (e.key === "Enter") { e.preventDefault(); actions.open(row); }
    else if (e.key === "Escape") { actions.select(null); }
    else if (e.key === "Backspace" && state.path.length > 0) { e.preventDefault(); actions.goTo(state.path.length - 1); }
  };
  if (state.rows.length === 0 && state.loaded.length > 0) return <p className={styles.none}>{t("projectFiles.emptyFilter")}</p>;
  return <div className={styles.listWrap} data-testid="files-list">
    <table className={styles.table}>
      <thead><tr>
        <th scope="col" aria-sort={state.sort.field === "name" ? (state.sort.direction === "asc" ? "ascending" : "descending") : "none"}><button type="button" onClick={() => actions.setSort(flip("name"))}>{t("projectFiles.colName")}{arrow("name")}</button></th>
        <th scope="col" className={styles.linkedCol}>{t("projectFiles.colLinked")}</th>
        <th scope="col" aria-sort={state.sort.field === "changed" ? (state.sort.direction === "asc" ? "ascending" : "descending") : "none"}><button type="button" onClick={() => actions.setSort(flip("changed"))}>{t("projectFiles.colChanged")}{arrow("changed")}</button></th>
        <th scope="col" className={styles.sizeCol} aria-sort={state.sort.field === "size" ? (state.sort.direction === "asc" ? "ascending" : "descending") : "none"}><button type="button" onClick={() => actions.setSort(flip("size"))}>{t("projectFiles.colSize")}{arrow("size")}</button></th>
        <th scope="col" className={styles.menuCol} />
      </tr></thead>
      <tbody>{state.rows.map((row) => {
        const steps = linkedSteps(row, state.p);
        const picked = state.selected?.id === row.id;
        return <tr key={row.id} tabIndex={0} className={styles.row} data-selected={picked || undefined} data-folder={row.isFolder || undefined}
          onClick={() => actions.select(picked ? null : row)} onDoubleClick={() => actions.open(row)} onKeyDown={(e) => move(e, row)} title={t("projectFiles.hoverTip")}>
          <td className={styles.nameCell}>
            <FileIcon kind={row.kind} size={28} />
            <span className={styles.nameText}>
              <span className={styles.name}>{row.name}</span>
              <span className={styles.kind}>{row.isFolder ? t("projectFiles.folderFiles", { count: row.childCount }) : t(KIND_KEY[row.kind])}</span>
            </span>
          </td>
          <td className={styles.linkedCol}>{steps.length === 0 ? "—" : <><span className={styles.chip}>{steps[0].key}</span>{steps.length > 1 && <span className={styles.more}>+{steps.length - 1}</span>}</>}</td>
          <td>{changedText(row, locale, now, t("common.today"))}</td>
          <td className={styles.sizeCol}>{formatSize(row.size, row.isFolder)}</td>
          <td className={styles.menuCol}><button type="button" className={styles.dots} aria-label={t("projectFiles.rowMenu", { name: row.name })} aria-haspopup="menu" onClick={(e) => { e.stopPropagation(); actions.openDialog({ kind: "row-menu", row }); }}>⋮</button></td>
        </tr>;
      })}</tbody>
    </table>
    {state.next && <button type="button" className={styles.showMore} disabled={state.busy} onClick={actions.showMore}>{t("projectFiles.showMore")}</button>}
  </div>;
}
