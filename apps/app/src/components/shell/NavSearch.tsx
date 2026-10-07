"use client";
// The simple shell's search. The magnifier opens the navigation pill into a search box; below it a
// card in the Overview's language: filter pills, then the cases this person may open (status badge
// and the five steps, as on the Overview) and people. With nothing typed it offers what waits on you,
// what you opened last and the places. ↑↓ move, ↵ opens, esc clears the text, then closes.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { initialsOf } from "@/components/dashboard/leader/IdeaParts";
import { NAV_SIMPLE } from "@/config/nav";
import { OVERVIEW_STEPS, type OverviewStatus } from "@/features/cases/rows";
import { highlight, runSearch, tokens } from "@/features/search";
import { navbarIndex, type NavHit } from "@/features/search/navbar";
import styles from "./SimpleShell.module.css";
import { avatarTone } from "@/lib/avatar";

type Filter = "all" | "Problem" | "Idea" | "Person";
const FILTERS: [Filter, string][] = [["all", "All"], ["Problem", "Problems"], ["Idea", "Ideas"], ["Person", "People"]];
const GROUP_LABEL: Record<NavHit["kind"], string> = { Problem: "Problems", Idea: "Ideas", Person: "People", Team: "Teams", Case: "Cases" };
// The Overview's status words and badge tones (team/DashboardView), so a case reads the same in both places.
const STATUS_LABEL: Record<OverviewStatus, string> = {
  move: "Your move", asked: "Needs more info", replied: "Replied", waiting: "Waiting", approved: "Approved", declined: "Not now", building: "Building", shipped: "Shipped",
};

type Section = { label: string; items: NavHit[] };

export function NavSearch({ children }: { children: (open: boolean) => React.ReactNode }) {
  const ctx = useDemo(), router = useRouter();
  const open = ctx.pop === "search";
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>("all"), [cursor, setCursor] = useState(0);
  const [recent, setRecent] = useState<string[]>([]); // hrefs, newest first
  // Closing (button, backdrop, a link, Escape) puts the filter and the cursor back.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (!open) { setFilter("all"); setCursor(0); } }

  const index = navbarIndex(ctx);
  const query = ctx.q.trim();
  const toks = tokens(query);
  const matches = runSearch(index, query, { perGroup: Infinity, total: Infinity });
  const count = (f: Filter) => (f === "all" ? matches.length : matches.filter((r) => r.kind === f).length);

  // What the card lists: matches grouped by kind (All keeps the best four of each), or the suggestions.
  const sections: Section[] = [];
  if (query) {
    const shown = filter === "all" ? runSearch(index, query, { perGroup: 4, total: 12 }) : matches.filter((r) => r.kind === filter);
    for (const r of shown) {
      const label = GROUP_LABEL[r.kind];
      const at = sections.find((x) => x.label === label);
      if (at) at.items.push(r); else sections.push({ label, items: [r] });
    }
  } else {
    const waiting = index.filter((r) => r.case?.yourMove && r.case.open).sort((a, b) => (b.case?.days ?? 0) - (a.case?.days ?? 0)).slice(0, 3);
    const last = recent.map((h) => index.find((r) => r.href === h)).filter((r): r is NavHit => !!r && !waiting.includes(r));
    if (waiting.length) sections.push({ label: "Waiting on you", items: waiting });
    if (last.length) sections.push({ label: "Recently opened", items: last });
  }
  const items = sections.flatMap((x) => x.items);
  const active = Math.min(cursor, Math.max(0, items.length - 1));

  const close = () => { ctx.setPop(null); ctx.setQ(""); };
  const pick = (r: NavHit) => {
    setRecent((hs) => [r.href, ...hs.filter((h) => h !== r.href)].slice(0, 3));
    close();
    router.push(r.href);
  };
  const choose = (f: Filter) => { setFilter(f); setCursor(0); input.current?.focus(); };

  useEffect(() => { if (open) { input.current?.focus(); input.current?.select(); } }, [open]);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [active]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); // the provider's Escape would close everything at once
      if (ctx.q) { ctx.setQ(""); setCursor(0); } else close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length) setCursor((active + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault(); pick(items[active]);
    }
  };

  const row = (r: NavHit, i: number) => {
    const c = r.case;
    return (
      <button key={r.href} type="button" role="option" id={"nav-search-" + i} aria-selected={i === active} className={styles.sRow}
        onMouseMove={() => i !== active && setCursor(i)} onClick={() => pick(r)}>
        {c ? (
          <span className={styles.sMark} data-kind={r.kind} aria-hidden="true">
            {r.kind === "Idea"
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z" /></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg>}
          </span>
        ) : (
          <span className={styles.sAvatar} data-avatar={avatarTone(r.title)} aria-hidden="true">{initialsOf(r.title)}</span>
        )}
        <span className={styles.sBody}>
          <span className={styles.sTitle}>{highlight(r.title, toks).map((p, k) => (p.hit ? <mark key={k}>{p.t}</mark> : p.t))}</span>
          <span className={styles.sSub}>
            {r.sub}
            {c && <> · <span data-tone={c.late ? "late" : undefined}>{!c.open ? "answered" : c.late ? "past promise" : c.days + " d open"}</span></>}
          </span>
        </span>
        {c ? (
          <span className={styles.sSide}>
            <span className={styles.sBadge} data-tone={c.status === "move" ? "move" : c.status === "replied" ? "replied" : undefined}>{STATUS_LABEL[c.status]}</span>
            <span className={styles.sSteps} title={c.step >= OVERVIEW_STEPS.length ? "Shipped" : OVERVIEW_STEPS[c.step] + " · on " + c.desk + "'s desk"}>
              {OVERVIEW_STEPS.map((x, k) => <span key={x} data-tone={k < c.step ? "done" : k === c.step ? "now" : undefined} />)}
            </span>
          </span>
        ) : (
          <span className={styles.sSide}><span className={styles.sGo}>Profile <span aria-hidden="true">›</span></span></span>
        )}
      </button>
    );
  };

  let n = 0; // running index across the sections, so the cursor walks them top to bottom
  return (
    <div className={styles.navGroup} data-search={open ? "true" : undefined}>
      <span className={styles.searchSpacer} aria-hidden="true" />
      <div className={styles.searchControl}>
        <button type="button" className={styles.searchButton} aria-label={open ? "Close search" : "Open search"} aria-expanded={open} aria-controls="nh-search" onClick={() => (open ? close() : ctx.setPop("search"))}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
        </button>
        <div className={styles.searchSlot} aria-hidden={!open}>
          <input ref={input} id="nh-search" className={styles.searchInput} type="text" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="nav-search-list"
            aria-activedescendant={open && items[active] ? "nav-search-" + active : undefined} placeholder="Search problems, ideas, people" aria-label="Search"
            tabIndex={open ? 0 : -1} value={ctx.q} autoComplete="off" spellCheck={false} onChange={(e) => { ctx.setQ(e.target.value); setCursor(0); }} onKeyDown={onKey} />
          {query && <button type="button" className={styles.searchClear} aria-label="Clear search" tabIndex={open ? 0 : -1} onClick={() => { ctx.setQ(""); setCursor(0); input.current?.focus(); }}>×</button>}
        </div>
      </div>
      {children(open)}
      {open && (
        <div className={styles.sPanel}>
          <div className={styles.sFilters} role="group" aria-label="Show">
            {FILTERS.map(([f, label]) => (
              <button key={f} type="button" className={styles.sFilter} aria-pressed={filter === f} onClick={() => choose(f)}>
                {label}{query && <span className={styles.sCount}>{count(f)}</span>}
              </button>
            ))}
          </div>

          <div ref={list} id="nav-search-list" role="listbox" aria-label={query ? "Matches" : "Suggestions"} className={styles.sList}>
            {sections.map((sec) => (
              <div key={sec.label} role="group" aria-label={sec.label} className={styles.sSection}>
                <p className={styles.sHeading} aria-hidden="true">{sec.label}</p>
                {sec.items.map((r) => row(r, n++))}
              </div>
            ))}
            {query && items.length === 0 && (
              <div className={styles.sEmpty}>
                <strong>Nothing matches “{query}”</strong>
                <p>Try fewer words, a person’s name or part of a title.</p>
                {filter !== "all" && count("all") > 0 && <button type="button" className={styles.sPill} onClick={() => choose("all")}>Show all {count("all")} matches</button>}
              </div>
            )}
          </div>

          {!query && (
            <div className={styles.sPlaces}>
              <p className={styles.sHeading}>Go to</p>
              <div className={styles.sPlaceRow}>
                {NAV_SIMPLE[ctx.role].map((p) => <Link key={p.href} className={styles.sPill} href={ctx.href(p.href)} onClick={close}>{p.label}</Link>)}
                <Link className={styles.sPill} href={ctx.href("/profile")} onClick={close}>My profile</Link>
              </div>
            </div>
          )}

          <div className={styles.sFoot}>
            <span role="status" aria-live="polite">{query ? (matches.length === 1 ? "1 match" : matches.length + " matches") : "Search by title, person, team or desk"}</span>
            <span className={styles.sKeys} aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> move <kbd>↵</kbd> open <kbd>esc</kbd> {query ? "clear" : "close"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
