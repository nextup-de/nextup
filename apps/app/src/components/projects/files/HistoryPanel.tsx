"use client";
import { useEffect, useState } from "react";
import type { FileVersion, VersionsAnswer } from "@/features/files/items";
import { useLocale, useT } from "@/i18n/client";
import { fileVersionsAction } from "@/server/actions/project-files";
import { sizeText, whoWhen } from "./FolderPanel";
import type { FilesPartProps } from "./types";
import styles from "./Panel.module.css";

const SHOWN = 4;

/** The history panel (frame 6.2): it replaces the file panel with the versions SharePoint keeps; going back to one is done in SharePoint. */
export function HistoryPanel({ state, actions }: FilesPartProps) {
  const t = useT();
  const locale = useLocale();
  const { p, dialog } = state;
  const row = dialog?.kind === "history" ? dialog.row : null;
  const [answer, setAnswer] = useState<VersionsAnswer | "loading">("loading");
  const [all, setAll] = useState(false);
  const id = row?.id ?? null;

  useEffect(() => {
    if (!id) return;
    let stale = false;
    setAnswer("loading"); setAll(false);
    void fileVersionsAction(p.id, id).then((a) => { if (!stale) setAnswer(a); }).catch(() => { if (!stale) setAnswer({ state: "offline" }); });
    return () => { stale = true; };
  }, [p.id, id]);

  if (!row) return null;
  const versions: FileVersion[] = answer !== "loading" && answer.state === "ok" ? answer.versions : [];
  const shown = all ? versions : versions.slice(0, SHOWN);

  return <section className={styles.panel} aria-label={t("projectFiles.history")} data-testid="files-history-panel">
    <button type="button" className={styles.back} onClick={actions.closeDialog}>‹ {row.name}</button>
    <div className={styles.titleBlock}>
      <h2 className={styles.name}>{t("projectFiles.history")}</h2>
      {answer !== "loading" && answer.state === "ok" && <span className={styles.sub}>{t("projectFiles.historyCount", { count: versions.length })}</span>}
    </div>
    {answer === "loading" && <p className={styles.note} role="status">{t("projectFiles.loading")}</p>}
    {answer !== "loading" && answer.state !== "ok" && <p className={styles.note} role="status">{t(answer.state === "no-access" ? "projectFiles.noAccessTitle" : answer.state === "offline" ? "projectFiles.offlineTitle" : "projectFiles.notConnectedTitle")}</p>}
    {answer !== "loading" && answer.state === "ok" && versions.length === 0 && <p className={styles.note}>{t("projectFiles.historyEmpty")}</p>}
    {shown.length > 0 && <ol className={styles.versions}>
      {shown.map((v, i) => <li key={v.id} className={styles.version} data-current={i === 0 ? "true" : undefined}>
        <span className={styles.who}>{i === 0 ? t("projectFiles.versionNow", { id: v.id }) : t("projectFiles.version", { id: v.id })}{i === 0 && <> · {t("projectFiles.versionCurrent")}</>}</span>
        <span className={styles.when}>{whoWhen(v.modifiedBy, v.modifiedAt, locale)} · {sizeText(v.size, locale)}</span>
      </li>)}
    </ol>}
    {!all && versions.length > SHOWN && <button type="button" className={styles.link} onClick={() => setAll(true)}>{t("projectFiles.showOlder", { count: versions.length - SHOWN })}</button>}
    <p className={styles.note}>{t("projectFiles.restoreHint")}</p>
    <a className={styles.link} href={row.webUrl} target="_blank" rel="noopener noreferrer">{t("projectFiles.restoreInSharePoint")} ↗</a>
  </section>;
}
