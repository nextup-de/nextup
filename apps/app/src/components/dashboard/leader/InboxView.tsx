"use client";
// TEAM LEADER home: open items addressed to me, sorted by age, one action each - yes /
// no+why / hand over / ask one question. Port of the INBOX block in legacy/demo/index.html.
// A manager sees the same list with the ideas waiting on their decision on top.
// The stats strip, then the "Fresh ideas" card (Claude Design handoff "Inbox App"): search,
// sort (oldest / newest first), filter (all / late / on time), one row per item - who sent it, what it
// is about, when it came in, the promise clock. Nothing is open until a row is picked; then the
// stats fold away, the card docks left (tucked to avatars on first open) and the item slides in
// beside it. ↑/↓ walk the list, Close / Escape puts the page back. Ideas and cases open in the same
// view (IdeaDetail, IdeaDetailPhone on a phone): an idea with its written brief and five decisions,
// a case with a brief built from its own facts and the four case actions.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { deskCases, inboxIdeas, inboxSorted, openCases, problemOf } from "@/components/dashboard/derive";
import { raisedWith, sentLabel } from "@/features/cases/rows";
import { affectedOn, commentsOn, rescoresOn } from "@/features/cases/selectors";
import { badgeTone, briefFor, briefForCase, personFor } from "@/features/ideas/brief";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./InboxView.module.css";
import { IdeaDetail } from "./IdeaDetail";
import type { IdeaProps } from "./IdeaParts";
import { IdeaDetailPhone } from "./IdeaDetailPhone";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { avatarTone } from "@/lib/avatar";

type Filter = "all" | "late" | "ontime";
const FILTERS: Filter[] = ["all", "late", "ontime"];
const FILTER_TITLE: Record<Filter, string> = { all: "Filter: all", late: "Filter: late only", ontime: "Filter: on time only" };
const initialsOf = (name: string) => (name.startsWith("Anonymous") ? "?" : name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase());
// "Yesterday" -> "yesterday", "Monday" -> "on Monday", "09:14" -> "today"
const raisedPhrase = (label: string) => (/\d:\d/.test(label) || label === "Today" ? "today" : label === "Yesterday" ? "yesterday" : "on " + label);
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
const HL_EASE = "cubic-bezier(.3,1.25,.4,1)";
// A phone gets its own idea layout (IdeaDetailPhone); a big monitor opens with the list showing,
// anything smaller (a laptop) with it tucked to avatars.
const PHONE = "(max-width: 760px)", BIG_SCREEN = "(min-width: 1600px)";
const onPhoneChange = (fn: () => void) => { const m = window.matchMedia(PHONE); m.addEventListener("change", fn); return () => m.removeEventListener("change", fn); };

export function InboxView({ initialId }: { initialId?: string }) {
  const ctx = useDemo();
  const { seed, S, log, demo, persona, act, openSheet, showToast, ready, f, actor, panels, motion } = ctx;
  // Selection: the page remounts this view (key = ?id) when a search result or link picks a case.
  const [cid, setCid] = useState<string | null>(initialId ?? null);
  const [open, setOpen] = useState(!!initialId);
  const [tucked, setTucked] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [newest, setNewest] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [now] = useState(() => new Date()); // views render only once `ready`, so this never meets the server render
  const phone = useSyncExternalStore(onPhoneChange, () => window.matchMedia(PHONE).matches, () => false);
  const listRef = useRef<HTMLDivElement>(null); // the list's scroll box; the highlight lives in it
  const hlRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const kickRef = useRef<() => void>(() => {});
  const navRef = useRef<{ ids: string[]; pick: (id: string) => void; close: () => void }>({ ids: [], pick: () => {}, close: () => {} });
  const prevRef = useRef<{ cid: string | null; open: boolean }>({ cid: null, open: false });

  const who = persona.who, P = seed.promiseDays;
  const inbox = ready ? inboxSorted(ctx) : [];
  const ideas = ready ? inboxIdeas(ctx) : [];
  // The selection is an idea or a case - or nothing, until a row is picked. An idea that was just
  // approved leaves the list, and the pane closes with it.
  const si = ideas.find((i) => i.id === cid) ?? null;
  const sc = si ? null : inbox.find((c) => c.id === cid) ?? null;
  const picked = !!(si || sc);
  const isOpen = open && picked;

  // Keyboard: ↑/↓ walk the list (opening the pane if it is closed), Escape closes. Search and the
  // idea's popovers handle their own keys first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const nav = navRef.current;
      if (e.key === "Escape") { if (!isTyping(e.target) && !ctx.sheet) nav.close(); return; }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !isTyping(e.target) && nav.ids.length && !ctx.sheet) {
        e.preventDefault();
        const i = cid ? nav.ids.indexOf(cid) : -1;
        const n = !isOpen ? Math.max(0, i) : Math.max(0, Math.min(nav.ids.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
        nav.pick(nav.ids[n]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cid, isOpen, ctx.sheet]);

  // The selection highlight: one element behind the list that follows the picked row. Row sizes
  // animate for ~420ms after a change, so it re-measures every frame for a little longer than that.
  useEffect(() => {
    let raf = 0, until = 0;
    let last: { x: number; y: number; w: number; h: number; id: string | null; vis: boolean } = { x: 0, y: 0, w: 0, h: 0, id: null, vis: false };
    const tick = () => {
      if (performance.now() > until) { raf = 0; return; }
      raf = requestAnimationFrame(tick);
      const hl = hlRef.current, list = listRef.current;
      if (!hl || !list) return;
      const id = list.dataset.selected || null;
      const row = id ? list.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`) : null;
      if (!row) {
        if (last.vis) { hl.style.transition = "opacity 200ms ease"; hl.style.opacity = "0"; last = { ...last, vis: false }; }
        return;
      }
      const g = { x: row.offsetLeft, y: row.offsetTop, w: row.offsetWidth, h: row.offsetHeight };
      const moved = last.id !== id;
      if (!moved && last.vis && g.x === last.x && g.y === last.y && g.w === last.w && g.h === last.h) return;
      hl.style.transition = moved && last.vis ? `transform 420ms ${HL_EASE}, width 420ms ${HL_EASE}, height 420ms ${HL_EASE}, opacity 200ms ease` : "opacity 240ms ease";
      hl.style.transform = `translate(${g.x}px, ${g.y}px)`;
      hl.style.width = g.w + "px";
      hl.style.height = g.h + "px";
      hl.style.opacity = "1";
      last = { ...g, id, vis: true };
    };
    kickRef.current = () => { until = performance.now() + 900; if (!raf) raf = requestAnimationFrame(tick); };
    // A slow frame can outlast that window, so a row finishing its own transition re-measures too.
    const onResize = () => kickRef.current();
    const list = listRef.current;
    window.addEventListener("resize", onResize);
    list?.addEventListener("transitionend", onResize);
    kickRef.current();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); list?.removeEventListener("transitionend", onResize); };
  }, [ready]); // the list only exists once the view is ready
  useLayoutEffect(() => { kickRef.current(); });

  // Switching items while open: the detail re-enters from the direction of travel, scrolls to its
  // top, and the list brings the picked row into view.
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { cid, open: isOpen };
    if (!isOpen || !prev.open || prev.cid === cid || !cid) return;
    const ids = navRef.current.ids;
    const dir = ids.indexOf(cid) >= ids.indexOf(prev.cid ?? "") ? 1 : -1;
    const moving = motion && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = moving ? "smooth" : "auto";
    const scroller = listRef.current, row = scroller?.querySelector<HTMLElement>(`[data-row="${CSS.escape(cid)}"]`);
    if (row && scroller) {
      const lr = scroller.getBoundingClientRect(), rr = row.getBoundingClientRect();
      if (rr.top < lr.top + 12 || rr.bottom > lr.bottom - 12) scroller.scrollTo({ top: scroller.scrollTop + (rr.top - lr.top) - (lr.height - rr.height) / 2, behavior });
    }
    const pane = paneRef.current;
    if (pane && pane.scrollTop > 0) pane.scrollTo({ top: 0, behavior });
    const d = detailRef.current;
    if (d?.animate && moving) {
      d.getAnimations().forEach((a) => a.cancel());
      d.animate([{ opacity: 0, transform: `translateY(${dir * 18}px)` }, { opacity: 1, transform: "none" }], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
  }, [cid, isOpen, motion]);

  const desk = deskCases(ctx), openList = openCases(ctx);
  const route = sc?.route ?? null;
  const scMine = !!route && route.owner.name === who.name;
  const handTo = route ? (scMine ? route.deputy : route.owner.name) : "the triage desk";
  const lastHand = sc?.handed[sc.handed.length - 1];
  const handedNote = !sc ? ""
    : sc.escalated && sc.escalated.to === who.name && sc.assignee !== who.name
      ? "Escalated to you " + f(sc.escalated.day) + " — " + sc.assignee + " missed the " + P + "-day promise."
      : sc.escalated && sc.assignee === who.name
        ? "Past the promise since " + f(sc.escalated.day) + " — " + sc.escalated.to + " sees it too."
        : lastHand ? "From " + lastHand.from + ", " + f(lastHand.day) + (lastHand.why ? " — “" + lastHand.why + "”" : "") : "";

  const overdue = openList.filter((c) => c.overdue).length + ideas.filter((i) => i.wait > P).length;
  const stats = [
    { v: String(desk.length + ideas.length), l: openList.length === desk.length ? "on your desk" : "on your desk · " + (desk.length - openList.length) + " paused" },
    { v: String(overdue), l: "past the " + P + "-day promise", hot: overdue > 0 },
    { v: demo ? seed.metrics.lead.medianAnswer : "—", l: "median time to answer" },
    { v: demo ? seed.metrics.lead.withinPromise : "—", l: "within the promise, Q3" },
  ];

  // A demo day offset (0 = today) as a date; a case raised today in this browser has its real time.
  const dayDate = (offset: number) => { const d = new Date(now); d.setDate(d.getDate() + offset); return d; };
  const roleOf = (name: string, dept: string) => seed.people.find((p) => p.name === name)?.role ?? dept;

  // One row shape for ideas owed a decision and cases: who sent it, what it is about, when, the clock.
  const rows = [
    ...ideas.map((i) => {
      const [name, dept = ""] = i.proposedBy.split(", "); // "C. Ilg, Ops"
      return { id: i.id, title: i.title, name, role: roleOf(name, dept), solves: problemOf(ctx, i)?.title ?? "", sent: dayDate(-i.wait), exact: false, due: P - i.wait, paused: false, caseId: null as string | null };
    }),
    ...inbox.map((c) => {
      const raised = c.history.find((e) => e.type === "case.raised" && !e.seed);
      const exact = !!raised && c.raisedDay === S.day;
      return {
        id: c.id, title: c.title, name: c.from, role: roleOf(c.from, c.fromDept), solves: c.body,
        sent: exact && raised ? new Date(raised.ts) : dayDate(c.raisedDay - S.day), exact, due: P - c.clock, paused: c.status === "asked", caseId: c.id,
      };
    }),
  ];
  const q = query.trim().toLowerCase();
  const shown = rows
    .filter((r) => filter === "all" || (filter === "late" ? r.due < 0 : r.due >= 0))
    .filter((r) => !q || [r.title, r.name, r.role, r.solves].some((t) => t.toLowerCase().includes(q)))
    .sort((a, b) => (newest ? b.sent.getTime() - a.sent.getTime() : a.sent.getTime() - b.sent.getTime()));
  const badgeOf = (r: (typeof rows)[number]) => (r.paused ? "paused" : r.due < 0 ? -r.due + " d late" : r.due + " d left");

  // Open a row; the open row again closes the pane. The first open tucks the list to its avatars.
  const pick = (id: string) => {
    if (isOpen && cid === id) { setOpen(false); setTucked(false); return; }
    const c = inbox.find((x) => x.id === id);
    if (c && c.read === null) act.read(c.id);
    if (!isOpen) setTucked(!phone && !window.matchMedia(BIG_SCREEN).matches);
    setOpen(true);
    setCid(id);
  };
  const close = () => { setOpen(false); setTucked(false); setSearchOpen(false); };
  // The keyboard handler reads the current list through a ref, set after each render.
  useLayoutEffect(() => { navRef.current = { ids: shown.map((r) => r.id), pick, close: () => { if (isOpen) close(); } }; });

  // The open item, idea or case, in one shape for IdeaDetail / IdeaDetailPhone: its brief, the feed,
  // what is already in motion, and where each decision goes.
  const selRow = rows.find((r) => r.id === cid);
  const briefCtx = { people: seed.people, depts: seed.depts, ideas: seed.ideas, briefs: seed.briefs };
  const personOrNull = (name: string) => (name === actor ? null : personFor(name, briefCtx));
  const item: IdeaProps | null = !selRow ? null : (() => {
    const idea = { id: selRow.id, kind: si ? "idea" as const : "case" as const, title: selRow.title, badge: badgeOf(selRow), tone: badgeTone(selRow.due, selRow.paused), raised: raisedPhrase(sentLabel(selRow.sent, now, selRow.exact)) };
    if (si) {
      const brief = briefFor(si, briefCtx);
      const asked = si.thread.filter((t) => t.by === actor);
      return {
        idea, brief, onClose: close,
        feed: [
          ...brief.feed.comments.map((c) => ({ name: c.name, role: c.role, text: c.text, when: c.daysAgo + " d", mine: false, person: personFor(c.name, briefCtx) })),
          ...si.thread.map((t) => ({ name: t.by === actor ? "You" : t.by, role: "Asked a question", text: t.text, when: f(t.day), mine: t.by === actor, person: personOrNull(t.by) })),
        ],
        status: asked.length ? { label: "More info requested", lines: asked.map((t) => "“" + t.text + "” · " + f(t.day)), sub: brief.author.name + " has been told." } : null,
        onDecide: (key: string) => {
          if (key === "approve") openSheet("assign", si.id, { people: si.team.filter((n) => n !== "—" && n !== "Anonymous") });
          else if (key === "info") openSheet("askIdea", si.id);
        },
      };
    }
    if (!sc) return null;
    const raised = raisedWith(sc);
    const standing = [...raised.affected, ...affectedOn(log, sc.id).map((a) => a.name).filter((n) => !raised.affected.includes(n))];
    const q = sc.question;
    return {
      idea, onClose: close,
      brief: briefForCase(sc, briefCtx, { promiseDays: P, me: who.name, affected: standing, attachments: raised.attachments, updates: rescoresOn(log, sc.id).length, passTo: handTo, history: handedNote }),
      feed: commentsOn(log, sc.id).map((m) => ({ name: m.by === actor ? "You" : m.by, role: m.rescore ? "New information" : "Comment", text: m.text, when: f(m.day), mine: m.by === actor, person: personOrNull(m.by) })),
      status: !q ? null : {
        label: q.answer ? sc.from + " answered" : "Your question is out",
        lines: ["“" + (q.text || "One question.") + "” · you asked " + f(q.day), ...(q.answer ? ["“" + q.answer.text + "” · " + f(q.answer.day)] : [])],
        sub: sc.status === "asked" ? "Waiting for " + sc.from + " · clock paused at " + sc.clock + " d" : "",
      },
      onDecide: (key: string) => {
        if (key === "yes") { act.decide(sc.id, "yes"); showToast("Answered “yes” in " + sc.clock + " days. " + sc.from + " has been told."); }
        else if (key === "no") openSheet("no", sc.id);
        else if (key === "hand") openSheet("hand", sc.id, { picked: handTo });
        else if (key === "ask") openSheet("ask", sc.id);
      },
      onComment: (text: string) => act.comment(sc.id, text),
    };
  })();
  const navIds = shown.map((r) => r.id), at = cid ? navIds.indexOf(cid) : -1;
  const searchCollapsed = isOpen && !searchOpen;

  if (!ready) return <PageSkeleton kind="inbox" delay />;

  return (
    <div className={styles.page} data-open={isOpen && !phone ? "true" : undefined} data-layer={isOpen && phone ? "true" : undefined} data-tucked={isOpen && tucked ? "true" : undefined} data-panels={panels}>
      <h1 className={styles.srOnly}>Inbox</h1>
      <div className={styles.top} aria-hidden={isOpen || undefined}>
        <div className={`${ui.stats} ${styles.stats}`}>
          {stats.map((k) => (
            <div key={k.l} className={`${ui.stat} ${styles.stat}`}>
              <div className={`${ui.statV} ${styles.statV}`} data-hot={k.hot ? "true" : undefined}>{k.v}</div>
              <div className={`${ui.statL} ${styles.statL}`}>{k.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.body}>
        <section className={styles.card} aria-label="Fresh ideas">
          <div className={styles.cardHead}>
            <button type="button" className={styles.tuck} onClick={() => setTucked((t) => !t)} title={tucked ? "Show inbox" : "Tuck inbox away"} aria-label={tucked ? "Show inbox" : "Tuck inbox away"} tabIndex={isOpen ? 0 : -1}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></svg>
            </button>
            <h2 className={styles.cardTitle} data-hidden={isOpen && searchOpen ? "true" : undefined}>Fresh ideas</h2>
            <div className={styles.tools}>
              <label className={styles.search} data-collapsed={searchCollapsed ? "true" : undefined}
                onClick={() => { if (searchCollapsed) { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 120); } }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search the inbox" tabIndex={searchCollapsed ? -1 : 0}
                  onBlur={() => { if (!query) setSearchOpen(false); }}
                  onKeyDown={(e) => { if (e.key === "Escape") { e.nativeEvent.stopImmediatePropagation(); setQuery(""); setSearchOpen(false); e.currentTarget.blur(); } }} />
                {(query || (isOpen && searchOpen)) && (
                  <button type="button" className={styles.clear} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); setQuery(""); setSearchOpen(false); searchRef.current?.blur(); }} title="Close search" aria-label="Close search">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                )}
              </label>
              <button type="button" className={styles.tool} onClick={() => setNewest((v) => !v)} title={newest ? "Sort: newest first" : "Sort: oldest first"} aria-label={newest ? "Sort: newest first" : "Sort: oldest first"}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" /></svg>
              </button>
              <button type="button" className={styles.tool} onClick={() => setFilter((v) => FILTERS[(FILTERS.indexOf(v) + 1) % FILTERS.length])} title={FILTER_TITLE[filter]} aria-label={FILTER_TITLE[filter]}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
              </button>
            </div>
          </div>

          <div className={styles.scroll} ref={listRef} data-selected={isOpen && cid ? cid : ""}>
            <div className={styles.hl} ref={hlRef} aria-hidden="true" />
            {rows.length === 0 ? (
              <div className={styles.empty}>Nothing is waiting on you.</div>
            ) : shown.length === 0 ? (
              <div className={styles.empty}>No ideas match.</div>
            ) : (
              <ul className={styles.list}>
                {shown.map((r) => {
                  const on = isOpen && cid === r.id;
                  return (
                    <li key={r.id}>
                      <button type="button" className={styles.row} data-row={r.id} onClick={() => pick(r.id)} data-active={on ? "true" : undefined} aria-current={on ? "true" : undefined} title={isOpen && tucked ? r.title : undefined}>
                        <span className={styles.avatar} data-avatar={avatarTone(r.name)} aria-hidden="true">{initialsOf(r.name)}</span>
                        <span className={styles.rowBody}>
                          <span className={styles.rowMain}>
                            <span className={styles.rowTitle}>{r.title}</span>
                            <span className={styles.rowWho}>{r.name} <span className={styles.rowRole}>· {r.role}</span></span>
                            {r.solves && <span className={styles.rowSolves}>{r.solves}</span>}
                          </span>
                          <span className={styles.rowRight}>
                            <span className={styles.sent}>{sentLabel(r.sent, now, r.exact)}</span>
                            <span className={styles.badge} data-tone={badgeTone(r.due, r.paused)}>{badgeOf(r)}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {picked && (
          <div className={styles.pane} ref={paneRef} aria-hidden={!isOpen || undefined}>
            <div ref={detailRef} className={styles.detailWrap}>
              {item && (phone
                ? <IdeaDetailPhone key={item.idea.id} {...item} nav={{ index: at, count: navIds.length, onPrev: () => at > 0 && pick(navIds[at - 1]), onNext: () => at < navIds.length - 1 && pick(navIds[at + 1]) }} />
                : <IdeaDetail key={item.idea.id} {...item} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
