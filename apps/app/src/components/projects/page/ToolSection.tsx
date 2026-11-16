"use client";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { dropBefore, fillsPage, TOOL_GLYPH, toolCount } from "@/features/projects/page-view";
import { isJiraTool } from "@/features/projects/pages";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import { TOOL_REGISTRY } from "../tools/registry";
import type { ToolProps } from "../tools/types";
import { ToolMenu } from "./ToolMenu";
import { usePageActs } from "./usePageActs";
import styles from "./ToolSection.module.css";

export type ToolSectionProps = ToolProps & {
  index: number;
  count: number;
  onAddAt: (index: number) => void;
};

const MIME = "application/x-nextup-tool";

/** One section of a page: its head (grip, name, Jira line, count line, Collapse, ⋯) and the tool's body (D8). */
export function ToolSection({ p, page, tool, jira, editor, hints }: ToolSectionProps) {
  const t = useT();
  const acts = usePageActs(p);
  const Tool = TOOL_REGISTRY[tool.kind];
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drop, setDrop] = useState<"before" | "after" | null>(null);
  const [dragging, setDragging] = useState(false);
  const section = useRef<HTMLElement>(null);
  const kindName = t(`projectPages.tool${tool.kind[0].toUpperCase()}${tool.kind.slice(1)}` as MessageKey);
  const name = tool.title ?? kindName;
  const syncing = isJiraTool(tool.kind) && p.sync?.system === "jira" && p.sync.on;
  const n = toolCount(p, tool.kind);
  const countKey: MessageKey | null = tool.kind === "calendar" || tool.kind === "timeline" ? "projectPages.datedStepsCount" : tool.kind === "board" || tool.kind === "list" ? "projectPages.stepsCount" : tool.kind === "links" ? "projectPages.itemsCount" : null;
  const countLine = n !== null && countKey ? t(countKey, { count: n }) : null;
  const bodyId = `tool-body-${tool.id}`;

  const submitRename = async (e: FormEvent) => {
    e.preventDefault();
    const next = title.trim();
    if (!next || next === name) { setRenaming(false); return; }
    const result = await acts.editTool(tool.id, { title: next });
    if (result.ok) { setRenaming(false); setError(null); } else setError(result.error);
  };
  const half = (e: DragEvent) => { const r = section.current?.getBoundingClientRect(); return r ? e.clientY < r.top + r.height / 2 : true; };
  const onDragOver = (e: DragEvent) => {
    if (!editor || !e.dataTransfer.types.includes(MIME)) return;
    e.preventDefault();
    setDrop(half(e) ? "before" : "after");
  };
  const onDrop = async (e: DragEvent) => {
    const from = e.dataTransfer.getData(MIME);
    const upper = half(e);
    setDrop(null);
    if (!editor || !from) return;
    e.preventDefault();
    const before = dropBefore(page, from, tool.id, upper);
    if (before !== undefined) await acts.moveTool(from, page.id, before);
  };

  // A page's first Board is the page (Paper "Jira pages · new header"): no frame and no name row, the page header is its head.
  if (fillsPage(page, tool)) return <section className={styles.fill} aria-label={name} data-fills-page="" data-collapsed="false">
    <Tool p={p} page={page} tool={tool} jira={jira} editor={editor} hints={hints} />
  </section>;

  return <section ref={section} className={styles.section} aria-label={name} data-collapsed={tool.collapsed ? "true" : "false"} data-drop={drop ?? undefined} data-dragging={dragging ? "true" : undefined}
    onDragOver={onDragOver} onDragLeave={() => setDrop(null)} onDrop={(e) => void onDrop(e)}>
    <header className={styles.head}>
      {editor && <button type="button" className={styles.grip} draggable aria-label={t("projectPages.dragToolLabel", { tool: name })}
        onDragStart={(e) => { e.dataTransfer.setData(MIME, tool.id); e.dataTransfer.effectAllowed = "move"; if (section.current) e.dataTransfer.setDragImage(section.current, 16, 16); setDragging(true); }}
        onDragEnd={() => { setDragging(false); setDrop(null); }}>⋮⋮</button>}
      <span className={styles.glyph} aria-hidden="true">{TOOL_GLYPH[tool.kind]}</span>
      {renaming
        ? <form className={styles.rename} onSubmit={(e) => void submitRename(e)}>
            <input className="nh-input" autoFocus aria-label={t("projectPages.sectionName")} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setRenaming(false); }} />
            <button type="submit" className="nh-btn nh-btn-primary nh-btn-sm">{t("projectPages.save")}</button>
            {error && <span role="alert" className={styles.line}>{error}</span>}
          </form>
        : <h2 className={styles.name}>{name}</h2>}
      <span className={`${styles.line} ${styles.grow}`}>
        {syncing && <span className={styles.sync}>⟳ {t("projectPages.syncedWithJira")}</span>}
        {syncing && countLine && " · "}{countLine}
      </span>
      {editor && <button type="button" className={styles.headButton} aria-expanded={!tool.collapsed} aria-controls={bodyId} onClick={() => void acts.editTool(tool.id, { collapsed: !tool.collapsed })}>
        {tool.collapsed ? `${t("projectPages.expand")} ⌄` : `${t("projectPages.collapse")} ⌃`}
      </button>}
      <ToolMenu p={p} page={page} tool={tool} jira={jira} editor={editor} name={name} onRename={() => { setTitle(name); setRenaming(true); }} />
    </header>
    {!tool.collapsed && <div id={bodyId} className={styles.body}><Tool p={p} page={page} tool={tool} jira={jira} editor={editor} hints={hints} /></div>}
  </section>;
}
