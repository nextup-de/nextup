"use client";
import { PersonFace } from "@/components/ui/elements";
import type { FileRow } from "@/features/files/items";
import { linkedSteps } from "@/features/files/view";
import { useLocale, useT } from "@/i18n/client";
import { teamOf } from "../parts";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { FileIcon } from "./FileIcon";
import type { FilesPartProps } from "./types";
import styles from "./Panel.module.css";

const KB = 1024;
/** "240 KB", "1.2 MB", "14 MB": the size the way the frames write it. */
export function sizeText(bytes: number, locale: string): string {
  const fmt = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: n < 10 ? 1 : 0 });
  if (bytes < KB) return `${bytes} B`;
  if (bytes < KB * KB) return `${fmt(bytes / KB)} KB`;
  if (bytes < KB * KB * KB) return `${fmt(bytes / (KB * KB))} MB`;
  return `${fmt(bytes / (KB * KB * KB))} GB`;
}

/** "10 Nov" from a Graph timestamp; empty when it has none. */
export function dateText(iso: string, locale: string): string {
  const at = Date.parse(iso);
  return Number.isFinite(at) ? new Date(at).toLocaleDateString(locale, { day: "numeric", month: "short" }) : "";
}

/** "L. Brandt · 10 Nov", or only the part that is known. */
export const whoWhen = (who: string, iso: string, locale: string): string => [who, dateText(iso, locale)].filter(Boolean).join(" · ");

const INSIDE = 3;

/** The folder panel (frame A and the folder option of 'Files · 2 explorations'): the selected folder, or the open one when nothing is selected. */
export function FolderPanel({ state, actions }: FilesPartProps) {
  const t = useT();
  const locale = useLocale();
  const { seed } = useDemo();
  const { p, folder, selected, loaded, path, editor } = state;
  const folderRow: FileRow | null = selected?.isFolder ? selected : null;
  const here = folderRow === null;
  // What the panel describes: the selected folder's row, or the open folder's rows as loaded.
  const inside = here ? loaded : [];
  const total = inside.reduce((n, row) => n + row.size, 0);
  const name = folderRow?.name ?? (path[path.length - 1] ?? folder?.title ?? t("projectFiles.sourceTitle"));
  const webUrl = folderRow?.webUrl ?? folder?.url ?? "";
  const files = here ? loaded.filter((row) => !row.isFolder).length : folderRow.childCount;
  const sizeLine = here ? sizeText(total, locale) : sizeText(folderRow.size, locale);
  const sub = here ? t("projectFiles.folderThis", { count: loaded.length, size: sizeLine }) : `${t("projectFiles.folderFiles", { count: files })} · ${sizeLine}`;
  const steps = here
    ? [...new Map(loaded.flatMap((row) => linkedSteps(row, p)).map((s) => [s.stepId, s])).values()]
    : linkedSteps(folderRow, p);
  const peek = (here ? loaded.filter((row) => !row.isFolder) : []).slice(0, INSIDE);
  const rest = (here ? loaded.length : 0) - peek.length;
  const team = teamOf(p, seed.seats);
  const changed = folderRow ? whoWhen(folderRow.modifiedBy, folderRow.modifiedAt, locale) : whoWhen(loaded[0]?.modifiedBy ?? "", loaded[0]?.modifiedAt ?? "", locale);
  const created = folderRow ? whoWhen(folderRow.createdBy, folderRow.createdAt, locale) : "";

  const copy = async () => {
    try { await navigator.clipboard.writeText(webUrl); } catch { /* the browser refused the clipboard */ }
  };

  return <section className={styles.panel} aria-label={t("projectFiles.panelLabel")} data-testid="files-folder-panel">
    <div className={styles.preview}><FileIcon kind="folder" size={84} /></div>
    <div className={styles.titleBlock}>
      <h2 className={styles.name}>{name}</h2>
      <span className={styles.sub}>{sub}</span>
    </div>
    {here
      ? editor && <button type="button" className={styles.primary} onClick={() => actions.openDialog({ kind: "upload-menu" })}>{t("projectFiles.uploadHere")}</button>
      : <button type="button" className={styles.primary} onClick={() => actions.open(folderRow)}>{t("projectFiles.openFolder")}</button>}
    <div className={styles.row}>
      {editor && <button type="button" className={styles.secondary} onClick={() => actions.openDialog({ kind: "request" })}>{t("projectFiles.requestFiles")}</button>}
      {webUrl && <a className={styles.secondary} href={webUrl} target="_blank" rel="noopener noreferrer">{t("projectFiles.inSharePoint")} ↗</a>}
      {webUrl && <button type="button" className={styles.secondary} data-icon="true" aria-label={t("projectFiles.copyLink")} title={t("projectFiles.copyLink")} onClick={() => void copy()}>⧉</button>}
    </div>
    {peek.length > 0 && <div className={styles.inside}>
      <span className={styles.insideHead}>{t("projectFiles.inside")}</span>
      <div className={styles.thumbs}>
        {peek.map((row) => <button key={row.id} type="button" className={styles.thumb} aria-label={row.name} title={row.name} onClick={() => actions.select(row)}><FileIcon kind={row.kind} size={28} /></button>)}
        {rest > 0 && <button type="button" className={styles.thumb} data-more="true" aria-label={t("projectFiles.openFolder")} onClick={() => (folderRow ? actions.open(folderRow) : actions.select(null))}>{t("projectFiles.moreInside", { count: rest })}</button>}
      </div>
    </div>}
    <div className={styles.meta}>
      {changed && <div className={styles.metaRow}><span className={styles.metaLabel}>{t("projectFiles.changed")}</span><span className={styles.metaValue}>{changed}</span></div>}
      <div className={styles.metaRow}>
        <span className={styles.metaLabel}>{t("projectFiles.linkedSteps")}</span>
        <span className={styles.metaValue}>{steps.length === 0 ? t("projectFiles.noLinkedSteps") : steps.length === 1 ? steps[0].key : t("projectFiles.linkedMore", { key: steps[0].key, count: steps.length - 1 })}</span>
      </div>
      {created && <div className={styles.metaRow}><span className={styles.metaLabel}>{t("projectFiles.created")}</span><span className={styles.metaValue}>{created}</span></div>}
    </div>
    <div className={styles.team}>
      <span className={styles.faces}>{team.slice(0, 3).map((m) => <PersonFace key={m.userId ?? m.name} name={m.name} size="sm" />)}<span>{t("projectFiles.projectTeam")}</span></span>
      {webUrl && <a className={styles.link} href={webUrl} target="_blank" rel="noopener noreferrer">{t("projectFiles.access")} ↗</a>}
    </div>
  </section>;
}
