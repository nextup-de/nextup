"use client";
import { useState } from "react";
import { linkedSteps } from "@/features/files/view";
import { useLocale, useT } from "@/i18n/client";
import { changedText, formatSize } from "./FileList";
import { FileIcon } from "./FileIcon";
import type { FilesPartProps } from "./types";
import styles from "./List.module.css";

/** The same rows as tiles: the folders as a strip, the files as cards with a big icon. */
export function FileGrid({ state, actions }: FilesPartProps) {
  const t = useT();
  const locale = useLocale();
  const [now] = useState(() => Date.now());
  const folders = state.rows.filter((row) => row.isFolder);
  const files = state.rows.filter((row) => !row.isFolder);
  const key = (e: React.KeyboardEvent, row: (typeof state.rows)[number]) => {
    if (e.key === "Enter") { e.preventDefault(); actions.open(row); }
    else if (e.key === "Escape") actions.select(null);
    else if (e.key === "Backspace" && state.path.length > 0) { e.preventDefault(); actions.goTo(state.path.length - 1); }
  };
  if (state.rows.length === 0 && state.loaded.length > 0) return <p className={styles.none}>{t("projectFiles.emptyFilter")}</p>;
  return <div className={styles.gridWrap} data-testid="files-grid">
    {folders.length > 0 && <section aria-label={t("projectFiles.groupFolders")}>
      <h3 className={styles.group}>{t("projectFiles.groupFolders")}</h3>
      <div className={styles.folders}>{folders.map((row) => <div key={row.id} role="button" tabIndex={0} className={styles.folderTile} data-selected={state.selected?.id === row.id || undefined}
        aria-label={row.name} onClick={() => actions.select(state.selected?.id === row.id ? null : row)} onDoubleClick={() => actions.open(row)} onKeyDown={(e) => key(e, row)}>
        <FileIcon kind="folder" size={28} />
        <span className={styles.nameText}><span className={styles.name}>{row.name}</span><span className={styles.kind}>{t("projectFiles.folderFiles", { count: row.childCount })}</span></span>
      </div>)}</div>
    </section>}
    {files.length > 0 && <section aria-label={t("projectFiles.groupFiles")}>
      <h3 className={styles.group}>{t("projectFiles.groupFiles")}</h3>
      <div className={styles.tiles}>{files.map((row) => {
        const steps = linkedSteps(row, state.p);
        return <div key={row.id} role="button" tabIndex={0} className={styles.tile} data-selected={state.selected?.id === row.id || undefined} aria-label={row.name}
          onClick={() => actions.select(state.selected?.id === row.id ? null : row)} onDoubleClick={() => actions.open(row)} onKeyDown={(e) => key(e, row)} title={`${row.name} · ${formatSize(row.size)}`}>
          <span className={styles.tileIcon}><FileIcon kind={row.kind} size={84} /></span>
          <span className={styles.tileName}>{row.name}</span>
          <span className={styles.tileMeta}><span>{changedText(row, locale, now, t("common.today"))}</span>{steps[0] && <span className={styles.chip}>{steps[0].key}</span>}</span>
        </div>;
      })}</div>
    </section>}
    {state.next && <button type="button" className={styles.showMore} disabled={state.busy} onClick={actions.showMore}>{t("projectFiles.showMore")}</button>}
  </div>;
}
