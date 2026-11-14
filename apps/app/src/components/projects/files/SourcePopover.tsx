"use client";
import { useRef } from "react";
import { useLocale, useT } from "@/i18n/client";
import type { FilesPartProps } from "./types";
import styles from "./States.module.css";

/** The site and folders of a SharePoint address, as the popover shows them: the path of the link, readable. */
export function folderPathOf(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
    const rest = parts[0] === "sites" || parts[0] === "teams" ? parts.slice(1) : parts;
    return [u.hostname, ...rest].join(" › ");
  } catch { return url; }
}

/** "3 min ago" from a time and now. */
export function agoText(from: Date, now: Date, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const min = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60_000));
  return min < 60 ? rtf.format(-min, "minute") : min < 1440 ? rtf.format(-Math.round(min / 60), "hour") : rtf.format(-Math.round(min / 1440), "day");
}

/** The popover of the SharePoint pill (5.1): which folder is connected, how fresh the list is, sync now, change folder and open in SharePoint. */
export function SourcePopover({ state, actions }: FilesPartProps) {
  const t = useT();
  const locale = useLocale();
  const { dialog, folder, loaded, editor, answer } = state;
  // The last time the list was read, noted when the popover opens.
  const seen = useRef<Date | null>(null);
  if (dialog?.kind !== "source" || !folder) return null;
  if (seen.current === null) seen.current = new Date();
  const synced = answer !== "loading" && answer.state === "ok" ? t("projectFiles.synced", { ago: agoText(seen.current, new Date(), locale) }) : t("projectFiles.outOfDate");

  return <div className={styles.popover} role="dialog" aria-label={t("projectFiles.popoverTitle")} onKeyDown={(e) => { if (e.key === "Escape") actions.closeDialog(); }} data-testid="files-source-popover">
    <h2 className={styles.popTitle}>{t("projectFiles.popoverTitle")}</h2>
    <span className={styles.path}>{folderPathOf(folder.url)}</span>
    <span className={styles.muted}>{synced} · {t("projectFiles.pickerFiles", { count: loaded.filter((r) => !r.isFolder).length })}</span>
    <div className={styles.actions}>
      <button type="button" className="nh-btn nh-btn-secondary nh-btn-sm" onClick={() => { actions.reload(); actions.closeDialog(); }}>{t("projectFiles.syncNow")}</button>
      {editor && <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => actions.openDialog({ kind: "picker" })}>{t("projectFiles.changeFolderMore")}</button>}
    </div>
    <span className={styles.note}>{t("projectFiles.popoverNote")}</span>
    <a className={styles.link} href={folder.url} target="_blank" rel="noopener noreferrer">{t("projectFiles.openInSharePoint")} ↗</a>
  </div>;
}
