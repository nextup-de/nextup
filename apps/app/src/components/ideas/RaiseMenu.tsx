"use client";
// The actions menu behind the bolt button (and behind an item in the sidebar's lists): files, who is
// affected, who sees it (RAISE_ACTIONS). The receiver is chosen in the publish window. Opens upward when there is room.
// The start page shows the actions as a row of buttons in its composer instead (RaiseActions); each opens its own panel under it.
// Props in; the visibility choice waits in raisePreview.ts and goes with the case when it is raised.
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Dept, OrgPerson } from "@/features/demo/types";
import { useLocale, useT } from "@/i18n/client";
import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "@/i18n";
import { initials } from "@/features/ideas/raise";
import { RAISE_ACTIONS } from "@/features/ideas/raise-actions";
import { Icon, PATH, type IconName } from "./raiseIcons";
import type { Extras, FileItem } from "./raisePreview";
import s from "./Raise.module.css";
import { avatarTone } from "@/lib/avatar";

export type MenuView = "main" | "file" | "affected" | "vis" | "visPick";
type PickKey = "affected" | "visPick";
const PICKS: Record<PickKey, { depts: boolean; multi: boolean; ph: MessageKey }> = {
  affected: { depts: true, multi: true, ph: "ideas.menuSearchPeopleDepts" },
  visPick: { depts: true, multi: true, ph: "ideas.menuSearchPeopleDepts" },
};
const TITLE: Record<Exclude<MenuView, "main">, MessageKey> = {
  file: "ideas.menuTitleFile",
  affected: "ideas.menuTitleAffected", vis: "ideas.menuTitleVis", visPick: "ideas.menuTitleVisPick",
};
const PAGE = 5;
const isPick = (v: MenuView): v is PickKey => v in PICKS;

// The actions, in the menu's order (RAISE_ACTIONS): the panel each opens, its icon, its label and whether it holds a choice.
export type ActionRow = [Exclude<MenuView, "main" | "visPick">, IconName, string, boolean];
const ICON: Record<(typeof RAISE_ACTIONS)[number], IconName> = { file: "file", affected: "affected", vis: "vis" };
export const actionsOf = (x: Extras, files: number, affected: number, locale: Locale = DEFAULT_LOCALE): ActionRow[] =>
  RAISE_ACTIONS.map((v) => [v, ICON[v], translate(locale, TITLE[v]), v === "file" ? files > 0 : v === "affected" ? affected > 0 : x.vis !== "public"]);

export type MenuProps = {
  at: "bar" | "card" | "under";
  view: MenuView;
  onView: (v: MenuView) => void;
  onClose: () => void;
  extras: Extras;
  onExtras: (next: Partial<Extras>) => void;
  affected: string[];
  onAffected: (next: string[]) => void;
  files: FileItem[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveFile: (id: string) => void;
  people: readonly OrgPerson[];
  depts: readonly Dept[];
  me: string;
};

export function RaiseMenu(p: MenuProps) {
  const t = useT();
  const spot = useRef<HTMLSpanElement>(null); // where the menu belongs in the page
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ up: p.at === "bar", max: 400, x: 0, y: 0 });
  // Opened from the sidebar, the menu is drawn over the page (the sidebar clips what leaves it),
  // fixed beside the row it came from. Into the page root, so it keeps the page's sizes and fonts.
  const [host, setHost] = useState<HTMLElement | null>(null);

  // Open where there is room: upward when 195px fit above the button (or more than below), else down;
  // from the sidebar, to the right of the row and pulled back inside the screen; under a start-page
  // button, below it unless the space above is the bigger one, and never past the screen's edge.
  useLayoutEffect(() => {
    const anchor = spot.current?.parentElement;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    if (p.at !== "bar") {
      const root = anchor.closest<HTMLElement>("[data-raise-root]");
      if (root !== host) { setHost(root); return; }
      const w = ref.current?.offsetWidth ?? 0, gap = 8;
      if (p.at === "under") {
        const below = window.innerHeight - r.bottom - 9 - gap, above = r.top - 9 - gap;
        const up = below < 260 && above > below;
        const x = Math.max(gap, Math.min(r.left, window.innerWidth - w - gap));
        setPlace({ up, max: Math.max(120, Math.floor(up ? above : below)), x, y: up ? window.innerHeight - r.top + 9 : r.bottom + 9 });
        return;
      }
      const x = Math.max(gap, Math.min(r.right + gap, window.innerWidth - w - gap));
      const y = Math.max(gap, Math.min(r.top, window.innerHeight - 240));
      setPlace({ up: false, max: Math.max(120, Math.floor(window.innerHeight - y - gap)), x, y });
      return;
    }
    const above = r.top - 17, below = window.innerHeight - r.bottom - 18;
    const up = above >= 195 || above >= below;
    setPlace({ up, max: Math.max(120, Math.floor(up ? above : below)), x: 0, y: 0 });
  }, [p.at, p.view, host]);

  const { onClose } = p;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const width = p.view === "main" ? undefined : isPick(p.view) ? "pick" : "panel";
  // Opened from its own button there is no list behind a panel: its arrow (and Done) close it.
  const closes = p.at === "under" && p.view !== "visPick";
  const back = () => (closes ? p.onClose() : p.onView(p.view === "visPick" ? "vis" : "main"));
  const vars = { "--menu-max": place.max + "px", "--list-max": Math.max(72, Math.min(225, place.max - 135)) + "px", "--menu-x": place.x + "px", "--menu-y": place.y + "px" } as React.CSSProperties;

  const menu = (
    <>
      <div className={s.backdrop} onClick={p.onClose} />
      <div ref={ref} className={s.menu} data-up={String(place.up)} data-at={p.at === "bar" ? undefined : p.at} data-w={width} style={vars} role="menu">
        {p.view === "main" && <MainRows {...p} />}
        {p.view !== "main" && (
          <div className={s.panel} data-pick={isPick(p.view) || undefined}>
            <button type="button" className={`${s.mRow} ${s.back}`} onClick={back} title={closes ? t("common.close") : t("common.back")}>
              <Icon name={closes ? "x" : "left"} size={10.5} stroke="#6e6e73" width={2.6} />
              <span className={s.backLabel}>{t(TITLE[p.view])}</span>
            </button>
            {isPick(p.view) && <Picker key={p.view} {...p} view={p.view} done={back} />}
            {p.view === "file" && <FilePanel {...p} />}
            {p.view === "vis" && <VisPanel {...p} />}
          </div>
        )}
      </div>
    </>
  );
  if (p.at === "bar") return <><span ref={spot} hidden />{menu}</>;
  return <><span ref={spot} hidden />{host && createPortal(menu, host)}</>;
}

// The actions as a row of buttons along the bottom edge inside the start page's composer: each opens its
// own panel right there, and "Attach file" opens the file picker itself. One with a choice is outlined;
// the chips above the row show what was chosen.
export function RaiseActions({ rows, open, onOpen, menu, onAddFiles }: {
  rows: ActionRow[];
  open: MenuView | null;
  onOpen: (v: MenuView) => void;
  menu: React.ReactNode;
  onAddFiles: (files: FileList | null) => void;
}) {
  const t = useT();
  const pick = useRef<HTMLInputElement>(null);
  const at = open === "visPick" ? "vis" : open;
  return (
    <div className={s.adds} role="group" aria-label={t("ideas.menuAddToIdea")}>
      {rows.map(([v, icon, label, set]) => (
        <span key={v} className={s.addWrap}>
          <button type="button" className={s.add} data-set={set} title={label} aria-expanded={v === "file" ? undefined : at === v} onClick={() => (v === "file" ? pick.current?.click() : onOpen(v))}>
            <Icon name={icon} size={12} />
            <span className={s.addLabel}>{label}</span>
          </button>
          {at === v && menu}
        </span>
      ))}
      <input ref={pick} className={s.hidden} type="file" multiple accept="image/*,.pdf" onChange={(e) => { onAddFiles(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

function MainRows(p: MenuProps) {
  const locale = useLocale();
  return actionsOf(p.extras, p.files.length, p.affected.length, locale).map(([v, icon, label, set]) => (
    <Fragment key={v}>
      <button type="button" role="menuitem" className={s.mRow} onClick={() => p.onView(v)}>
        <Icon name={icon} size={12.75} stroke="#1c1c1e" />
        <span className={s.mLabel}>{label}</span>
        <span className={s.mSet} data-on={set} />
        <Icon name="right" size={9.75} stroke="#8e8e93" width={2.6} />
      </button>
    </Fragment>
  ));
}

type Item = { id: string; label: string; meta: string; dept?: string };

function Picker(p: MenuProps & { view: PickKey; done: () => void }) {
  const t = useT();
  const cfg = PICKS[p.view];
  const ph = t(cfg.ph);
  const [q, setQ] = useState("");
  const [pages, setPages] = useState<Record<string, number>>({});
  const [openDept, setOpenDept] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => { input.current?.focus(); }, []);

  const sel = p.view === "affected" ? p.affected : p.extras.visTo;
  const set = (next: string[]) => {
    if (p.view === "affected") p.onAffected(next);
    else p.onExtras({ visTo: next });
  };
  const toggle = (id: string) => set(cfg.multi ? (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]) : (sel.includes(id) ? [] : [id]));
  const needle = q.trim().toLowerCase();
  const hit = (it: Item) => !needle || it.label.toLowerCase().includes(needle) || it.meta.toLowerCase().includes(needle);
  const deptName = (id: string) => p.depts.find((d) => d.id === id)?.name ?? id;
  const people: Item[] = p.people.filter((x) => x.name !== p.me).map((x) => ({ id: x.name, label: x.name, meta: x.role + " · " + deptName(x.dept) })).filter(hit);
  const depts: Item[] = cfg.depts ? p.depts.map((d) => ({ id: d.name, label: d.name, meta: t("ideas.menuPeople", { count: d.people }), dept: d.id })).filter(hit) : [];
  const page = (key: string, items: Item[]) => { const n = Math.max(1, Math.ceil(items.length / PAGE)), at = Math.min(pages[key] ?? 0, n - 1); return { at, n, rows: items.slice(at * PAGE, (at + 1) * PAGE) }; };
  const pager = (key: string, at: number, n: number) => n > 1 && (
    <div className={s.pager}>
      <button type="button" className={s.pageBtn} disabled={at === 0} onClick={() => setPages((x) => ({ ...x, [key]: at - 1 }))} aria-label={t("ideas.menuPrevPage")}>‹</button>
      <span className={s.pageText}>{at + 1} / {n}</span>
      <button type="button" className={s.pageBtn} disabled={at >= n - 1} onClick={() => setPages((x) => ({ ...x, [key]: at + 1 }))} aria-label={t("ideas.menuNextPage")}>›</button>
    </div>
  );
  const row = (it: Item, nested = false) => {
    const on = sel.includes(it.id);
    return (
      <button type="button" className={`${s.mRow} ${s.pickRow}`} onClick={() => toggle(it.id)} aria-pressed={on}>
        <span className={`${s.lead} ${s.leadPick}`} data-kind={it.dept ? "dept" : "person"} data-avatar={it.dept ? undefined : avatarTone(it.label)}>{it.dept ? <Icon name="affected" size={12.75} /> : initials(it.label)}</span>
        <span className={s.pickText}><span className={s.pickName}>{it.label}</span><span className={s.pickMeta}>{nested ? it.meta.split(" · ")[0] : it.meta}</span></span>
        <span className={s.box15} data-on={on}><Icon name="check" size={9} stroke="#fff" width={3.2} /></span>
      </button>
    );
  };
  const groups = [{ key: "people", label: t("ideas.menuPeopleHead"), items: people }, { key: "depts", label: t("ideas.menuDepartments"), items: depts }].filter((g) => g.items.length);

  return (
    <>
      <div className={s.pickSearch}><input ref={input} className={s.pickInput} value={q} onChange={(e) => { setQ(e.target.value); setPages({}); }} placeholder={ph} aria-label={ph} /></div>
      <div className={s.pickList}>
        {groups.map((g) => {
          const pg = page(g.key, g.items);
          return (
            <Fragment key={g.key}>
              <span className={s.pickHead}>{g.label}</span>
              {pg.rows.map((it) => {
                if (!it.dept) return <div key={it.id} className={s.pickLine}>{row(it)}</div>;
                const members: Item[] = p.people.filter((x) => x.dept === it.dept && x.name !== p.me).map((x) => ({ id: x.name, label: x.name, meta: x.role }));
                const open = openDept === it.dept, picked = members.filter((m) => sel.includes(m.id)).length, sp = page("dept:" + it.dept, members);
                return (
                  <Fragment key={it.id}>
                    <div className={s.pickLine}>
                      {row(it)}
                      {members.length > 0 && (
                        <button type="button" className={s.sub} aria-expanded={open} title={t("ideas.menuPickInDept")} onClick={() => setOpenDept(open ? null : it.dept ?? null)}>
                          <span>{(picked ? picked + "/" : "") + members.length}</span><Icon name="right" size={9} width={2.6} />
                        </button>
                      )}
                    </div>
                    {open && sp.rows.map((m) => <div key={m.id} className={s.pickLine} data-nested="true">{row(m, true)}</div>)}
                    {open && pager("dept:" + it.dept, sp.at, sp.n)}
                  </Fragment>
                );
              })}
              {pager(g.key, pg.at, pg.n)}
            </Fragment>
          );
        })}
        {!groups.length && <span className={s.noMatch}>{t("ideas.publishNoMatches")}</span>}
      </div>
      <div className={s.pickFoot}>
        <span className={s.pickCount}>{t("ideas.menuSelected", { count: sel.length })}</span>
        <button type="button" className={s.clear} onClick={() => set([])}>{t("ideas.menuClear")}</button>
        <button type="button" className={s.done} onClick={p.done}>{t("common.done")}</button>
      </div>
    </>
  );
}

const extOf = (name: string) => (name.split(".").pop() || "file").slice(0, 4).toUpperCase();

function FilePanel(p: MenuProps) {
  const t = useT();
  return (
    <div className={s.files}>
      {p.files.map((f) => (
        <div key={f.id} className={s.file}>
          <span className={s.thumb} style={f.img ? { backgroundImage: `url(${f.url})` } : undefined}>{!f.img && extOf(f.name)}</span>
          <span className={s.fileName}>{f.name}</span>
          <button type="button" className={s.fileX} title={t("ideas.cardRemove")} aria-label={t("ideas.cardRemoveWhat", { what: f.name })} onClick={() => p.onRemoveFile(f.id)}><Icon name="x" size={8.25} width={3} /></button>
        </div>
      ))}
      <label className={s.drop} data-more={p.files.length > 0}>
        <Icon name="upload" size={12.75} stroke="#1c1c1e" />
        <span className={s.dropTitle}>{p.files.length ? t("ideas.menuAddMore") : t("ideas.menuChoose")}</span>
        <span className={s.dropSub}>{t("ideas.menuPhotosPdfs")}</span>
        <input className={s.hidden} type="file" multiple accept="image/*,.pdf" onChange={(e) => { p.onAddFiles(e.target.files); e.target.value = ""; }} />
      </label>
    </div>
  );
}

function VisPanel(p: MenuProps) {
  const t = useT();
  const opts: [Extras["vis"], string, IconName][] = [["private", t("ideas.menuPrivate"), "lock"], ["public", t("ideas.menuPublic"), "globe"], ["custom", t("ideas.cardCustom"), "affected"]];
  return opts.map(([k, label, icon]) => (
    <button key={k} type="button" className={s.mRow} data-tall="true" onClick={() => { p.onExtras({ vis: k }); if (k === "custom") p.onView("visPick"); }}>
      <Icon name={icon} size={12.75} stroke="#1c1c1e" />
      <span className={s.mLabel}>{label}</span>
      <svg className={s.mCheck} data-on={p.extras.vis === k} width="10.5" height="10.5" viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATH.check} /></svg>
    </button>
  ));
}
