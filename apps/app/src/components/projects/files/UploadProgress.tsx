"use client";
import { useSyncExternalStore } from "react";
import { cancelUpload } from "@/features/files/upload-run";
import { uploadQueue, ut } from "@/features/files/upload";
import { useLocale, useT } from "@/i18n/client";
import { formatSize } from "./FileList";
import type { FilesPartProps } from "./types";
import styles from "./Upload.module.css";

/** The files on their way into the open folder (3.4): progress per file, Cancel for a file that has not finished. */
export function UploadProgress({ state }: FilesPartProps) {
  const t = useT();
  const locale = useLocale();
  const items = useSyncExternalStore(uploadQueue.subscribe, uploadQueue.snapshot, uploadQueue.snapshot);
  const path = state.path.join("/");
  const rows = items.filter((item) => item.path === path && (item.state === "waiting" || item.state === "uploading" || item.state === "failed"));
  return <div data-testid="files-upload-progress">
    {rows.length > 0 && <ul className={styles.rows}>{rows.map((item) => <li key={item.id} className={styles.row} data-state={item.state}>
      <div className={styles.rowText}>
        <span className={styles.name}>{item.name}</span>
        <span className={styles.line}>{item.state === "uploading" ? ut(locale, "uploadingLine", { sent: formatSize(item.sent), total: formatSize(item.size) })
          : item.state === "waiting" ? ut(locale, "waitingLine", { total: formatSize(item.size) })
          : ut(locale, "failed", { why: ut(locale, item.error === "no-access" ? "why_no_access" : item.error === "not-connected" ? "why_not_connected" : item.error === "read-only" ? "why_read_only" : "why_offline") })}</span>
        {item.state === "uploading" && <progress className={styles.bar} max={item.size || 1} value={item.sent} aria-label={item.name} />}
      </div>
      {item.state === "failed"
        ? <button type="button" className={styles.cancel} onClick={() => uploadQueue.clearFinished()}>{ut(locale, "dismiss")}</button>
        : <button type="button" className={styles.cancel} onClick={() => cancelUpload(item.id)}>{t("projectFiles.uploadCancel")}</button>}
    </li>)}</ul>}
  </div>;
}
