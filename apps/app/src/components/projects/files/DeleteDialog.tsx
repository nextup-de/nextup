"use client";
import { useEffect, useState } from "react";
import { removeDemoItem } from "@/features/demo/files-demo";
import { linkedSteps } from "@/features/files/view";
import { recycleBinUrl, rx, type RemoveKey } from "@/features/files/remove";
import { deleteFileAction } from "@/server/actions/project-files-remove";
import { useLocale, useT } from "@/i18n/client";
import { useFilesSource } from "./source";
import type { FilesPartProps } from "./types";
import styles from "./Menu.module.css";

const TOAST_MS = 10_000;

/** Delete (6.1): asks first, names the step links the file leaves behind, moves it to the recycle bin and says so in a toast. */
export function DeleteDialog({ state, actions }: FilesPartProps) {
  const t = useT();
  const locale = useLocale();
  const { demo } = useFilesSource(state.p.id);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<RemoveKey | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [done]);
  const row = state.dialog?.kind === "delete" ? state.dialog.row : null;
  const bin = state.folder ? recycleBinUrl(state.folder.url) : null;

  const confirm = async () => {
    if (!row || busy) return;
    setBusy(true); setProblem(null);
    const outcome = demo ? (removeDemoItem(state.path.join("/"), row.id) ? "ok" : "gone") : (await deleteFileAction(state.p.id, row.id)).state;
    setBusy(false);
    if (outcome === "ok" || outcome === "gone") {
      actions.closeDialog();
      actions.select(null);
      actions.reload();
      if (outcome === "ok") setDone(rx(locale, "deletedOk", { name: row.name }));
      return;
    }
    setProblem(outcome === "read-only" ? "readOnly" : outcome === "no-access" ? "noAccess" : outcome === "not-connected" ? "notConnected" : "offline");
  };

  return <div data-testid="files-delete-dialog">
    {row && <div className={styles.scrim}>
      <div className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="files-delete-title" aria-describedby="files-delete-body" aria-busy={busy}
        onKeyDown={(e) => { if (e.key === "Escape" && !busy) actions.closeDialog(); }}>
        <h2 id="files-delete-title">{t("projectFiles.deleteTitle", { name: row.name })}</h2>
        <p id="files-delete-body">{t("projectFiles.deleteBody")}</p>
        {linkedSteps(row, state.p).length > 0 && <p className={styles.note}>{rx(locale, "linkedNote", { steps: linkedSteps(row, state.p).map((s) => s.key).join(", ") })}</p>}
        {problem && <p className={styles.error} role="alert">{rx(locale, problem)}</p>}
        <div className={styles.actions}>
          <button type="button" className="nh-btn" autoFocus disabled={busy} onClick={actions.closeDialog}>{t("projectFiles.keepIt")}</button>
          <button type="button" className={`nh-btn ${styles.danger}`} disabled={busy} aria-busy={busy || undefined} onClick={() => void confirm()}>{busy ? rx(locale, "deleting") : t("projectFiles.delete")}</button>
        </div>
      </div>
    </div>}
    {done && <div className={styles.toast} role="status">
      <span>{done}</span>
      {bin && <a href={bin} target="_blank" rel="noopener noreferrer">{rx(locale, "openRecycleBin")} <span aria-hidden="true">↗</span></a>}
    </div>}
  </div>;
}
