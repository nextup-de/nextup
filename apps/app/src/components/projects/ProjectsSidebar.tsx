"use client";
// The Projects sidebar (Paper page "Projects page", frames C1-C6). On top the area's pages (Overview,
// Decisions, Collaboration, Progress). Below them two layers: layer 1 lists your projects, one line each,
// with a ring that fills as the project moves along and an orange dot when it is late; pick one and layer 2
// takes its place: a way back, the project's title and status, and its pages. A project's team may add
// pages (page, checklist, table, link), drag any page to a new place, and rename, re-icon or delete their
// own; viewers only read. The added pages are a stand-in (projectPagesPreview.ts).
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { sectionTabsFor, type ProjectsTabKey } from "@/config/nav";
import { decisionsWaiting } from "@/features/metrics";
import { PROJECT_TABS, projectTabOf, tabQuery, type ProjectTab } from "@/features/projects/tabs";
import {
  PAGE_ICONS, PAGE_KINDS, addPage, daysLate, movePage, pageList, removePage, ringOf, sidebarProjects, updatePage,
  type CustomPage, type PageEntry, type PageIcon, type PageKind, type Ring,
} from "@/features/projects/sidebar";
import { visibleProjectsFor } from "@/features/projects/views";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { idViewerOf, useRights } from "./parts";
import { newPageId, useProjectPages } from "./projectPagesPreview";
import s from "./ProjectsSidebar.module.css";

const MAX_ROWS = 8; // layer 1 shows this many; "All n projects" opens the rest

export function ProjectsSidebar({ area, projectId, onHide }: { area: ProjectsTabKey | null; projectId: string | null; onHide: () => void }) {
  const ctx = useDemo();
  const t = useT();
  const { S, D, demo, href, role, serverMode } = ctx;
  const [query, setQuery] = useState("");
  // Layer 2 shows while a project is open; "‹ Your projects" (or a search) goes back to layer 1 without leaving the page.
  const [listFor, setListFor] = useState<string | null>(null); // the project whose page was open when the list was asked for
  const listOpen = projectId !== null && listFor === projectId;
  const all = visibleProjectsFor(S, idViewerOf(ctx), demo);
  const open = projectId ? all.find((p) => p.id === projectId) ?? null : null;
  const layer2 = open && !listOpen && !query;
  const nav = sectionTabsFor("projects", { role, serverMode });
  const waiting = decisionsWaiting(D).length;

  return (
    <div className={s.sb}>
      <div className={s.top}>
        <div className={s.search}>
          <Svg size={14}><circle cx="6.2" cy="6.2" r="4.2" /><path d="M9.3 9.3L12 12" /></Svg>
          <input className={s.searchInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("projects.sbSearch")} aria-label={t("projects.sbSearch")} />
        </div>
        <button type="button" className={s.iconBtn} onClick={onHide} title={t("projects.sbHide")} aria-label={t("projects.sbHide")}>
          <Svg size={16}><rect x="2" y="3" width="12" height="10" rx="2" /><path d="M6 3V13" /></Svg>
        </button>
      </div>

      <nav className={s.area} aria-label={t("projects.sbLabel")}>
        {nav.map((n) => (
          <Link key={n.key} href={href(n.href)} className={s.row} aria-current={!open && area === n.key ? "page" : undefined}>
            <span className={s.slot}><AreaIcon k={n.key} /></span>
            <span className={s.label}>{t(n.labelKey)}</span>
            {n.key === "decisions" && waiting > 0 && <span className={s.count} data-tone="brand">{waiting}</span>}
          </Link>
        ))}
      </nav>

      <div className={s.lower}>
        {layer2 && open ? (
          <ProjectPages p={open} onBack={() => setListFor(open.id)} />
        ) : (
          <ProjectList list={all} query={query} openId={open?.id ?? null} />
        )}
      </div>
    </div>
  );
}

// ── Layer 1 ─────────────────────────────────────────────────────────────────────────────────────────

function ProjectList({ list, query, openId }: { list: ReducedProject[]; query: string; openId: string | null }) {
  const { href } = useDemo();
  const t = useT();
  const rows = sidebarProjects(list, query);
  return (
    <div className={s.layer}>
      <span className={s.group}>{t("projects.sbYourProjects")}</span>
      {rows.slice(0, query ? undefined : MAX_ROWS).map((p) => (
        <Link key={p.id} href={href("/projects/" + p.id)} className={s.row} data-project aria-current={p.id === openId ? "page" : undefined}>
          <span className={s.slot}><RingMark ring={ringOf(p.status)} /></span>
          <span className={s.label}>{p.title}</span>
          {p.overdue && <span className={s.late} title={t("projects.sbLateHint")} aria-label={t("projects.sbLateHint")} />}
          <span className={s.chev} aria-hidden="true"><Svg size={14}><path d="M5.4 3.2L9.2 7L5.4 10.8" /></Svg></span>
        </Link>
      ))}
      {!rows.length && <span className={s.empty}>{query ? t("projects.sbNoMatches") : t("projects.sbNone")}</span>}
      {!query && list.length > 0 && (
        <Link href={href("/projects")} className={s.row} data-quiet>
          <span className={s.slot}><Svg size={12} fill><circle cx="2.4" cy="6" r="1.1" /><circle cx="6" cy="6" r="1.1" /><circle cx="9.6" cy="6" r="1.1" /></Svg></span>
          <span className={s.label}>{t("projects.sbAll", { count: list.length })}</span>
        </Link>
      )}
    </div>
  );
}

// ── Layer 2 ─────────────────────────────────────────────────────────────────────────────────────────

type Menu = { kind: "add" } | { kind: "page"; id: string; icons: boolean; sure: boolean };

function ProjectPages({ p, onBack }: { p: ReducedProject; onBack: () => void }) {
  const ctx = useDemo();
  const { S, href, tenant } = ctx;
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const editor = useRights(p).addStep; // the project's team (lead, members, a manager); viewers only read
  const [pages, setPages] = useProjectPages(tenant.slug, p.id);
  const entries = pageList(pages);
  const tab = projectTabOf(params.get("tab") ?? undefined);
  const pageId = params.get("page");
  const currentKey = pageId && pages.pages.some((x) => x.id === pageId) ? pageId : tab;

  const [menu, setMenu] = useState<(Menu & { x: number; y: number }) | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; over: string | null; before: boolean } | null>(null);
  const late = daysLate(p, S.day);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);
  const base = href("/projects/" + p.id);
  const urlOf = (e: PageEntry) => (e.kind === "tab" ? base + tabQuery(e.key) : base + "?page=" + e.page.id);
  const keyOf = (e: PageEntry) => (e.kind === "tab" ? e.key : e.page.id);
  const counts: Partial<Record<ProjectTab, number>> = { board: p.steps.length, team: p.members.length + 1 };

  const openMenu = (m: Menu, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setMenu({ ...m, x: r.right + 6, y: m.kind === "add" ? Math.max(8, r.bottom - 300) : r.top });
  };
  const add = (kind: PageKind) => {
    const id = newPageId();
    setPages((st) => addPage(st, kind, id, t(("projects.kind_" + kind) as "projects.kind_page")));
    setMenu(null);
    setRenaming(id);
    router.push(base + "?page=" + id);
  };
  const drop = () => {
    if (!drag?.over) return setDrag(null);
    const keys = entries.map(keyOf);
    const at = keys.indexOf(drag.over);
    const before = drag.before ? drag.over : keys[at + 1] ?? null;
    setPages((st) => movePage(st, drag.id, before === drag.id ? keys[at + 2] ?? null : before));
    setDrag(null);
  };

  return (
    <div className={s.layer}>
      <button type="button" className={s.back} onClick={onBack}>
        <span className={s.slot}><Svg size={14}><path d="M8.6 3.2L4.8 7L8.6 10.8" /></Svg></span>
        <span className={s.label}>{t("projects.sbYourProjects")}</span>
      </button>
      <div className={s.head}>
        <span className={s.headSlot}><RingMark ring={ringOf(p.status)} /></span>
        <span className={s.headText}>
          <span className={s.headTitle}>{p.title}</span>
          <span className={s.headMeta}>
            {t(("projects.status_" + p.status) as "projects.status_planning")}
            {late > 0 && <><span className={s.dotSep} aria-hidden="true" /><span className={s.lateText}>{t("projects.sbLate", { count: late })}</span></>}
          </span>
        </span>
      </div>

      <span className={s.group}>{t("projects.sbPages")}</span>
      <nav className={s.pages} aria-label={t("projects.tabsLabel")} onDragEnd={() => setDrag(null)}>
        {entries.map((e) => {
          const k = keyOf(e);
          const custom = e.kind === "custom" ? e.page : null;
          const label = e.kind === "custom" ? e.page.title : t(("projects.tab_" + e.key) as "projects.tab_overview");
          const count = e.kind === "tab" ? counts[e.key] : undefined;
          const dropAt = drag && drag.over === k && drag.id !== k ? (drag.before ? "before" : "after") : undefined;
          if (renaming === k && custom) {
            return <RenameRow key={k} page={custom} onDone={(title) => { if (title !== null) setPages((st) => updatePage(st, k, { title })); setRenaming(null); }} />;
          }
          return (
            <div key={k} className={s.pageRow} data-drop={dropAt} data-dragging={drag?.id === k || undefined}
              draggable={editor} onDragStart={(ev) => { ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", k); setDrag({ id: k, over: null, before: true }); }}
              onDragOver={(ev) => {
                if (!drag) return;
                ev.preventDefault();
                const r = ev.currentTarget.getBoundingClientRect();
                const before = ev.clientY < r.top + r.height / 2;
                if (drag.over !== k || drag.before !== before) setDrag({ ...drag, over: k, before });
              }}
              onDrop={(ev) => { ev.preventDefault(); drop(); }}>
              <Link href={urlOf(e)} className={s.row} aria-current={currentKey === k ? "page" : undefined} draggable={false}>
                <span className={s.slot}>
                  <span className={s.icon}>{custom ? <PageGlyph icon={custom.icon} /> : <TabIcon k={e.kind === "tab" ? e.key : "overview"} />}</span>
                  {editor && <span className={s.grip} title={t("projects.sbDrag")}><Svg size={16} fill><circle cx="6" cy="4" r="1.1" /><circle cx="10" cy="4" r="1.1" /><circle cx="6" cy="8" r="1.1" /><circle cx="10" cy="8" r="1.1" /><circle cx="6" cy="12" r="1.1" /><circle cx="10" cy="12" r="1.1" /></Svg></span>}
                </span>
                <span className={s.label}>{label}</span>
                {count !== undefined && <span className={s.count}>{count}</span>}
              </Link>
              {editor && custom && (
                <button type="button" className={s.more} data-open={menu?.kind === "page" && menu.id === k || undefined} aria-label={t("projects.sbMore", { page: label })}
                  onClick={(ev) => openMenu({ kind: "page", id: k, icons: false, sure: false }, ev.currentTarget)}>
                  <Svg size={14} fill><circle cx="3" cy="7" r="1.1" /><circle cx="7" cy="7" r="1.1" /><circle cx="11" cy="7" r="1.1" /></Svg>
                </button>
              )}
            </div>
          );
        })}
        {editor && (
          <button type="button" className={s.row} data-quiet onClick={(ev) => openMenu({ kind: "add" }, ev.currentTarget)}>
            <span className={s.slot}><Svg size={14}><path d="M7 3V11M3 7H11" /></Svg></span>
            <span className={s.label}>{t("projects.sbAddPage")}</span>
          </button>
        )}
      </nav>

      {menu && (
        <>
          <button type="button" className={s.scrim} aria-label={t("common.cancel")} onClick={() => setMenu(null)} />
          <div className={s.menu} data-kind={menu.kind} role="menu" style={{ "--mx": menu.x + "px", "--my": menu.y + "px" } as React.CSSProperties}>
            {menu.kind === "add" ? (
              <>
                <span className={s.menuHead}>{t("projects.sbAddTitle")}</span>
                {PAGE_KINDS.map((k) => (
                  <button key={k} type="button" role="menuitem" className={s.kind} onClick={() => add(k)}>
                    <span className={s.slot}><PageGlyph icon={k === "page" ? "doc" : k} /></span>
                    <span className={s.kindText}>
                      <span className={s.kindName}>{t(("projects.kind_" + k) as "projects.kind_page")}</span>
                      <span className={s.kindSub}>{t(("projects.kind_" + k + "Sub") as "projects.kind_pageSub")}</span>
                    </span>
                  </button>
                ))}
              </>
            ) : (
              <PageMenu m={menu}
                onRename={() => { setRenaming(menu.id); setMenu(null); }}
                onIcons={() => setMenu({ ...menu, icons: !menu.icons })}
                onIcon={(icon) => { setPages((st) => updatePage(st, menu.id, { icon })); setMenu(null); }}
                onDelete={() => {
                  if (!menu.sure) return setMenu({ ...menu, sure: true });
                  setPages((st) => removePage(st, menu.id));
                  setMenu(null);
                  if (currentKey === menu.id) router.push(base);
                }} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PageMenu({ m, onRename, onIcons, onIcon, onDelete }: {
  m: { icons: boolean; sure: boolean }; onRename: () => void; onIcons: () => void; onIcon: (i: PageIcon) => void; onDelete: () => void;
}) {
  const t = useT();
  return (
    <>
      <button type="button" role="menuitem" className={s.item} onClick={onRename}>
        <span className={s.slot}><Svg size={16}><path d="M3 13L3.6 10.4L10.6 3.4C11.2 2.8 12.2 2.8 12.6 3.4C13.2 3.8 13.2 4.8 12.6 5.4L5.6 12.4Z" /></Svg></span>{t("projects.sbRename")}
      </button>
      <button type="button" role="menuitem" className={s.item} aria-expanded={m.icons} onClick={onIcons}>
        <span className={s.slot}><Svg size={16}><circle cx="8" cy="8" r="5.6" /><path d="M5.8 9.6C6.8 10.8 9.2 10.8 10.2 9.6" /></Svg></span>{t("projects.sbIcon")}
      </button>
      {m.icons && (
        <div className={s.icons}>
          {PAGE_ICONS.map((i) => <button key={i} type="button" className={s.iconPick} aria-label={i} onClick={() => onIcon(i)}><PageGlyph icon={i} /></button>)}
        </div>
      )}
      <span className={s.sep} />
      <button type="button" role="menuitem" className={s.item} data-danger onClick={onDelete}>
        <span className={s.slot}><Svg size={16}><path d="M3 4.6H13M6.4 4.6V3.2H9.6V4.6M4.4 4.6L5 13H11L11.6 4.6" /></Svg></span>
        {m.sure ? t("projects.sbDeleteYes") : t("projects.sbDelete")}
      </button>
    </>
  );
}

function RenameRow({ page, onDone }: { page: CustomPage; onDone: (title: string | null) => void }) {
  const [v, setV] = useState(page.title);
  const done = useRef(false);
  const finish = (title: string | null) => { if (done.current) return; done.current = true; onDone(title); };
  return (
    <div className={s.row} data-editing>
      <span className={s.slot}><PageGlyph icon={page.icon} /></span>
      <input className={s.rename} value={v} autoFocus onFocus={(e) => e.currentTarget.select()} onChange={(e) => setV(e.target.value)}
        aria-label={page.title} onBlur={() => finish(v)}
        onKeyDown={(e) => { if (e.key === "Enter") finish(v); if (e.key === "Escape") finish(null); }} />
    </div>
  );
}

// ── Marks and icons (the Paper design's paths) ──────────────────────────────────────────────────────

function Svg({ size, fill, children }: { size: number; fill?: boolean; children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  );
}

/** Planning: an empty ring; running: half; measuring: three quarters; measured: a green tick. */
export function RingMark({ ring }: { ring: Ring }) {
  if (ring === "measured") {
    return <svg className={s.ring} data-ring={ring} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6" fill="currentColor" /><path d="M3.6 6.2L5.2 7.8L8.4 4.4" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  return (
    <svg className={s.ring} data-ring={ring} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {ring === "running" && <path d="M6 2.6A3.4 3.4 0 0 1 6 9.4Z" fill="currentColor" />}
      {ring === "measuring" && <path d="M6 6V2.6A3.4 3.4 0 1 1 2.6 6Z" fill="currentColor" />}
    </svg>
  );
}

function AreaIcon({ k }: { k: string }) {
  switch (k) {
    case "decisions": return <Svg size={16}><circle cx="8" cy="8" r="5.6" /><path d="M5.6 8.1L7.3 9.8L10.5 6.4" /></Svg>;
    case "collaboration": return <People />;
    case "progress": return <Svg size={16}><path d="M3 13.2H13.4" /><path d="M4.6 10.8V8.4M8 10.8V4.6M11.4 10.8V6.8" strokeWidth="1.6" /></Svg>;
    default: return <Svg size={16}><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></Svg>;
  }
}

const People = () => <Svg size={16}><circle cx="6" cy="5.8" r="2.3" /><path d="M2 13C2.4 10.9 4 9.8 6 9.8C8 9.8 9.6 10.9 10 13" /><path d="M10.6 3.8C11.8 4 12.6 4.9 12.6 6C12.6 7.1 11.8 8 10.6 8.2M12 9.9C13.2 10.3 13.9 11.4 14.1 12.6" /></Svg>;

function TabIcon({ k }: { k: (typeof PROJECT_TABS)[number] }) {
  switch (k) {
    case "board": return <Svg size={16}><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M6.2 2.5V13.5M9.8 2.5V13.5" /></Svg>;
    case "team": return <People />;
    case "results": return <Svg size={16}><circle cx="8" cy="8" r="5.6" /><circle cx="8" cy="8" r="2.4" /></Svg>;
    case "activity": return <Svg size={16}><path d="M2 8.4H4.8L6.6 4L9.4 12L11.2 8.4H14" /></Svg>;
    case "files": return <Svg size={16}><path d="M2.5 4.4C2.5 3.6 3.1 3 3.9 3H6.4L7.8 4.6H12.1C12.9 4.6 13.5 5.2 13.5 6V11.6C13.5 12.4 12.9 13 12.1 13H3.9C3.1 13 2.5 12.4 2.5 11.6Z" /></Svg>;
    default: return <Svg size={16}><path d="M2.8 7.2L8 2.8L13.2 7.2V13H2.8Z" /><path d="M6.4 13V9.6H9.6V13" /></Svg>;
  }
}

export function PageGlyph({ icon }: { icon: PageIcon }) {
  switch (icon) {
    case "checklist": return <Svg size={16}><path d="M2.8 4.6L4 5.8L6 3.6M2.8 10.2L4 11.4L6 9.2" /><path d="M8.2 4.8H13.2M8.2 10.4H13.2" /></Svg>;
    case "table": return <Svg size={16}><rect x="2.5" y="3" width="11" height="10" rx="1.6" /><path d="M2.5 6.4H13.5M2.5 9.7H13.5M6.4 6.4V13" /></Svg>;
    case "link": return <Svg size={16}><path d="M6.8 9.2L9.2 6.8M7.6 4.6L8.6 3.6C9.8 2.4 11.6 2.4 12.6 3.4C13.6 4.4 13.6 6.2 12.4 7.4L11.4 8.4M8.4 11.4L7.4 12.4C6.2 13.6 4.4 13.6 3.4 12.6C2.4 11.6 2.4 9.8 3.6 8.6L4.6 7.6" /></Svg>;
    case "flag": return <Svg size={16}><path d="M3.5 14V2.8M3.5 3H12L10.2 6L12 9H3.5" /></Svg>;
    case "star": return <Svg size={16}><path d="M8 2.6L9.6 6L13.2 6.4L10.5 8.8L11.3 12.4L8 10.5L4.7 12.4L5.5 8.8L2.8 6.4L6.4 6Z" /></Svg>;
    case "chat": return <Svg size={16}><path d="M2.8 4.2C2.8 3.4 3.4 2.8 4.2 2.8H11.8C12.6 2.8 13.2 3.4 13.2 4.2V9.6C13.2 10.4 12.6 11 11.8 11H6.4L3.6 13.2V11H4.2" /></Svg>;
    case "box": return <Svg size={16}><path d="M2.8 5L8 2.6L13.2 5V11L8 13.4L2.8 11Z" /><path d="M2.8 5L8 7.4L13.2 5M8 7.4V13.4" /></Svg>;
    default: return <Svg size={16}><path d="M4 2.5H9.4L12 5.1V13.5H4Z" /><path d="M6 8H10M6 10.4H9" /></Svg>;
  }
}
