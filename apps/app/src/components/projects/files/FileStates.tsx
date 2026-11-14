"use client";
import { useEffect } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { useLocale, useT } from "@/i18n/client";
import { FileList } from "./FileList";
import type { FilesPartProps } from "./types";
import styles from "./States.module.css";

const STEPS = [
  ["projectFiles.ncStep1Title", "projectFiles.ncStep1Hint"],
  ["projectFiles.ncStep2Title", "projectFiles.ncStep2Hint"],
  ["projectFiles.ncStep3Title", "projectFiles.ncStep3Hint"],
] as const;

/** When each folder was last read well, so the offline banner can say how old the list is. */
const lastRead = new Map<string, Date>();
export const lastReadOf = (projectId: string, path: readonly string[]): Date | null => lastRead.get(projectId + "/" + path.join("/")) ?? null;

/** The answers that are not a list (D6): loading, empty, offline over the last list, not connected, no access. */
export function FileStates({ state, actions }: FilesPartProps) {
  const t = useT();
  const locale = useLocale();
  const { href } = useDemo();
  const { answer, folder, p, path, loaded, editor } = state;
  const key = p.id + "/" + path.join("/");
  useEffect(() => { if (answer !== "loading" && answer.state === "ok") lastRead.set(key, new Date()); }, [answer, key]);

  if (answer === "loading") return <p className={styles.hint} role="status" data-testid="files-file-states">{t("projectFiles.loading")}</p>;
  const name = path[path.length - 1] ?? (folder?.key || t("projectFiles.sourceTitle"));

  if (answer.state === "ok") return <div data-testid="files-file-states" />;

  if (answer.state === "empty") {
    return <div className={styles.state} data-testid="files-file-states">
      <h2 className={styles.title}>{t("projectFiles.emptyFolderTitle", { folder: name })}</h2>
      <p className={styles.hint}>{t("projectFiles.emptyFolderHint")}</p>
      {editor && <div className={styles.actions}>
        <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={() => actions.openDialog({ kind: "upload-menu" })}>+ {t("projectFiles.upload")}</button>
        <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => actions.openDialog({ kind: "request" })}>{t("projectFiles.askTeamForFiles")}</button>
      </div>}
    </div>;
  }

  if (answer.state === "offline") {
    const at = lastRead.get(key) ?? null;
    const time = at ? at.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "";
    return <div data-testid="files-file-states">
      <div className={styles.banner} role="alert">
        <span>{at ? t("projectFiles.offlineBanner", { time }) : t("projectFiles.offlineHint")}</span>
        <button type="button" className={styles.link} onClick={actions.reload}>{t("projectFiles.retry")}</button>
      </div>
      {loaded.length > 0 && <div className={styles.stale} aria-hidden="true"><FileList state={{ ...state, answer: { state: "ok", rows: loaded, next: null } }} actions={actions} /></div>}
    </div>;
  }

  if (answer.state === "no-access") {
    return <div className={styles.state} data-testid="files-file-states">
      <h2 className={styles.title}>{t("projectFiles.noAccessTitle")}</h2>
      <p className={styles.hint}>{t("projectFiles.noAccessHint")}</p>
    </div>;
  }

  // Not connected: the project has no folder yet, or the person has not connected their Microsoft account.
  const noFolder = folder === null;
  return <div className={styles.state} data-testid="files-file-states">
    <h2 className={styles.title}>{noFolder ? t("projectFiles.notConnectedTitle") : t("projectFiles.m365Connect")}</h2>
    <p className={styles.hint}>{noFolder ? t("projectFiles.notConnectedHint") : t("projectFiles.m365Hint")}</p>
    {noFolder
      ? editor
        ? <div className={styles.actions}><button type="button" className="nh-btn nh-btn-primary nh-btn-sm" onClick={() => actions.openDialog({ kind: "picker" })}>{t("projectFiles.connect")}</button></div>
        : <p className={styles.hint}>{t("projectFiles.ncAsk", { name: p.lead })}</p>
      : <div className={styles.actions}><a className="nh-btn nh-btn-primary nh-btn-sm" href={href("/profile")}>{t("projectFiles.m365Connect")}</a></div>}
    {noFolder && <ol className={styles.steps}>
      {STEPS.map(([title, hint], i) => <li key={title} className={styles.step}>
        <span className={styles.stepNo}>{i + 1}</span>
        <span className={styles.stepTitle}>{t(title)}</span>
        <span className={styles.stepHint}>{t(hint)}</span>
      </li>)}
    </ol>}
  </div>;
}
