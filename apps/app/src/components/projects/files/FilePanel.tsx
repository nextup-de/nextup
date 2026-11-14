"use client";
import { useEffect, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { FileKind, FileRow } from "@/features/files/items";
import { linkedSteps } from "@/features/files/view";
import type { MessageKey } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import { fileVersionsAction } from "@/server/actions/project-files";
import { FileIcon } from "./FileIcon";
import { sizeText, whoWhen } from "./FolderPanel";
import type { FilesPartProps } from "./types";
import styles from "./Panel.module.css";

const APP: Partial<Record<FileKind, { name: MessageKey; scheme: string }>> = {
  sheet: { name: "projectFiles.appExcel", scheme: "ms-excel" },
  doc: { name: "projectFiles.appWord", scheme: "ms-word" },
  slides: { name: "projectFiles.appPowerPoint", scheme: "ms-powerpoint" },
};
const KIND: Record<FileKind, MessageKey> = {
  sheet: "projectFiles.kindSheet", pdf: "projectFiles.kindPdf", doc: "projectFiles.kindDoc", slides: "projectFiles.kindSlides",
  image: "projectFiles.kindImage", folder: "projectFiles.kindFolder", other: "projectFiles.kindOther",
};

/** The link that hands an Office file to its desktop app; null for a kind the browser opens. */
export const officeLink = (row: Pick<FileRow, "kind" | "webUrl">): string | null => {
  const app = APP[row.kind];
  return app && row.webUrl ? `${app.scheme}:ofe|u|${row.webUrl}` : null;
};

/** The file panel (frame B and 1.2, 1.3, 6.3): the selected file, how to open it, who touched it last and the steps it is linked to. */
export function FilePanel({ state, actions }: FilesPartProps) {
  const t = useT();
  const locale = useLocale();
  const { S } = useDemo();
  const { p, selected, dialog, editor } = state;
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const id = selected && !selected.isFolder ? selected.id : null;

  // The version count comes from SharePoint; where it cannot be read the row just offers the history.
  useEffect(() => {
    if (!id) return;
    let stale = false;
    void fileVersionsAction(p.id, id).then((a) => { if (!stale) setCount(a.state === "ok" ? a.versions.length : null); }).catch(() => { if (!stale) setCount(null); });
    return () => { stale = true; };
  }, [p.id, id]);

  if (!selected || selected.isFolder || dialog?.kind === "history") return null;
  const row = selected;
  const app = APP[row.kind];
  const desktop = officeLink(row);
  const steps = linkedSteps(row, p).map((s) => ({ ...s, step: p.steps.find((x) => x.id === s.stepId) }));
  const late = (stepId: string) => { const step = p.steps.find((x) => x.id === stepId); return Boolean(step && step.column !== "done" && !step.dropped && step.dueDay !== null && S.day > step.dueDay); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(row.webUrl); setCopied(true); } catch { setCopied(false); }
  };

  return <section className={styles.panel} aria-label={t("projectFiles.panelLabel")} data-testid="files-file-panel">
    <div className={styles.preview}><FileIcon kind={row.kind} size={84} /></div>
    <div className={styles.titleBlock}>
      <h2 className={styles.name}>{row.name}</h2>
      <span className={styles.sub}>{t(KIND[row.kind])} · {sizeText(row.size, locale)}</span>
    </div>
    {desktop && app
      ? <a className={styles.primary} href={desktop} onClick={() => setOpening(true)}>{t("projectFiles.openInApp", { app: t(app.name) })} ↗</a>
      : <a className={styles.primary} href={row.webUrl} target="_blank" rel="noopener noreferrer">{t("projectFiles.openInBrowser")} ↗</a>}
    {opening && app && <p className={styles.toast} role="status">{t("projectFiles.opening", { app: t(app.name) })} <a className={styles.link} href={row.webUrl} target="_blank" rel="noopener noreferrer">{t("projectFiles.openInBrowserInstead")}</a></p>}
    <div className={styles.row}>
      <a className={styles.secondary} href={row.webUrl} target="_blank" rel="noopener noreferrer">{t("projectFiles.inBrowser")}</a>
      <a className={styles.secondary} href={row.webUrl + (row.webUrl.includes("?") ? "&" : "?") + "download=1"} download={row.name}>{t("projectFiles.download")}</a>
      <button type="button" className={styles.secondary} data-icon="true" aria-label={t("projectFiles.copyLink")} title={t("projectFiles.copyLink")} onClick={() => void copy()}>⧉</button>
    </div>
    {copied && <p className={styles.toast} role="status"><strong>{t("projectFiles.linkCopied")}</strong> · {t("projectFiles.linkCopiedHint")}</p>}
    <div className={styles.meta}>
      <div className={styles.metaRow}><span className={styles.metaLabel}>{t("projectFiles.changed")}</span><span className={styles.metaValue}>{whoWhen(row.modifiedBy, row.modifiedAt, locale)}</span></div>
      <div className={styles.metaRow}>
        <span className={styles.metaLabel}>{t("projectFiles.linkedSteps")}</span>
        <span className={styles.metaValue}>
          {steps.length === 0 && t("projectFiles.noLinkedSteps")}
          {steps.map((s) => <span key={s.stepId}><span className={styles.chip}>{s.key}</span>{late(s.stepId) && <> <span className={styles.late}>{t("projectFiles.late")}</span></>}</span>)}
          {editor && <button type="button" className={styles.link} onClick={() => actions.openDialog({ kind: "link-step", row })}>{t("projectFiles.linkToStep")}</button>}
        </span>
      </div>
      <div className={styles.metaRow}>
        <span className={styles.metaLabel}>{t("projectFiles.version", { id: "" }).trim()}</span>
        <button type="button" className={styles.link} onClick={() => actions.openDialog({ kind: "history", row })}>{count === null ? t("projectFiles.history") : `${t("projectFiles.versionHistory", { count })} →`}</button>
      </div>
    </div>
  </section>;
}
