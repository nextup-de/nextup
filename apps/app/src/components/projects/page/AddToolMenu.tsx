"use client";
import { useEffect, useRef, useState } from "react";
import type { ProjectPage, ReducedProject, ToolKind } from "@/features/projects/types";
import type { JiraRow } from "@/features/projects/views";
import { addToolOptions, TOOL_GLYPH } from "@/features/projects/page-view";
import { canAddTool, jiraTagTitleKey, pagesOf } from "@/features/projects/pages";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { useRights } from "../parts";
import { usePageActs } from "./usePageActs";
import styles from "./PageView.module.css";
import rows from "./ToolSection.module.css";

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
  const options = addToolOptions(pages, page, { query, jiraOn: jira.state !== "off", agent, label: name });
  const before = page.tools[index - 1];
  const after = page.tools[index];
  const toolName = (tool: ProjectPage["tools"][number]) => tool.title ?? name(tool.kind);
  const heading = before && after ? t("projectPages.addToolBetween", { before: toolName(before), after: toolName(after) }) : t("projectPages.addTool");
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
      <h3 className={styles.menuTitle}>{heading}</h3>
      <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={onClose} disabled={busy}>{t("projectPages.close")}</button>
    </div>
    <input className="nh-input" aria-label={t("projectPages.findTool")} placeholder={t("projectPages.findTool")} value={query} onChange={(event) => setQuery(event.target.value)} disabled={busy} />
    <div className={styles.options}>
      {options.map(({ kind, tag, taken }) => <button key={kind} type="button" className={`${styles.option} ${rows.addRow}`} data-taken={taken ? "true" : undefined} disabled={busy || taken || !canAddTool(pages, page, kind, { agent })} onClick={() => void pick(kind)}>
        <span className={rows.glyph} aria-hidden="true">{TOOL_GLYPH[kind]}</span>
        <span className={rows.grow}>{name(kind)}</span>
        {taken ? <span className={styles.tag}>{t("projectPages.alreadyInProject")}</span>
          : tag && <span className={`${styles.tag} ${rows.tag}`} data-tag={tag} title={tag === "jira" && jiraTagTitleKey(kind) ? t(jiraTagTitleKey(kind)!) : undefined}>{tag === "jira" ? `⟳ ${t("projectPages.tagJira")}` : t("projectPages.tagNextUpOnly")}</span>}
      </button>)}
      {options.length === 0 && <p className={styles.summary}>{t("projectPages.noToolsFound")}</p>}
    </div>
    {busy && <p role="status">{t("projectPages.addingTool")}</p>}
    {error && <p role="alert">{error}</p>}
  </dialog>;
}
