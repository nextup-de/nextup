"use client";
import { useEffect, useRef, useState } from "react";
import type { ProjectPage, ReducedProject, ToolKind } from "@/features/projects/types";
import type { JiraRow } from "@/features/projects/views";
import { canAddTool, isJiraTool, pagesOf, TOOL_KINDS } from "@/features/projects/pages";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { useRights } from "../parts";
import { usePageActs } from "./usePageActs";
import styles from "./PageView.module.css";

export type AddToolMenuProps = { p: ReducedProject; page: ProjectPage; jira: JiraRow; agent: boolean; index: number; onClose: () => void };

/** Shared by every insertion point; placement uses the following tool's stable id. */
export function AddToolMenu({ p, page, jira, agent, index, onClose }: AddToolMenuProps) {
  const t = useT();
  const { addStep: editor } = useRights(p);
  const acts = usePageActs(p);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    box.current?.showModal();
    box.current?.querySelector("input")?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  if (!editor) return null;
  const pages = pagesOf(p, { agent });
  const name = (kind: ToolKind) => t(`projectPages.tool${kind[0].toUpperCase()}${kind.slice(1)}` as MessageKey);
  const kinds = TOOL_KINDS.filter((kind) => (agent || kind !== "agent") && name(kind).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const pick = async (kind: ToolKind) => {
    if (busy || !canAddTool(pages, page, kind, { agent })) return;
    setBusy(true);
    setError(null);
    try {
      const result = await acts.addTool(page.id, kind, page.tools[index]?.id ?? null);
      if (result.ok) onClose();
      else setError(result.error);
    } catch { setError(t("common.retry")); }
    finally { setBusy(false); }
  };
  return <dialog ref={box} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} className={styles.menu} role="dialog" aria-label={t("projectPages.addTool")} aria-busy={busy}>
    <div className={styles.menuHead}>
      <h3 className={styles.menuTitle}>{t("projectPages.addTool")}</h3>
      <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={onClose} disabled={busy}>{t("projectPages.close")}</button>
    </div>
    <input className="nh-input" aria-label={t("projectPages.findTool")} placeholder={t("projectPages.findTool")} value={query} onChange={(event) => setQuery(event.target.value)} disabled={busy} />
    <div className={styles.options}>
      {kinds.map((kind) => {
        const allowed = canAddTool(pages, page, kind, { agent });
        return <button key={kind} type="button" className={styles.option} disabled={busy || !allowed} onClick={() => void pick(kind)}>
          <span>{name(kind)}</span>
          {!allowed ? <span className={styles.tag}>{t("projectPages.alreadyInProject")}</span> : jira.state !== "off" && <span className={styles.tag}>{isJiraTool(kind) ? t("projectPages.tagJira") : t("projectPages.tagNextUpOnly")}</span>}
        </button>;
      })}
      {kinds.length === 0 && <p className={styles.summary}>{t("projectPages.noToolsFound")}</p>}
    </div>
    {busy && <p role="status">{t("projectPages.addingTool")}</p>}
    {error && <p role="alert">{error}</p>}
  </dialog>;
}
