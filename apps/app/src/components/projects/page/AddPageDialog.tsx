"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { addablePages, isJiraTool, LIMITS, PAGE_ICON_KEYS, pagesOf, SINGLE_KINDS, suggestPageName, TOOL_GROUPS } from "@/features/projects/pages";
import { canCreate, canNext, preselect as initialState, toolIcon, wizard } from "@/features/projects/page-wizard";
import type { PageIconKey, ProjectPage, ReducedProject, ToolKind } from "@/features/projects/types";
import type { JiraRow } from "@/features/projects/views";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { usePageActs } from "./usePageActs";
import s from "./AddPageDialog.module.css";

export type AddPageDialogProps = {
  p: ReducedProject;
  open: boolean;
  onClose: () => void;
  onCreated: (pageId: string) => void;
  preselect?: { kind: ToolKind; toolId?: string };
  /** The company's connector row, supplied by the project view. */
  jira?: JiraRow;
};
const toolKey = (kind: ToolKind, description = false) => `projectPages.tool${kind[0].toUpperCase()}${kind.slice(1)}${description ? "Description" : ""}` as MessageKey;

/** On the body, so the app's top bar (and any layer it sits in) never covers the dialog's head. */
export function AddPageDialog(props: AddPageDialogProps) {
  if (!props.open) return null;
  const dialog = <WizardDialog {...props} />;
  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body); // server markup (tests) stays in place
}

function WizardDialog({ p, onClose, onCreated, preselect, jira }: AddPageDialogProps) {
  const t = useT();
  const { flag, showToast } = useDemo();
  const acts = usePageActs(p);
  const [state, dispatch] = useReducer(wizard, preselect, initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [createdPage, setCreatedPage] = useState<string | null>(null);
  const moving = useRef(false);
  const drag = useRef<number | null>(null);
  const newTools = useRef<{ kind: ToolKind; toolId: string }[]>([]);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending.current) close.current();
      if (event.key === "Tab" && panel.current) {
        const controls = [...panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  useEffect(() => { if (state.step === 2) name.current?.focus(); }, [state.step]);
  const pages = pagesOf(p, { agent: flag("agent") });
  const gone = [...p.removed.map((item) => item.page?.id), ...Object.values(p.merges).map((merge) => merge.from.id)].filter((id): id is string => !!id);
  const ready = preselect ? [] : addablePages(pages, gone, { agent: flag("agent") });
  const hasJira = jira !== undefined && jira.projectKey !== null;
  const nameOf = (kind: ToolKind) => t(toolKey(kind));
  const tag = (kind: ToolKind) => hasJira ? <span className={s.tag} data-jira={isJiraTool(kind) || undefined} title={kind === "milestones" ? t("projectJsy.tagMilestonesTitle") : undefined}>{isJiraTool(kind) && <span aria-hidden="true">⟳ </span>}{t(isJiraTool(kind) ? "projectPages.tagJira" : "projectPages.tagNextUpOnly")}</span> : null;
  const reorder = (from: number, to: number) => dispatch({ type: "reorder", from, to });
  const suggestions = suggestPageName(state.picks.map((pick) => pick.kind));
  const create = async () => {
    if (pending.current || !canCreate(state)) return;
    pending.current = true; setBusy(true); setError(null);
    if (createdPage) return; // Retry only the unfinished move, without creating another page.
    try {
      const result = await acts.create({ title: state.name.trim(), icon: state.icon, tools: state.picks.filter((pick) => !pick.toolId).map(({ kind }) => ({ kind })) }, (id, tools) => {
        newTools.current = tools; setCreatedPage(id);
      });
      if (!result.ok) { setError(result.error); pending.current = false; setBusy(false); }
    } catch { setError(t("projectPages.notSaved")); pending.current = false; setBusy(false); }
  };
  // A ready-made page is added as it is, under its own id: no naming step.
  const addReady = async (page: ProjectPage) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const result = await acts.create({ pageId: page.id, title: page.title, icon: page.icon, tools: page.tools.map(({ kind }) => ({ kind })) });
      if (!result.ok) { setError(result.error); return; }
      showToast(t("projectPages.pageCreated", { page: t(page.title as MessageKey) }));
      onCreated(page.id); onClose();
    } catch { setError(t("projectPages.notSaved")); }
    finally { pending.current = false; setBusy(false); }
  };
  // The next render includes the persisted page in the rights snapshot. Only then may a move name it.
  useEffect(() => {
    if (!busy || !createdPage || !p.pages?.some((page) => page.id === createdPage) || moving.current) return;
    moving.current = true;
    void (async () => {
      try {
        const current = state.picks.findIndex((pick) => pick.toolId);
        if (current >= 0) {
          const nextKind = state.picks[current + 1]?.kind;
          const before = newTools.current.find((tool) => tool.kind === nextKind)?.toolId ?? null;
          const result = await acts.moveTool(state.picks[current].toolId!, createdPage, before);
          if (!result.ok) { setError(result.error); return; }
        }
        showToast(t("projectPages.pageCreated", { page: state.name.trim() }));
        onCreated(createdPage); onClose();
      } catch { setError(t("projectPages.notSaved")); }
      finally { moving.current = false; pending.current = false; setBusy(false); }
    })();
  }, [busy, createdPage, p.pages, state.picks, state.name, acts, showToast, t, onCreated, onClose]);
  const order = (preview: boolean) => <ol className={preview ? s.previewStack : s.order} aria-label={t("projectPages.toolOrderLabel")}>
    {state.picks.map((pick, i) => <li key={pick.kind} draggable={!busy && createdPage === null} onDragStart={(event) => { drag.current = i; event.dataTransfer.setData("text/plain", String(i)); }} onDragEnd={() => { drag.current = null; }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (drag.current !== null && !busy && createdPage === null) reorder(drag.current, i); drag.current = null; }}>
      <button type="button" className={s.drag} disabled={busy || createdPage !== null} aria-label={t("projectPages.dragToolLabel", { tool: nameOf(pick.kind) })} onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); reorder(i, i + (event.key === "ArrowUp" ? -1 : 1)); } }}>⠿</button>
      <span className={s.position}>{i + 1}</span><Glyph icon={toolIcon[pick.kind]} /><span className={s.toolName}>{nameOf(pick.kind)}</span>{!preview && tag(pick.kind)}
      {!preview && <button type="button" disabled={busy || createdPage !== null} aria-label={t("projectPages.removePickedToolLabel", { tool: nameOf(pick.kind) })} onClick={() => dispatch({ type: "drop", kind: pick.kind })}>×</button>}
      {preview && <div className={s.miniature} data-kind={pick.kind} aria-hidden="true"><i /><i /><i /></div>}
    </li>)}
  </ol>;
  return <div className={s.scrim}>
    <div ref={panel} tabIndex={-1} className={s.dialog} data-step={state.step} role="dialog" aria-modal="true" aria-label={t("projectPages.newPage")} aria-busy={busy}>
      <header className={s.head}><h2>{t("projectPages.newPage")}</h2><ol className={s.stepper}>
        <li aria-current={state.step === 1 ? "step" : undefined}><span>1</span>{t("projectPages.pickTools")}</li>
        <li aria-current={state.step === 2 ? "step" : undefined}><span>2</span>{t("projectPages.nameIt")}</li>
      </ol><button type="button" className={s.close} disabled={busy} aria-label={t("projectPages.closeDialogLabel")} onClick={onClose}>×</button></header>
      {state.step === 1 ? <div className={s.body}>
        <div className={s.picker}>
          {ready.length > 0 && <section aria-label={t("projectPages.readyPages")}><h3>{t("projectPages.readyPages")}</h3><p className={s.hint}>{t("projectPages.readyPagesHint")}</p><div className={s.ready}>
            {ready.map((page) => {
              const name = t(page.title as MessageKey);
              const tools = page.tools.map((tool) => nameOf(tool.kind)).join(" · ");
              return <button key={page.id} type="button" className={s.readyTile} disabled={busy} data-ready={page.id} onClick={() => void addReady(page)}>
                <span className={s.glyph}><Glyph icon={page.icon} /></span>
                <span className={s.readyText}><strong>{name}</strong>{tools !== name && <span className={s.description}>{tools}</span>}</span>
              </button>;
            })}
          </div></section>}
          <p>{t("projectPages.pickToolsHint")}{hasJira && <> {t("projectPages.jiraPickerHint", { project: jira.projectKey! })}</>}</p>
          {TOOL_GROUPS.map((group) => <section key={group.title}><h3>{t(group.title as MessageKey)}</h3><div className={s.tiles}>
            {group.kinds.filter((kind) => kind !== "agent" || flag("agent")).map((kind) => {
              const index = state.picks.findIndex((pick) => pick.kind === kind);
              const exists = SINGLE_KINDS.includes(kind) && pages.some((page) => page.tools.some((tool) => tool.kind === kind && tool.id !== preselect?.toolId));
              return <button key={kind} type="button" className={s.tile} aria-pressed={index >= 0} disabled={exists} title={exists ? t("projectPages.alreadyInProject") : undefined} onClick={() => dispatch({ type: index >= 0 ? "unpick" : "pick", kind })}>
                <span className={s.tileTop}><span className={s.glyph}><Glyph icon={toolIcon[kind]} /></span>{tag(kind)}</span><strong>{nameOf(kind)}</strong><span className={s.description}>{t(toolKey(kind, true))}</span>{index >= 0 && <span className={s.number}>{index + 1}</span>}
              </button>;
            })}
          </div></section>)}
        </div><aside className={s.preview} aria-label={t("projectPages.previewLabel")}><h3>{t("projectPages.yourPage")}</h3>{state.picks.length ? <div className={s.previewPage}>{order(true)}<p className={s.nextTool}>{t("projectPages.nextToolHere")}</p></div> : <p>{t("projectPages.pickToolsEmpty")}</p>}<p>{t("projectPages.previewHint")}</p></aside>
      </div> : <div className={s.naming}>
        <label className={s.label}>{t("projectPages.pageName")}<input ref={name} value={state.name} maxLength={LIMITS.titleMax} placeholder={t(suggestions[0] as MessageKey)} onChange={(event) => dispatch({ type: "name", name: event.target.value })} disabled={busy || createdPage !== null} aria-describedby="page-name-hint" /></label>
        <p id="page-name-hint" className={s.hint}>{t("projectPages.pageNameHint")}</p>
        <div className={s.suggestions}><span>{t("projectPages.nameSuggestions")}</span>{suggestions.map((key) => <button key={key} type="button" disabled={busy || createdPage !== null} onClick={() => dispatch({ type: "name", name: t(key as MessageKey) })}>{t(key as MessageKey)}</button>)}</div>
        <fieldset className={s.icons} disabled={busy || createdPage !== null}><legend>{t("projectPages.sidebarIcon")}</legend>{PAGE_ICON_KEYS.map((icon) => <button key={icon} type="button" aria-label={t("projectPages.chooseIconLabel", { icon })} aria-pressed={state.icon === icon} onClick={() => dispatch({ type: "icon", icon })}><Glyph icon={icon} /></button>)}</fieldset>
        <section><h3>{t("projectPages.toolsInOrder")}</h3>{order(false)}<p className={s.hint}>{hasJira && p.sync?.on && state.picks.some((pick) => isJiraTool(pick.kind)) ? <>{t("projectPages.jiraToolsHint", { project: jira.projectKey! })} </> : null}{t("projectPages.sameStepsHint")}</p></section>
      </div>}
      {error && <p role="alert" className={s.error}>{error}</p>}
      <footer className={s.foot}>{state.step === 1 ? <>{state.picks.length > 0 && <><span>{t("projectPages.toolsPicked", { count: state.picks.length })}</span><button type="button" onClick={() => dispatch({ type: "clear" })}>{t("projectPages.clear")}</button></>}</> : <button type="button" disabled={busy || createdPage !== null} onClick={() => dispatch({ type: "back" })}>‹ {t("projectPages.back")}</button>}<span className={s.spacer} /><button type="button" disabled={busy} onClick={onClose}>{t("projectPages.cancel")}</button>{state.step === 1 ? <button type="button" className={s.primary} disabled={!canNext(state)} onClick={() => dispatch({ type: "next" })}>{t("projectPages.nextName")} →</button> : <button type="button" className={s.primary} disabled={busy || !canCreate(state)} onClick={() => void create()}>{t(busy ? "projectPages.creatingPage" : "projectPages.createPage")}</button>}</footer>
    </div>
  </div>;
}

function Glyph({ icon }: { icon: PageIconKey }) {
  const paths: Record<PageIconKey, React.ReactNode> = {
    home: <path d="m2 7 6-5 6 5v7H2z" />, board: <><rect x="2" y="2" width="12" height="12" rx="2" /><path d="M6 2v12M10 2v12" /></>,
    list: <path d="M6 4h8M6 8h8M6 12h8M2 4h1M2 8h1M2 12h1" />, calendar: <><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6h12M5 2v3M11 2v3" /></>,
    timeline: <path d="M2 4h7M5 8h9M3 12h7" />, flag: <path d="M3 14V2h10l-2 3 2 3H3" />, target: <><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2" /></>,
    folder: <path d="M2 4h5l2 2h5v7H2z" />, link: <path d="m6 10 4-4M6 6l2-2a3 3 0 0 1 4 4l-2 2M10 10l-2 2a3 3 0 0 1-4-4l2-2" />,
    inbox: <path d="m2 10 2-7h8l2 7v3H2zM2 10h4l1 2h2l1-2h4" />, people: <><circle cx="6" cy="5" r="2" /><path d="M2 14v-2a4 4 0 0 1 8 0v2M11 3a2 2 0 0 1 0 4M12 9q3 0 3 5" /></>,
    pulse: <path d="M1 8h3l2-5 4 10 2-5h3" />, doc: <><path d="M4 2h6l3 3v9H4zM10 2v4h3M6 9h5M6 12h4" /></>, checklist: <path d="m2 4 1 1 2-2M7 4h7m-12 7 1 1 2-2M7 11h7" />,
    table: <><rect x="2" y="2" width="12" height="12" rx="1" /><path d="M2 6h12M2 10h12M6 2v12" /></>, star: <path d="m8 2 2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z" />, chat: <path d="M2 2h12v9H6l-4 3z" />, box: <path d="m2 5 6-3 6 3v7l-6 3-6-3zM2 5l6 3 6-3M8 8v7" />,
  };
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">{paths[icon]}</svg>;
}
