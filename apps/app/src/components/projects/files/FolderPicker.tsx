"use client";
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { folderOf } from "@/features/files/link";
import { useT } from "@/i18n/client";
import { childFoldersAction, searchFoldersAction, type PickerAnswer, type PickerFolder } from "@/server/actions/folder-picker";
import { useSend } from "../parts";
import type { FilesPartProps } from "./types";
import styles from "./States.module.css";

/** The event that makes a folder the project's (D4): the folder's address, system sharepoint, no step. */
export const folderEvent = (url: string) => ({ url: url.trim(), system: "sharepoint", key: "" });

/** The picker of 6.4: paste a folder link, or search by name and walk down, then use the folder. Saves one project.linked. */
export function FolderPicker({ state, actions }: FilesPartProps) {
  const t = useT();
  const { act } = useDemo();
  const { p, dialog, editor } = state;
  const send = useSend(p);
  const [link, setLink] = useState("");
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<PickerAnswer | "loading" | null>(null);
  const [trail, setTrail] = useState<PickerFolder[]>([]);
  const [picked, setPicked] = useState<PickerFolder | null>(null);
  const [error, setError] = useState(false);
  if (dialog?.kind !== "picker" || !editor) return null;

  const url = picked?.webUrl ?? link.trim();
  const valid = url !== "" && folderOf(url) !== null;
  const save = () => {
    if (!valid) { setError(link.trim() !== ""); return; }
    const ev = folderEvent(url);
    if (send("project.linked", ev, () => act.project.link(p.id, ev.url, ev.system, ev.key))) actions.closeDialog();
  };
  const search = () => {
    setAnswer("loading"); setTrail([]); setPicked(null);
    void searchFoldersAction(query).then(setAnswer).catch(() => setAnswer({ state: "offline" }));
  };
  const into = (folder: PickerFolder) => {
    setPicked(folder); setTrail([...trail, folder]); setAnswer("loading");
    void childFoldersAction(folder.driveId, folder.id).then(setAnswer).catch(() => setAnswer({ state: "offline" }));
  };
  const up = (to: number) => {
    const next = trail.slice(0, to);
    setTrail(next); setPicked(next[next.length - 1] ?? null);
    if (next.length === 0) { setAnswer(query.trim() ? "loading" : null); if (query.trim()) search(); return; }
    const last = next[next.length - 1];
    setAnswer("loading");
    void childFoldersAction(last.driveId, last.id).then(setAnswer).catch(() => setAnswer({ state: "offline" }));
  };

  return <div className={styles.overlay} role="presentation" onClick={(e) => { if (e.target === e.currentTarget) actions.closeDialog(); }} onKeyDown={(e) => { if (e.key === "Escape") actions.closeDialog(); }} data-testid="files-folder-picker">
    <section className={styles.sheet} role="dialog" aria-modal="true" aria-label={t("projectFiles.folderPickerTitle")}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.sheetTitle}>{t("projectFiles.folderPickerTitle")}</h2>
          <p className={styles.sub}>{t("projectFiles.pickerFor", { project: p.title })}</p>
        </div>
        <button type="button" className={styles.link} aria-label={t("projectFiles.close")} onClick={actions.closeDialog}>×</button>
      </div>
      <label className={styles.field}>{t("projectFiles.pasteLabel")}
        <input className="nh-input" autoFocus value={link} onChange={(e) => { setLink(e.target.value); setPicked(null); setError(false); }} />
      </label>
      {error && <p className={styles.error} role="alert">{t("projectFiles.pasteInvalid")}</p>}
      <p className={styles.note}>{t("projectFiles.pickerOr")}</p>
      <form onSubmit={(e) => { e.preventDefault(); search(); }}>
        <input className="nh-input" aria-label={t("projectFiles.pickerSearchPlaceholder")} placeholder={t("projectFiles.pickerSearchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
      </form>
      {trail.length > 0 && <div className={styles.crumbs} aria-label={t("projectFiles.breadcrumb")}>
        <button type="button" className={styles.link} onClick={() => up(0)}>{t("projectFiles.sites")}</button>
        {trail.map((f, i) => <span key={f.id}>› <button type="button" className={styles.link} onClick={() => up(i + 1)}>{f.name}</button></span>)}
      </div>}
      {answer === "loading" && <p className={styles.hint} role="status">{t("projectFiles.loading")}</p>}
      {answer !== null && answer !== "loading" && answer.state !== "ok" && <p className={styles.error} role="alert">{t(answer.state === "offline" ? "projectFiles.offlineTitle" : answer.state === "no-access" ? "projectFiles.noAccessTitle" : "projectFiles.m365Connect")}</p>}
      {answer !== null && answer !== "loading" && answer.state === "ok" && (answer.folders.length === 0
        ? <p className={styles.hint}>{t("projectFiles.pickerNone")}</p>
        : <ul className={styles.list}>
          {answer.folders.map((f) => <li key={f.id}>
            <button type="button" className={styles.pick} aria-pressed={picked?.id === f.id} onClick={() => setPicked(f)} onDoubleClick={() => into(f)}>
              <span>{f.name}<span className={styles.muted}>{f.path ? ` · ${f.path}` : ""}</span></span>
              <span className={styles.muted}>{t("projectFiles.pickerFiles", { count: f.count })} ›</span>
            </button>
          </li>)}
        </ul>)}
      {picked && <div className={styles.footer}><button type="button" className={styles.link} onClick={() => into(picked)}>{t("projectFiles.open")} ›</button></div>}
      <p className={styles.note}>{t("projectFiles.pickerNote")}</p>
      <div className={styles.footer}>
        <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={actions.closeDialog}>{t("projectFiles.back")}</button>
        <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!valid} onClick={save}>{t("projectFiles.useThisFolder")}</button>
      </div>
    </section>
  </div>;
}
