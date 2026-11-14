"use client";
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { isJiraTool, pagesOf } from "@/features/projects/pages";
import { stepBefore, toolMenuItems, type ToolMenuItemId } from "@/features/projects/page-view";
import type { ProjectPage, ReducedProject, ToolInstance } from "@/features/projects/types";
import type { JiraRow } from "@/features/projects/views";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { AddPageDialog } from "./AddPageDialog";
import { usePageActs } from "./usePageActs";
import styles from "./ToolSection.module.css";

export type ToolMenuProps = { p: ReducedProject; page: ProjectPage; tool: ToolInstance; jira: JiraRow; editor: boolean; name: string; onRename: () => void };

/** A toast with Undo that outlives the section it came from: the removed tool's section is gone by then. */
function undoToast(message: string, label: string, onUndo: () => void) {
  const box = document.createElement("div");
  box.className = styles.toast;
  box.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = message;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  const done = () => { window.clearTimeout(timer); box.remove(); };
  const timer = window.setTimeout(done, 8000);
  button.addEventListener("click", () => { onUndo(); done(); });
  box.append(text, button);
  document.body.append(box);
}

const LABEL: Record<ToolMenuItemId, MessageKey> = {
  collapse: "projectPages.collapse", expand: "projectPages.expand", moveUp: "projectPages.moveUp", moveDown: "projectPages.moveDown",
  rename: "projectPages.renameSection", openJira: "projectPages.openInJira", moveToPage: "projectPages.moveToPage", remove: "projectPages.removeTool",
};
const ARROW: Partial<Record<ToolMenuItemId, string>> = { moveUp: "↑", moveDown: "↓", openJira: "↗", moveToPage: "›" };

export function ToolMenu({ p, page, tool, jira, editor, name, onRename }: ToolMenuProps) {
  const t = useT();
  const acts = usePageActs(p);
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<"move" | "remove" | null>(null);
  const [newPage, setNewPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const jiraSyncing = isJiraTool(tool.kind) && p.sync?.system === "jira" && p.sync.on;
  const items = toolMenuItems(page, tool, { editor, jiraSyncing });
  const others = pagesOf(p, { agent: false }).filter((x) => x.id !== page.id);
  const jiraHref = jira.siteUrl && jira.projectKey ? `${jira.siteUrl.replace(/\/$/, "")}/browse/${encodeURIComponent(jira.projectKey)}` : jira.siteUrl;

  useEffect(() => { if (open) wrap.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus(); }, [open, sub]);
  if (items.length === 0 && !newPage) return null;

  const close = (refocus = true) => { setOpen(false); setSub(null); setError(null); if (refocus) trigger.current?.focus(); };
  const run = async (action: Promise<{ ok: true } | { ok: false; error: string }>, then?: () => void) => {
    const result = await action;
    if (result.ok) { close(false); then?.(); } else setError(result.error);
  };
  const choose = (id: ToolMenuItemId) => {
    if (id === "collapse" || id === "expand") void run(acts.editTool(tool.id, { collapsed: !tool.collapsed }));
    else if (id === "moveUp" || id === "moveDown") { const before = stepBefore(page, tool.id, id === "moveUp" ? "up" : "down"); if (before !== undefined) void run(acts.moveTool(tool.id, page.id, before)); }
    else if (id === "rename") { close(false); onRename(); }
    else if (id === "moveToPage") setSub("move");
    else if (id === "remove") setSub("remove");
  };
  const remove = () => void run(acts.removeTool(tool.id), () => undoToast(t("projectPages.toolRemoved", { tool: name, page: page.title }), t("projectPages.undo"), () => void acts.restoreTool(tool.id)));
  const moveTo = (toPageId: string, title: string) => void run(acts.moveTool(tool.id, toPageId, null), () => undoToast(t("projectPages.toolMoved", { tool: name, page: title }), t("projectPages.undo"), () => void acts.moveTool(tool.id, page.id, null)));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); if (sub) setSub(null); else close(); return; }
    if (e.key === "Tab") { close(false); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const nodes = [...(wrap.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const at = nodes.indexOf(document.activeElement as HTMLElement);
    nodes[(at + (e.key === "ArrowDown" ? 1 : nodes.length - 1)) % nodes.length]?.focus();
  };

  return <div className={styles.menuWrap} ref={wrap} onBlur={(e) => { if (open && !newPage && !e.currentTarget.contains(e.relatedTarget)) close(false); }}>
    {items.length > 0 && <button ref={trigger} type="button" className={styles.headButton} aria-haspopup="menu" aria-expanded={open} aria-label={t("projectPages.toolMenuLabel", { tool: name })} onClick={() => (open ? close(false) : setOpen(true))}>⋯</button>}
    {open && <div role="menu" className={styles.pop} aria-label={t("projectPages.toolMenuLabel", { tool: name })} onKeyDown={onKey}>
      {sub === null && items.map((item) => {
        const dividerBefore = item.id === "remove";
        const body = item.id === "remove"
          ? <><span>{t(LABEL.remove)}</span><span className={styles.hint}>{t("projectPages.removeToolHint")}</span></>
          : <><span>{t(LABEL[item.id])}</span>{ARROW[item.id] && <span className={styles.arrow} aria-hidden="true">{ARROW[item.id]}</span>}</>;
        return <Fragment key={item.id}>
          {dividerBefore && <div className={styles.rule} role="separator" />}
          {item.id === "openJira" && jiraHref
            ? <a role="menuitem" className={styles.item} href={jiraHref} target="_blank" rel="noopener noreferrer" onClick={() => close(false)}>{body}</a>
            : <button type="button" role="menuitem" className={styles.item} data-danger={item.id === "remove" ? "true" : undefined} onClick={() => choose(item.id)}>{body}</button>}
        </Fragment>;
      })}
      {sub === "move" && <>
        <div className={styles.subHead}>{t("projectPages.moveToolTo", { tool: name })}</div>
        {others.map((x) => <button key={x.id} type="button" role="menuitem" className={styles.item} onClick={() => moveTo(x.id, x.title)}>{x.title}</button>)}
        {others.length === 0 && <span className={styles.hint}>{t("projectPages.noOtherPages")}</span>}
        <div className={styles.rule} role="separator" />
        <button type="button" role="menuitem" className={`${styles.item} ${styles.link}`} onClick={() => { setNewPage(true); setOpen(false); }}>+ {t("projectPages.newPageDestination")}</button>
      </>}
      {sub === "remove" && <div className={styles.confirm}>
        <span>{t("projectPages.removeToolHint")}</span>
        <div className={styles.confirmActions}>
          <button type="button" role="menuitem" className="nh-btn nh-btn-danger nh-btn-sm" onClick={remove}>{t("projectPages.removeTool")}</button>
          <button type="button" role="menuitem" className="nh-btn nh-btn-ghost nh-btn-sm" onClick={() => setSub(null)}>{t("common.cancel")}</button>
        </div>
      </div>}
      {error && <p role="alert" className={styles.hint}>{error}</p>}
    </div>}
    {newPage && <AddPageDialog p={p} open onClose={() => setNewPage(false)} onCreated={() => setNewPage(false)} preselect={{ kind: tool.kind, toolId: tool.id }} jira={jira} />}
  </div>;
}
