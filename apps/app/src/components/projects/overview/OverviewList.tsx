"use client";
// The Projects Overview (Paper "Overview · final + interactions", A list and B grid): every idea still moving and every
// project this person may see, in one list. Pills (All, Ideas, Projects, Your move - kept in the address as ?show=),
// search, a sort from the column headers, list or grid (remembered per browser), and per item a ⋯ menu, a status chip
// that explains itself and the person on the desk. The items are facts from features/overview/items; this draws them.
// Remind and Follow are stand-ins until their events exist (overviewListPrefs.ts, OVERVIEW-LIST-FOR-KEVIN.txt).
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { initialsOf } from "@/components/dashboard/leader/IdeaParts";
import { libraryCoverFor } from "@/features/cases/thumbs";
import {
  deskItems, deskStats, isShow, searchItems, showCounts, showItems, sortItems, SORT_KEYS, SHOWS,
  type OverviewItem, type Show, type SortDir, type SortKey,
} from "@/features/overview/items";
import { verdictWord } from "@/features/projects/views";
import { avatarTone } from "@/lib/avatar";
import { useLocale, useT } from "@/i18n/client";
import type { Locale, T } from "@/i18n";
import { useOverviewPrefs } from "./overviewListPrefs";
import s from "./OverviewList.module.css";

type View = "list" | "grid";
type Pop = { id: string; kind: "more" | "chip" | "person" } | { id: "sort"; kind: "sort" } | null;

const PHONE = "(max-width: 760px)";
const onPhoneChange = (fn: () => void) => { const m = window.matchMedia(PHONE); m.addEventListener("change", fn); return () => m.removeEventListener("change", fn); };
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

export function OverviewList({ items }: { items: OverviewItem[] }) {
  const t = useT();
  const locale = useLocale();
  const { S, f, href, tenant } = useDemo();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const showParam = params.get("show");
  const show: Show = isShow(showParam) ? showParam : "all";
  const [prefs, setPrefs] = useOverviewPrefs(tenant.slug);
  const [q, setQ] = useState("");
  const [person, setPerson] = useState<string | null>(null);
  const [pop, setPop] = useState<Pop>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const phone = useSyncExternalStore(onPhoneChange, () => window.matchMedia(PHONE).matches, () => false);
  const view: View = phone ? "list" : prefs.view;

  // "/" finds, Escape closes a menu first, then clears the search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !isTyping(e.target)) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape") { if (pop) setPop(null); else if (q) setQ(""); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pop, q]);
  // A click outside an open menu or popover closes it.
  useEffect(() => {
    if (!pop) return;
    const onDown = (e: MouseEvent) => { if (!(e.target instanceof Element) || !e.target.closest("[data-pop]")) setPop(null); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pop]);

  const setShow = (next: Show) => {
    const p = new URLSearchParams(params.toString());
    if (next === "all") p.delete("show"); else p.set("show", next);
    const qs = p.toString();
    router.replace(pathname + (qs ? "?" + qs : ""), { scroll: false });
  };

  const found = useMemo(() => {
    const byPerson = person ? deskItems(items, person) : items;
    return searchItems(byPerson, q);
  }, [items, person, q]);
  const counts = showCounts(found);
  const shown = sortItems(showItems(found, show), prefs.sort, prefs.dir);
  const toggle = (next: Pop) => setPop((was) => (was && next && was.kind === next.kind && was.id === next.id ? null : next));
  const open = (i: OverviewItem) => router.push(href(i.path));
  const copy = (i: OverviewItem) => {
    void navigator.clipboard?.writeText(window.location.origin + href(i.path));
    setCopied(i.id);
    window.setTimeout(() => setCopied((c) => (c === i.id ? null : c)), 1600);
  };
  const ago = (day: number) => {
    const d = S.day - day;
    if (d <= 0) return t("projects.ovToday");
    if (d === 1) return t("projects.ovYesterday");
    return d < 14 ? t("projects.ovDaysAgo", { count: d }) : f(day);
  };
  const ctx: RowCtx = { t, f, today: S.day, locale, q, ago, href, pop, toggle, setPop, open, copy, copied, prefs, setPrefs, items, setPerson, personLink: (userId) => (userId && tenant.personLinks?.[userId] ? "/people/" + encodeURIComponent(userId) : null) };

  if (items.length === 0) return <Empty />;

  const footer = q ? t("projects.ovFooterSearch", { count: shown.length, q })
    : person ? t("projects.ovFooterPerson", { shown: shown.length, total: items.length, name: person })
    : show === "move" ? t("projects.ovFooterMove", { shown: shown.length, total: items.length })
    : show !== "all" ? t("projects.ovFooterShown", { shown: shown.length, total: items.length }) : null;
  const reset = q ? { label: t("projects.ovClearSearch"), go: () => setQ("") } : { label: t("projects.ovShowAll"), go: () => { setPerson(null); setShow("all"); } };

  return (
    <div className={s.root}>
      {/* One row of controls (DESIGN_RULES §1, §9): no heading that repeats the area, and no "New idea" under Projects (§8). */}
      <div className={s.filters}>
        <div className={s.pills} role="tablist" aria-label={t("projects.ovTitle")}>
          {SHOWS.filter((k) => k !== "ideas" && k !== "projects").map((k) => ( // projects only: All and Your move
            <button key={k} type="button" role="tab" aria-selected={show === k} className={s.pill} onClick={() => setShow(k)}>
              {t(("projects.ovShow_" + k) as "projects.ovShow_all")} <span className={s.pillCount} data-move={k === "move" && counts.move > 0 ? "true" : undefined}>{counts[k]}</span>
            </button>
          ))}
          {person && <button type="button" className={s.personChip} onClick={() => setPerson(null)}>{t("projects.ovOnlyName", { name: person })} <span aria-hidden="true">×</span></button>}
        </div>
        <label className={s.search} data-active={q ? "true" : undefined}>
          <SearchIcon />
          <input ref={searchRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("projects.ovSearch")} aria-label={t("projects.ovSearch")} />
          {q && <button type="button" className={s.clear} onClick={() => setQ("")} aria-label={t("projects.ovClear")}>×</button>}
        </label>
        <div className={s.views} role="group" aria-label={t("projects.ovViewList") + " / " + t("projects.ovViewGrid")}>
          <button type="button" className={s.viewBtn} aria-pressed={view === "grid"} aria-label={t("projects.ovViewGrid")} onClick={() => setPrefs({ view: "grid" })}><GridIcon /></button>
          <button type="button" className={s.viewBtn} aria-pressed={view === "list"} aria-label={t("projects.ovViewList")} onClick={() => setPrefs({ view: "list" })}><ListIcon /></button>
        </div>
      </div>

      {shown.length === 0 && q ? (
        <NoMatch q={q} onClear={() => setQ("")} />
      ) : view === "list" ? (
        <div className={s.table} role="table" aria-label={t("projects.ovTitle")}>
          <div className={s.headRow} role="row">
            <SortHead ctx={ctx} k="name" label={t("projects.ovColName")} className={s.cName} />
            <SortHead ctx={ctx} k="stage" label={t("projects.ovColStage")} className={s.cStage} />
            <SortHead ctx={ctx} k="updated" label={t("projects.ovColUpdated")} className={s.cUpdated} />
            <span role="columnheader" className={s.cDesk}>{t("projects.ovColDesk")}</span>
            <SortHead ctx={ctx} k="needs" label={t("projects.ovColStatus")} className={s.cStatus} />
          </div>
          {shown.map((i) => <Row key={i.id} i={i} ctx={ctx} />)}
        </div>
      ) : (
        <div className={s.grid}>
          {shown.map((i) => <Card key={i.id} i={i} ctx={ctx} />)}
        </div>
      )}

      {footer && shown.length > 0 && (
        <div className={s.footer}><span>{footer}</span><button type="button" className={s.link} onClick={reset.go}>{reset.label}</button></div>
      )}
    </div>
  );
}

// ── the pieces ──

type RowCtx = {
  t: T; f: (d: number) => string; today: number; locale: Locale; q: string; ago: (day: number) => string; href: (p: string) => string;
  pop: Pop; toggle: (p: Pop) => void; setPop: (p: Pop) => void; open: (i: OverviewItem) => void; copy: (i: OverviewItem) => void; copied: string | null;
  prefs: ReturnType<typeof useOverviewPrefs>[0]; setPrefs: ReturnType<typeof useOverviewPrefs>[1];
  items: OverviewItem[]; setPerson: (name: string | null) => void; personLink: (userId: string | null) => string | null;
};

/** A click on the row opens it, unless it landed on one of its own buttons or links. */
const rowClick = (i: OverviewItem, ctx: RowCtx) => (e: React.MouseEvent) => {
  if (e.target instanceof Element && e.target.closest("button, a, [data-pop]")) return;
  ctx.open(i);
};

/** A title too long for its row or card glides left while the mouse is over it, so it can be read in full (as in
 *  the Ideas and Projects sidebars). How far is measured when the mouse arrives: the text's width against the box. */
function GlideTitle({ className, href, label, children }: { className: string; href: string; label: string; children: React.ReactNode }) {
  const box = useRef<HTMLAnchorElement>(null);
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const el = box.current, host = el?.closest("[data-glide-host]");
    if (!el || !host) return;
    const measure = () => { const inner = el.firstElementChild as HTMLElement | null; setSlide(inner ? Math.max(0, Math.ceil(inner.scrollWidth - el.clientWidth)) : 0); };
    host.addEventListener("mouseenter", measure); el.addEventListener("focus", measure);
    return () => { host.removeEventListener("mouseenter", measure); el.removeEventListener("focus", measure); };
  }, []);
  const style = slide ? ({ "--slide": `-${slide + 6}px`, "--glide": `${Math.round(400 + slide * 22)}ms` } as React.CSSProperties) : undefined;
  return <Link ref={box} className={className} href={href} aria-label={label} data-glide={slide > 0 || undefined} style={style}><span className={s.glideText}>{children}</span></Link>;
}

function Row({ i, ctx }: { i: OverviewItem; ctx: RowCtx }) {
  const { t } = ctx;
  return (
    <div className={s.row} role="row" data-glide-host onClick={rowClick(i, ctx)} data-menu={ctx.pop && ctx.pop.id === i.id ? "true" : undefined}>
      <span role="cell" className={s.cName}>
        <Thumb i={i} />
        <span className={s.nameText}>
          <GlideTitle className={s.rowTitle} href={ctx.href(i.path)} label={(i.key ? i.key + " " : "") + i.title}><Marked text={i.title} q={ctx.q} /></GlideTitle>
          <span className={s.phoneMeta}>{phoneMeta(i, t)}</span>
        </span>
      </span>
      <span role="cell" className={s.cStage}><StageCell i={i} t={t} /></span>
      <span role="cell" className={s.cUpdated}>{ctx.ago(i.updatedDay)}</span>
      <span role="cell" className={s.cDesk}><Desk i={i} ctx={ctx} /></span>
      <span role="cell" className={s.cStatus}>
        <Chip i={i} ctx={ctx} />
        <More i={i} ctx={ctx} />
      </span>
    </div>
  );
}

function Card({ i, ctx }: { i: OverviewItem; ctx: RowCtx }) {
  const { t } = ctx;
  const pic = libraryCoverFor(i.id);
  return (
    <div className={s.card} data-glide-host onClick={rowClick(i, ctx)} data-menu={ctx.pop && ctx.pop.id === i.id ? "true" : undefined}>
      <div className={s.cover}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local picture from public/feed/library */}
        {pic && <img src={pic.src} alt="" className={s.coverImg} loading="lazy" />}
        {pic && <span className={s.coverText}><span className={s.coverStat}>{pic.stat}</span><span className={s.coverHook}>{pic.hook}</span></span>}
        <span className={s.coverMore}><More i={i} ctx={ctx} /></span>
      </div>
      <GlideTitle className={s.cardTitle} href={ctx.href(i.path)} label={(i.key ? i.key + " " : "") + i.title}><Marked text={i.title} q={ctx.q} /></GlideTitle>
      <span className={s.cardMeta}>
        <span className={s.cardWho}>
          <Face name={i.desk.name} you={i.desk.you} small />
          <span className={s.cardSub}>{stageText(i, t)}</span>
        </span>
        <Chip i={i} ctx={ctx} />
      </span>
    </div>
  );
}

/** The search words, marked in blue where they occur (2.3). */
function Marked({ text, q }: { text: string; q: string }) {
  const words = q.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp("(" + words.join("|") + ")", "gi"));
  return <>{parts.map((part, k) => (k % 2 === 1 ? <mark key={k} className={s.mark}>{part}</mark> : part))}</>;
}

function Thumb({ i }: { i: OverviewItem }) {
  const pic = libraryCoverFor(i.id);
  return (
    <span className={s.thumb}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a local picture from public/feed/library */}
      {pic && <img src={pic.src} alt="" loading="lazy" />}
    </span>
  );
}

const stageText = (i: OverviewItem, t: T): string => {
  if (i.stage.kind === "desk") return i.stage.role ?? t("projects.ovNoDesk");
  const word = t(("projects.status_" + i.stage.status) as "projects.status_running");
  return i.stage.total > 0 && i.stage.status !== "planning" && i.stage.status !== "recognised" ? word + " " + i.stage.done + "/" + i.stage.total : word;
};

const phoneMeta = (i: OverviewItem, t: T) =>
  [stageText(i, t), i.desk.you ? t("projects.ovYou") : i.desk.name].filter(Boolean).join(" · ");

function StageCell({ i, t }: { i: OverviewItem; t: T }) {
  const st = i.stage;
  if (st.kind === "desk") return <>{stageText(i, t)}</>;
  const pct = (n: number) => (st.total > 0 ? (100 * n) / st.total : 0);
  const full = st.status === "measuring" || st.status === "measured" || st.status === "recognised";
  return (
    <span className={s.stage}>
      <span>{stageText(i, t)}</span>
      <span className={s.bar} aria-hidden="true">
        <span className={s.barDone} style={{ width: (full ? 100 : pct(st.done)) + "%" }} />
        {!full && st.blocked > 0 && <span className={s.barBlocked} style={{ width: pct(st.blocked) + "%" }} />}
      </span>
    </span>
  );
}

function Face({ name, you, small }: { name: string | null; you: boolean; small?: boolean }) {
  return (
    <span className={s.face} data-you={you ? "true" : undefined} data-small={small ? "true" : undefined} data-avatar={you || !name ? undefined : avatarTone(name)} aria-hidden="true">
      {name ? initialsOf(name) : "?"}
    </span>
  );
}

function Desk({ i, ctx }: { i: OverviewItem; ctx: RowCtx }) {
  const { t } = ctx;
  if (i.desk.you) return <span className={s.desk}><Face name={i.desk.name} you /><b>{t("projects.ovYou")}</b></span>;
  if (!i.desk.name) return <span className={s.muted}>{t("projects.ovNoDesk")}</span>;
  const opened = ctx.pop?.kind === "person" && ctx.pop.id === i.id;
  return (
    <span className={s.anchor} data-pop={opened ? "true" : undefined}>
      <button type="button" className={s.desk} data-active={opened ? "true" : undefined} aria-expanded={opened} onClick={() => ctx.toggle({ id: i.id, kind: "person" })}>
        <Face name={i.desk.name} you={false} />{i.desk.name}
      </button>
      {opened && <PersonCard i={i} ctx={ctx} />}
    </span>
  );
}

function PersonCard({ i, ctx }: { i: OverviewItem; ctx: RowCtx }) {
  const { t } = ctx;
  const name = i.desk.name ?? "";
  const stats = deskStats(ctx.items, name);
  const role = ctx.items.find((x) => x.desk.name === name && x.stage.kind === "desk" && x.stage.role)?.stage;
  const link = ctx.personLink(i.desk.userId);
  return (
    <div className={s.pop} data-side="left" role="dialog" aria-label={name}>
      <div className={s.personHead}>
        <span className={s.faceLg} data-avatar={avatarTone(name)}>{initialsOf(name)}</span>
        <span className={s.personName}><b>{name}</b>{role && role.kind === "desk" && role.role && <span>{role.role}</span>}</span>
      </div>
      <div className={s.personStats}>
        <span><b>{stats.held}</b><span>{t("projects.ovHeld")}</span></span>
        {stats.late > 0 && <span data-late="true"><b>{stats.late}</b><span>{t("projects.ovHeldLate")}</span></span>}
      </div>
      <div className={s.popFoot}>
        {link ? <Link className={s.soft} href={ctx.href(link)}>{t("projects.ovProfile")}</Link> : <span />}
        <button type="button" className={s.link} onClick={() => { ctx.setPerson(name); ctx.setPop(null); }}>{t("projects.ovShowTheirs")}</button>
      </div>
    </div>
  );
}

const CHIP_TONE: Record<OverviewItem["status"]["what"], string> = {
  yourMove: "move", pastPromise: "late", late: "late", blocked: "late", daysLeft: "plain", recognised: "good", verdict: "plain", due: "plain", none: "none",
};

function chipText(i: OverviewItem, ctx: RowCtx): string | null {
  const { t } = ctx; const st = i.status;
  switch (st.what) {
    case "yourMove": return t("projects.ovYourMove");
    case "pastPromise": return t("projects.ovPastPromise");
    case "daysLeft": return t("projects.ovDaysLeft", { count: st.n });
    case "blocked": return t("projects.ovBlocked", { count: st.n });
    case "late": return t("projects.ovLate", { count: st.n });
    case "recognised": return t("projects.ovRecognised");
    case "verdict": return verdictWord(st.verdict, ctx.locale);
    case "due": return t("projects.ovDue", { day: ctx.f(st.day) });
    default: return null;
  }
}

function Chip({ i, ctx }: { i: OverviewItem; ctx: RowCtx }) {
  const text = chipText(i, ctx);
  if (!text) return null;
  const st = i.status;
  if (st.what === "yourMove") return <Link className={s.move} href={ctx.href(i.kind === "project" ? i.path + "?tab=board" : i.path)}>{text}</Link>;
  const tone = CHIP_TONE[st.what] + (st.what === "daysLeft" && st.n <= 1 ? "-warn" : "") + (st.what === "verdict" && st.verdict === "better" ? "-good" : "");
  const explains = st.what === "pastPromise" || st.what === "daysLeft" || st.what === "blocked" || st.what === "late";
  if (!explains) return <span className={s.chip} data-tone={tone}>{text}</span>;
  const opened = ctx.pop?.kind === "chip" && ctx.pop.id === i.id;
  return (
    <span className={s.anchor} data-pop={opened ? "true" : undefined}>
      <button type="button" className={s.chip} data-tone={tone} data-active={opened ? "true" : undefined} aria-expanded={opened} onClick={() => ctx.toggle({ id: i.id, kind: "chip" })}>{text}</button>
      {opened && <ChipPop i={i} ctx={ctx} tone={tone} text={text} />}
    </span>
  );
}

function ChipPop({ i, ctx, tone, text }: { i: OverviewItem; ctx: RowCtx; tone: string; text: string }) {
  const { t, f } = ctx; const st = i.status;
  const who = i.desk.name ?? t("projects.ovNoDesk");
  const lines: { text: string; hot?: boolean }[] = [];
  let head: string | null = null;
  if (st.what === "pastPromise") {
    head = t("projects.ovPopOver", { count: st.n });
    lines.push({ text: t("projects.ovPopOnDesk", { name: who }) });
    if (i.stage.kind === "desk" && i.stage.movedUp && i.stage.role) lines.push({ text: t("projects.ovPopMovedUp", { role: i.stage.role }) });
    lines.push({ text: t("projects.ovPopNoAnswer", { name: i.stage.kind === "desk" && i.stage.movedUp && i.stage.role ? i.stage.role : who }), hot: true });
  } else if (st.what === "daysLeft") {
    lines.push({ text: t("projects.ovPopOnDesk", { name: who }) });
    lines.push({ text: t("projects.ovPopLeft", { count: st.n, day: f(ctx.today + st.n) }) });
  } else if (st.what === "blocked") {
    lines.push({ text: t("projects.ovPopBlocked", { count: st.n }), hot: true });
    lines.push({ text: t("projects.ovPopLead", { name: who }) });
  } else if (st.what === "late") {
    lines.push({ text: t("projects.ovLate", { count: st.n }), hot: true });
    lines.push({ text: t("projects.ovPopLead", { name: who }) });
  }
  const reminded = ctx.prefs.reminded.includes(i.id);
  return (
    <div className={s.pop} data-side="right" role="dialog" aria-label={text}>
      <div className={s.popHead}><span className={s.chip} data-tone={tone}>{text}</span>{head && <b>{head}</b>}</div>
      <ul className={s.popLines}>{lines.map((l, k) => <li key={k} data-hot={l.hot ? "true" : undefined}>{l.text}</li>)}</ul>
      <div className={s.popFoot}>
        {i.desk.name && !i.desk.you
          ? <button type="button" className={s.primarySm} disabled={reminded} onClick={() => ctx.setPrefs({ remind: i.id })}>{reminded ? t("projects.ovReminded", { name: who }) : t("projects.ovRemind", { name: who })}</button>
          : <span />}
        <Link className={s.link} href={ctx.href(i.kind === "project" ? i.path + "?tab=activity" : i.path)}>{t("projects.ovHistory")}</Link>
      </div>
    </div>
  );
}

function More({ i, ctx }: { i: OverviewItem; ctx: RowCtx }) {
  const { t } = ctx;
  const opened = ctx.pop?.kind === "more" && ctx.pop.id === i.id;
  const who = i.desk.name ?? "";
  const followed = ctx.prefs.followed.includes(i.id);
  const reminded = ctx.prefs.reminded.includes(i.id);
  const go = (path: string) => { ctx.setPop(null); ctx.open({ ...i, path }); };
  return (
    <span className={s.anchor} data-pop={opened ? "true" : undefined}>
      <button type="button" className={s.more} data-active={opened ? "true" : undefined} aria-haspopup="menu" aria-expanded={opened} aria-label={t("projects.ovMore", { title: i.title })} onClick={() => ctx.toggle({ id: i.id, kind: "more" })}>⋯</button>
      {opened && (
        <div className={s.menu} role="menu">
          <button type="button" role="menuitem" className={s.item} data-first="true" onClick={() => go(i.path)}><span>{i.kind === "idea" ? t("projects.ovOpenIdea") : t("projects.ovOpenProject")}</span><kbd>{t("projects.ovKeyEnter")}</kbd></button>
          {i.kind === "project" && <button type="button" role="menuitem" className={s.item} onClick={() => go(i.path + "?tab=board")}>{t("projects.ovOpenBoard")}</button>}
          <button type="button" role="menuitem" className={s.item} onClick={() => ctx.copy(i)}><span>{ctx.copied === i.id ? t("projects.ovCopied") : t("projects.ovCopyLink")}</span></button>
          <hr />
          {i.kind === "idea" && who && !i.desk.you && <button type="button" role="menuitem" className={s.item} disabled={reminded} onClick={() => ctx.setPrefs({ remind: i.id })}>{reminded ? t("projects.ovReminded", { name: who }) : t("projects.ovRemind", { name: who })}</button>}
          {i.kind === "project" && who && !i.desk.you && <button type="button" role="menuitem" className={s.item} onClick={() => go(i.path)}>{t("projects.ovAsk", { name: who })}</button>}
          <button type="button" role="menuitem" className={s.item} onClick={() => ctx.setPrefs({ follow: i.id })}><span>{t("projects.ovFollow")}</span>{followed && <span className={s.on}>{t("projects.ovOn")}</span>}</button>
          {i.kind === "idea" && <button type="button" role="menuitem" className={s.item} onClick={() => go(i.path)}>{t("projects.ovAddComment")}</button>}
          <hr />
          <button type="button" role="menuitem" className={s.item} data-danger="true" onClick={() => go(i.path)}>{i.kind === "idea" ? t("projects.ovWithdraw") : t("projects.ovLeave")}</button>
        </div>
      )}
    </span>
  );
}

function SortHead({ ctx, k, label, className }: { ctx: RowCtx; k: SortKey; label: string; className: string }) {
  const { t } = ctx;
  const opened = ctx.pop?.kind === "sort" && ctx.prefs.sort === k;
  const active = ctx.prefs.sort === k && k !== "needs";
  return (
    <span role="columnheader" className={className + " " + s.anchor} data-pop={opened ? "true" : undefined} aria-sort={active ? (ctx.prefs.dir === "newest" ? "descending" : "ascending") : undefined}>
      <button type="button" className={s.sortBtn} data-active={active || opened ? "true" : undefined} onClick={() => { if (!opened) ctx.setPrefs({ sort: k }); ctx.toggle({ id: "sort", kind: "sort" }); }}>
        {label}{(active || opened) && <span aria-hidden="true"> ▾</span>}
      </button>
      {opened && (
        <div className={s.menu} data-side="left" role="menu">
          <span className={s.menuLabel}>{t("projects.ovSortBy")}</span>
          {SORT_KEYS.map((key) => (
            <button key={key} type="button" role="menuitemradio" aria-checked={ctx.prefs.sort === key} className={s.item} onClick={() => ctx.setPrefs({ sort: key })}>
              <span>{t(("projects.ovSort_" + key) as "projects.ovSort_needs")}</span>
              {ctx.prefs.sort === key ? <span className={s.on}>✓</span> : key === "needs" ? <kbd>{t("projects.ovSortDefault")}</kbd> : null}
            </button>
          ))}
          <hr />
          {(["newest", "oldest"] as SortDir[]).map((d) => (
            <button key={d} type="button" role="menuitemradio" aria-checked={ctx.prefs.dir === d} className={s.item} onClick={() => ctx.setPrefs({ dir: d })}>
              <span>{d === "newest" ? t("projects.ovNewest") : t("projects.ovOldest")}</span>{ctx.prefs.dir === d && <span className={s.on}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function NoMatch({ q, onClear }: { q: string; onClear: () => void }) {
  const t = useT();
  return (
    <div className={s.noMatch}>
      <SearchIcon big />
      <b>{t("projects.ovNoMatchTitle", { q })}</b>
      <div className={s.noMatchActions}>
        <button type="button" className={s.soft} onClick={onClear}>{t("projects.ovClearSearch")}</button>
      </div>
    </div>
  );
}

function Empty() {
  const t = useT();
  return <div className={s.root}><p className={s.emptyLine}>{t("projects.ovEmptyTitle")}</p></div>;
}

const SearchIcon = ({ big }: { big?: boolean }) => (
  <svg className={big ? s.bigIcon : undefined} width={big ? 36 : 14} height={big ? 36 : 14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={big ? 1.1 : 1.4} strokeLinecap="round" aria-hidden="true"><circle cx="6" cy="6" r="4.5" /><path d="M9.5 9.5L13 13" /></svg>
);
const GridIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="1" y="1" width="5" height="5" rx="1" /><rect x="8" y="1" width="5" height="5" rx="1" /><rect x="1" y="8" width="5" height="5" rx="1" /><rect x="8" y="8" width="5" height="5" rx="1" /></svg>
);
const ListIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true"><path d="M4.5 3h8M4.5 7h8M4.5 11h8" /><circle cx="1.6" cy="3" r=".5" /><circle cx="1.6" cy="7" r=".5" /><circle cx="1.6" cy="11" r=".5" /></svg>
);
