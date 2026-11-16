"use client";
// The gear of the Files page (Paper "Files · 3", frames 7.1-7.3). The page shows the file browser only; the gear opens
// "On this page": the idea (its own page), Connected tools, Sources and the page's other tools, each in a side sheet.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { toolsBehindGear, type FilesSheet } from "@/features/files/settings";
import { toolCount } from "@/features/projects/page-view";
import type { ProjectPage, ReducedProject, ToolInstance } from "@/features/projects/types";
import { connectionsOf, type JiraRow, type StepHint } from "@/features/projects/views";
import type { MessageKey } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import { ToolsPanel } from "../ProjectTeam";
import { TOOL_REGISTRY } from "../tools/registry";
import { FILES_SYNCED, type FilesSynced } from "./FileStates";
import { agoText } from "./SourcePopover";
import { SourcesPanel, useRaisedFiles } from "./SourcesPanel";
import styles from "./FilesSettings.module.css";

export type FilesSettingsProps = { p: ReducedProject; page: ProjectPage; jira: JiraRow; editor: boolean; hints: StepHint[]; onAddTool: () => void };

const GEAR = <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
  <circle cx="12" cy="12" r="3" />
</svg>;

/** "3 min ago" since the Files list last read its folder; it ticks every half minute, and is undefined until the first read. */
export function useFilesSyncedAgo(projectId: string): string | undefined {
  const locale = useLocale();
  const [at, setAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const heard = (e: Event) => { const d = (e as CustomEvent<FilesSynced>).detail; if (d.projectId === projectId) { setAt(d.at); setNow(new Date()); } };
    window.addEventListener(FILES_SYNCED, heard);
    const tick = window.setInterval(() => setNow(new Date()), 30_000);
    return () => { window.removeEventListener(FILES_SYNCED, heard); window.clearInterval(tick); };
  }, [projectId]);
  return at ? agoText(at, now, locale) : undefined;
}

export function FilesSettings({ p, page, jira, editor, hints, onAddTool }: FilesSettingsProps) {
  const t = useT();
  const { href } = useDemo();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<FilesSheet | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const gear = useRef<HTMLButtonElement>(null);
  const raised = useRaisedFiles(p).length;
  const tools = toolsBehindGear(page);
  const toolName = (tool: ToolInstance) => tool.title ?? t(`projectPages.tool${tool.kind[0].toUpperCase()}${tool.kind.slice(1)}` as MessageKey);
  const connections = connectionsOf(p).length;

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const show = (next: FilesSheet) => { setOpen(false); setSheet(next); };
  const back = () => { setSheet(null); setOpen(true); };
  const close = () => { setSheet(null); gear.current?.focus(); };
  const shown = sheet?.kind === "tool" ? tools.find((tool) => tool.id === sheet.id) ?? null : null;
  const Tool = shown ? TOOL_REGISTRY[shown.kind] : null;
  const toolSub = (tool: ToolInstance) => {
    const n = toolCount(p, tool.kind);
    return n === null ? null : n === 0 ? t("projectFiles.settingsNoneYet") : t("projectPages.itemsCount", { count: n });
  };

  return <div className={styles.wrap} ref={wrap} data-testid="files-settings">
    <button ref={gear} type="button" className={styles.gear} aria-label={t("projectFiles.settings")} data-tip={t("projectFiles.settings")}
      aria-haspopup="menu" aria-expanded={open || sheet !== null} data-open={open || sheet !== null || undefined} onClick={() => { setSheet(null); setOpen(!open); }}>{GEAR}</button>

    {open && <div className={styles.menu} role="menu" aria-label={t("projectFiles.settings")} onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); gear.current?.focus(); } }}>
      <span className={styles.menuHead}>{t("projectFiles.settingsOnPage")}</span>
      <Link role="menuitem" className={styles.item} href={href(`/projects/${p.id}?page=overview`)} onClick={() => setOpen(false)}>
        <Text name={t("projectFiles.settingsIdea")} sub={p.title} />
        <span className={styles.end} aria-hidden="true">↗</span>
      </Link>
      <button type="button" role="menuitem" className={styles.item} autoFocus onClick={() => show({ kind: "tools" })}>
        <Text name={t("projectFiles.settingsTools")} sub={[t(jira.state === "synced" ? "projectFiles.settingsJiraOn" : "projectFiles.settingsJiraOff"), t("projectFiles.settingsToolsCount", { count: connections })].join(" · ")} />
        <span className={styles.end} aria-hidden="true">›</span>
      </button>
      <button type="button" role="menuitem" className={styles.item} onClick={() => show({ kind: "sources" })}>
        <Text name={t("projectFiles.settingsSources")} sub={[t("projectFiles.settingsSourcesCount", { count: p.sources.length }), raised ? t("projectFiles.settingsRaised", { count: raised }) : t("projectFiles.settingsRaisedNone")].join(" · ")} />
        <span className={styles.end} aria-hidden="true">›</span>
      </button>
      {tools.map((tool) => <button key={tool.id} type="button" role="menuitem" className={styles.item} onClick={() => show({ kind: "tool", id: tool.id })}>
        <Text name={toolName(tool)} sub={toolSub(tool)} />
        <span className={styles.end} aria-hidden="true">›</span>
      </button>)}
      {editor && <>
        <span className={styles.rule} role="separator" />
        <button type="button" role="menuitem" className={styles.item} onClick={() => { setOpen(false); onAddTool(); }}>
          <span className={styles.add}>+ {t("projectPages.addToolToPage")}</span>
        </button>
      </>}
    </div>}

    {sheet && createPortal(<aside className={styles.sheet} role="dialog" aria-modal="false" aria-labelledby="files-sheet-title" data-testid="files-settings-sheet"
      onKeyDown={(e) => { if (e.key === "Escape") close(); }}>
      <div className={styles.sheetHead}>
        <div className={styles.sheetBar}>
          <button type="button" className={styles.back} onClick={back}>‹ {t("projectFiles.settings")}</button>
          <button type="button" className={styles.close} aria-label={t("projectFiles.settingsClose")} autoFocus onClick={close}>×</button>
        </div>
        <h2 id="files-sheet-title" className={styles.sheetTitle}>{sheet.kind === "tools" ? t("projectFiles.settingsTools") : sheet.kind === "sources" ? t("projectFiles.settingsSources") : shown ? toolName(shown) : ""}</h2>
        {sheet.kind !== "tool" && <p className={styles.sheetSub}>{t(sheet.kind === "tools" ? "projectFiles.settingsToolsSub" : "projectFiles.settingsSourcesSub")}</p>}
      </div>
      <div className={styles.body}>
        {sheet.kind === "tools" && <ToolsPanel p={p} jira={jira} />}
        {sheet.kind === "sources" && <SourcesPanel p={p} />}
        {shown && Tool && <Tool p={p} page={page} tool={shown} jira={jira} editor={editor} hints={hints} />}
      </div>
    </aside>, document.body)}
  </div>;
}

function Text({ name, sub }: { name: string; sub: string | null }) {
  return <span className={styles.text}>
    <span className={styles.name}>{name}</span>
    {sub && <span className={styles.sub}>{sub}</span>}
  </span>;
}
