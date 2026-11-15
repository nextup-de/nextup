"use client";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_PAGES, isJiraTool, mergePlan, pagesOf } from "@/features/projects/pages";
import { mergeRows } from "@/features/projects/page-undo";
import type { ProjectPage, ReducedProject, ToolKind } from "@/features/projects/types";
import type { JiraRow } from "@/features/projects/views";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { usePageActs } from "./usePageActs";
import s from "./MergeDialog.module.css";

export type MergeDialogProps = {
  p: ReducedProject;
  fromPageId: string;
  intoPageId: string;
  open: boolean;
  onClose: () => void;
  onMerged: (intoPageId: string, movedToolIds: string[]) => void;
  /** The company's connector row: with a Jira project the rows carry the tags of D4. */
  jira?: JiraRow;
};
const toolKey = (kind: ToolKind) => `projectPages.tool${kind[0].toUpperCase()}${kind.slice(1)}` as MessageKey;
const UNDO_MS = 8000;

/** Confirms a merge (screen 07), sends it, then offers one Undo (screen 08). The toast outlives the dialog's body. */
export function MergeDialog({ p, fromPageId, intoPageId, open, onClose, onMerged, jira }: MergeDialogProps) {
  const t = useT();
  const acts = usePageActs(p);
  const pages = pagesOf(p, { agent: true });
  const from = pages.find((page) => page.id === fromPageId);
  const into = pages.find((page) => page.id === intoPageId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ mergeId: string; from: string; into: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => { if (open && !done) panel.current?.focus(); }, [open, done]);
  useEffect(() => {
    if (!done || busy) return;
    const timer = setTimeout(() => close.current(), UNDO_MS);
    return () => clearTimeout(timer);
  }, [done, busy]);
  const name = (page: ProjectPage) => DEFAULT_PAGES.some((entry) => entry.id === page.id && entry.title === page.title) ? t(page.title as MessageKey) : page.title;

  if (!open) return null;
  if (done) {
    const undo = async () => {
      setBusy(true);
      const result = await acts.unmerge(done.mergeId);
      setBusy(false);
      if (result.ok) { setDone(null); onClose(); } else setError(result.error);
    };
    return <div className={s.toast} role="status">
      <span>{t("projectPages.mergedToast", { from: done.from, into: done.into })}</span><button type="button" disabled={busy} onClick={() => void undo()}>{t("projectPages.undo")}</button>
      {error && <span className={s.error} role="alert"> {error}</span>}
    </div>;
  }
  if (!from || !into) return null;
  const plan = mergePlan(into, from);
  const rows = mergeRows(into, from);
  const hasJira = jira !== undefined && jira.projectKey !== null;
  const tag = (kind: ToolKind) => hasJira ? <span className={s.tag} data-jira={isJiraTool(kind) || undefined} title={kind === "milestones" ? t("projectJsy.tagMilestonesTitle") : undefined}>{isJiraTool(kind) && <span aria-hidden="true">⟳ </span>}{t(isJiraTool(kind) ? "projectPages.tagJira" : "projectPages.tagNextUpOnly")}</span> : null;
  const refused = plan.refused === "overview" ? "projectPages.permPageOverview" : plan.refused === "tooMany" ? "projectPages.permPageLimit" : null;
  const confirm = async () => {
    setBusy(true); setError(null);
    let id = "";
    const result = await acts.mergeNow(fromPageId, intoPageId, (mergeId) => { id = mergeId; });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setDone({ mergeId: id, from: name(from), into: name(into) });
    onMerged(intoPageId, plan.moved.map((tool) => tool.id));
  };
  return <div className={s.scrim}>
    <div ref={panel} className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="merge-title" tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape" && !busy) onClose(); }}>
      <div className={s.head}><h2 id="merge-title">{t("projectPages.mergeTitle", { from: name(from), into: name(into) })}</h2><button type="button" className={s.close} disabled={busy} aria-label={t("projectPages.close")} onClick={onClose}>×</button></div>
      <div className={s.body}>
        <p className={s.hint}>{t("projectPages.mergeOrderHint", { page: name(into) })}</p>
        <ol className={s.rows}>
          {rows.map((row, index) => <li key={index} data-mark={row.mark}>
            <span className={s.name}>{row.title || t(toolKey(row.kind))}</span>
            {tag(row.kind)}
            <span className={s.mark}>{row.mark === "on" ? t("projectPages.onPage", { page: name(into) }) : row.mark === "second" ? `${t("projectPages.fromPage", { page: name(from) })} · ${t("projectPages.secondTool", { tool: t(toolKey(row.kind)) })}` : t("projectPages.fromPage", { page: name(from) })}</span>
          </li>)}
        </ol>
        <p className={s.hint}>{t("projectPages.mergeKeepsAll")}</p>
        {hasJira && <p className={s.hint}>{t("projectPages.mergeJiraHint")}</p>}
        <p>{t("projectPages.mergePageGoesAway", { page: name(from) })}</p>
        {(error || refused) && <p className={s.error} role="alert">{error ?? t(refused as MessageKey)}</p>}
      </div>
      <div className={s.foot}>
        <button type="button" disabled={busy} onClick={onClose}>{t("projectPages.cancel")}</button>
        <button type="button" className={s.primary} disabled={busy || refused !== null} aria-busy={busy || undefined} onClick={() => void confirm()}>{busy ? t("projectPages.merging") : t("projectPages.mergeConfirm", { count: plan.moved.length, page: name(into) })}</button>
      </div>
    </div>
  </div>;
}
