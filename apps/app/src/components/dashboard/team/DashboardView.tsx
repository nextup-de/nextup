"use client";
// The dashboard: the Claude Design handoff "Overview", its markup and classes 1:1 (dc-convert ->
// Overview.module.css). Closed, one table of problems and ideas - how long open, which of the five
// steps, whose desk, whose move it is. A row opens the case in place: the idea (OverviewIdea) and
// its chats (OverviewChats); ✕ or Escape puts the table back. A person's name opens their card.
// Rows are facts from dashboardRow(); what the log cannot record yet lives in usePreview().
// Who sees what (derive.visibleTo): an employee only what they raised; a team leader their own
// and their people's; a manager everything.
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { visibleTo } from "@/components/dashboard/derive";
import { initialsOf } from "@/components/dashboard/leader/IdeaParts";
import { dashboardRow, OVERVIEW_STEPS, overviewSteps, raisedWith, type DashRow, type OverviewStatus } from "@/features/cases/rows";
import { commentsOn, onDesk, rescoresOn } from "@/features/cases/selectors";
import { deskThread } from "@/features/cases/thread";
import { briefForCase, extOf, personFor, type Person } from "@/features/ideas/brief";
import { loadShots } from "@/lib/shots";
import s from "./Overview.module.css";
import { OverviewChats } from "./OverviewChats";
import { OverviewIdea, type IdeaMode, type OverviewIdeaProps } from "./OverviewIdea";
import { OverviewPhone } from "./OverviewPhone";
import { usePreview } from "./overviewPreview";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";

const EASE = "cubic-bezier(.2,.8,.2,1)";
// A phone gets its own case layout (OverviewPhone), like the inbox's IdeaDetailPhone.
const PHONE = "(max-width: 760px)";
const onPhoneChange = (fn: () => void) => { const m = window.matchMedia(PHONE); m.addEventListener("change", fn); return () => m.removeEventListener("change", fn); };
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

type Filter = "all" | "move" | "problem" | "idea" | "mine";
type Sort = "move" | "wait";
const FILTER_LABEL: Record<Filter, string> = { all: "All", move: "Your move", problem: "Problems", idea: "Ideas", mine: "Mine" };
const SORT_LABEL: Record<Sort, string> = { move: "Your move first", wait: "Longest waiting" };
const STATUS_LABEL: Record<OverviewStatus, string> = {
  move: "Your move", asked: "Needs more info", replied: "Replied", waiting: "Waiting", approved: "Approved", declined: "Not now", building: "Building", shipped: "Shipped",
};
// Avatar colours: the inbox's grey and four muted accents, picked by name so a person keeps theirs.
const AVATAR_TONES = ["grey", "blue", "clay", "sage", "lilac"] as const;
const toneOf = (name: string) => AVATAR_TONES[[...name].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7) % AVATAR_TONES.length];
const stepLabel = (step: number) => (step >= OVERVIEW_STEPS.length ? "Shipped" : OVERVIEW_STEPS[step]);

// A person's card, pinned under whatever was pressed and kept inside the window.
type Profile = { p: Person; feed: boolean; x: number; y: number };
// On a phone it rises from the bottom as a sheet instead, like the inbox's person cards.
function ProfilePop({ profile, onClose, sheet }: { profile: Profile; onClose: () => void; sheet: boolean }) {
  const [soon, setSoon] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onClose, true);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("scroll", onClose, true); };
  }, [onClose]);
  const { p } = profile;
  return (
    <>
      <div className={s.closeProfile} data-sheet={sheet ? "true" : undefined} onClick={onClose} aria-hidden="true" />
      <div className={s.div113} data-sheet={sheet ? "true" : undefined} style={sheet ? undefined : { left: profile.x, top: profile.y }} role="dialog" aria-label={p.name}>
        <div className={s.div114}>
          <div className={s.div77}>
            <span className={s.initials5} data-feed={profile.feed ? "true" : undefined}>{initialsOf(p.name)}</span>
            <span className={s.span2}><span className={s.desk}>{p.name}</span><span className={s.dept}>{p.role}</span></span>
          </div>
          <div className={s.div115}>
            <span className={s.department}>Department</span><span className={s.dept2}>{p.dept || "—"}</span>
            <span className={s.department}>Location</span><span className={s.dept2}>{p.location || "—"}</span>
            <span className={s.department}>Email</span><a className={s.email} href={"mailto:" + p.email}>{p.email}</a>
          </div>
          <button type="button" className={s.viewProfile} onClick={() => setSoon(true)}>
            View profile<svg width="8" height="12" viewBox="0 0 8 12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 1l5 5-5 5" /></svg>
          </button>
          {soon && <span className={s.soonNote} role="status">Profile pages are coming soon.</span>}
        </div>
      </div>
    </>
  );
}

export function DashboardView() {
  const ctx = useDemo();
  const { seed, D, log, persona, role, ready, href, tenant, act, actor, f, motion } = ctx;
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("move");
  const [menu, setMenu] = useState<"filter" | "sort" | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<IdeaMode>("idea");
  const [editSignal, setEditSignal] = useState(0); // bumped by the chat's "Add details"
  const paneRef = useRef<HTMLDivElement>(null);
  const prevSel = useRef<string | null>(null);
  const preview = usePreview(); // what the event log cannot record yet: edits, answers to a decision, chats, replies
  const phone = useSyncExternalStore(onPhoneChange, () => window.matchMedia(PHONE).matches, () => false);

  // Escape closes the open menu, else the open case (popovers and inputs handle their own first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menu) setMenu(null);
      else if (sel && !isTyping(e.target)) setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, sel]);

  // Opening or switching: the pane scrolls to its top and rises in (the design's componentDidUpdate).
  useEffect(() => {
    const was = prevSel.current;
    prevSel.current = sel;
    const pane = paneRef.current;
    if (!sel || !pane || was === sel) return;
    pane.scrollTop = 0;
    if (!motion || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    [...pane.children].forEach((el, k) => {
      el.getAnimations().forEach((a) => a.cancel());
      el.animate([{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: EASE, delay: 60 * k, fill: "backwards" });
    });
  }, [sel, motion]);
  if (!ready) return <PageSkeleton kind="dashboard" delay />;

  const P = seed.promiseDays;
  const briefCtx = { people: seed.people, depts: seed.depts, ideas: seed.ideas };
  const rows = D.cases.filter((c) => visibleTo(ctx, c)).map((c) => dashboardRow(c, P, persona.who, log));
  const filters: Filter[] = role === "member" ? ["all", "move", "problem", "idea"] : ["all", "move", "problem", "idea", "mine"]; // every row is the employee's own
  // Your move: a question for you; a decision on your case you have not answered yet (a stand-in until
  // it has its event, so a reload asks again); or someone's case on your desk, waiting for your answer.
  const onMyDesk = (r: DashRow) => { const x = D.cases.find((k) => k.id === r.id); return !!x && onDesk(x, persona.who.name); };
  const yourMove = (r: DashRow) => r.status === "move"
    || (r.mine && (r.status === "approved" || r.status === "declined") && !preview.responses[r.id])
    || (!r.mine && r.open && (r.status === "waiting" || r.status === "replied") && onMyDesk(r));
  const shownStatus = (r: DashRow): OverviewStatus => (yourMove(r) ? "move" : preview.responses[r.id] ? "replied" : r.status);
  const test: Record<Filter, (r: DashRow) => boolean> = {
    all: () => true, move: yourMove, problem: (r) => r.kind === "problem", idea: (r) => r.kind === "idea", mine: (r) => r.mine,
  };
  const shown = rows.filter(test[filter]).sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1;
    if (sort === "move" && yourMove(a) !== yourMove(b)) return yourMove(a) ? -1 : 1;
    return b.openDays - a.openDays;
  });

  const roleOf = (name: string) => seed.people.find((x) => x.name === name)?.role ?? "";
  const openProfile = (name: string, feed = false) => (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault(); e.stopPropagation();
    const p = personFor(name, briefCtx);
    if (!p) return;
    const u = window.innerWidth > 760 && window.innerWidth < 1600 ? 0.75 : 1, w = 280 * u;
    const b = e.currentTarget.getBoundingClientRect();
    setProfile({ p, feed, x: Math.max(8, Math.min(b.left, window.innerWidth - w - 8)), y: Math.max(8, Math.min(b.bottom + 8, window.innerHeight - 260 * u)) });
  };
  const profileOf = (name: string, feed = false) => (personFor(name, briefCtx) ? openProfile(name, feed) : null);
  const pick = (id: string) => { setSel(id); setMode("idea"); setMenu(null); };
  const pop = profile && <ProfilePop profile={profile} sheet={phone} onClose={() => setProfile(null)} />;
  let phoneCase: React.ReactNode = null; // on a phone the open case is a layer over the table

  // The open case - only one this viewer may see - with everything its two halves show, as props.
  const row = sel ? rows.find((r) => r.id === sel) ?? null : null;
  const c = row ? D.cases.find((x) => x.id === row.id) ?? null : null;
  if (row && c) {
    const desk = row.chain[row.chain.length - 1];
    const raised = raisedWith(c);
    const added = rescoresOn(log, c.id);
    const brief = briefForCase(c, briefCtx, {
      promiseDays: P, me: row.mine ? c.from : persona.who.name, affected: row.affected, attachments: raised.attachments, updates: added.length,
      passTo: "", history: "", side: onDesk(c, persona.who.name) && !row.mine ? "desk" : "raiser",
    });
    const late = row.open && row.overdue;
    const other = desk === persona.who.name && !row.mine ? c.from : desk; // the first chat is with whoever holds it - or, for the holder, with whoever raised it
    const canAnswer = row.mine && c.status === "asked";
    const ideaProps: OverviewIdeaProps = {
      id: c.id, title: c.title, raised: f(c.raisedDay), dept: (row.mine ? "" : c.from + " · ") + c.fromDept,
      steps: overviewSteps(c, f, row.mine), desk: { name: desk, role: roleOf(desk) },
      wait: {
        text: !row.open ? "answered in " + row.clock + " d" : late ? row.clock + " d · past the " + P + "-day promise" : row.clock + " d of the " + P + "-day promise",
        pct: Math.min(100, (row.clock / P) * 100), tone: !row.open ? "done" : late ? "late" : "open",
      },
      brief,
      files: loadShots(tenant.slug, c.id).map((x) => ({ name: x.name, ext: extOf(x.name) || "IMG", meta: "Screenshot" })),
      added: added.map((m) => ({ text: m.text, when: f(m.day) + (m.by === actor ? "" : " · " + m.by) })),
      mode, onMode: setMode, editSignal,
      edit: preview.edits[c.id] ?? null, onSave: (e) => preview.saveEdit(c.id, e), // as in the design, anyone who opens it may edit
      onProfile: profileOf(desk), onClose: () => setSel(null),
    };
    const chats = (
          <OverviewChats key={c.id} mine={row.mine} me={actor} day={log.day} desk={{ name: other, role: roleOf(other) || (other === c.from ? c.fromDept : "") }}
            status={row.status} yourMove={yourMove(row)} open={row.open} entries={deskThread(c, log)} f={f}
            canAnswer={canAnswer} onSend={(t) => (canAnswer ? act.answer(c.id, t) : act.comment(c.id, t))}
            deputy={c.route && c.route.deputy !== desk ? c.route.deputy : null}
            supporters={brief.feed.supporters} sentiment={brief.feed.sentiment}
            feed={commentsOn(log, c.id).filter((m) => !m.rescore).map((m) => ({ name: m.by === actor ? "You" : m.by, role: m.by === actor ? "You" : roleOf(m.by) || "Comment", text: m.text, when: f(m.day), mine: m.by === actor }))}
            onComment={(t) => act.comment(c.id, t)}
            directory={seed.people.filter((x) => x.name !== persona.who.name).map((x) => ({ name: x.name, role: x.role }))}
            onDetails={() => { setMode("idea"); setEditSignal((n) => n + 1); }}
            profileOf={profileOf}
            response={preview.responses[c.id] ?? null} onRespond={(r) => preview.respond(c.id, r)}
            chats={preview.chats[c.id] ?? []} onStartChat={(name) => preview.startChat(c.id, name)}
            msgs={(t) => preview.msgs[c.id + ":" + t] ?? []} onLocal={(t, m) => preview.send(c.id, t, m)}
            replies={Object.fromEntries(Object.entries(preview.replies).filter(([k]) => k.startsWith(c.id + ":")).map(([k, v]) => [Number(k.slice(c.id.length + 1)), v.map((m) => ({ text: m.text, when: f(m.day) }))]))}
            onReply={(i, t) => preview.reply(c.id, i, { text: t, file: null, day: log.day })} />
    );
    if (phone) {
      const ids = shown.map((r) => r.id), at = ids.indexOf(c.id);
      phoneCase = (
        <OverviewPhone key={c.id} idea={ideaProps} chats={chats} yourMove={yourMove(row)} editSignal={editSignal}
          nav={{ index: at, count: ids.length, onPrev: () => at > 0 && setSel(ids[at - 1]), onNext: () => at < ids.length - 1 && setSel(ids[at + 1]) }} />
      );
    } else {
      return (
        <div className={s.root} data-open="true">
          <div className={s.div20}>
            <div className={s.div21} ref={paneRef}><OverviewIdea key={c.id} {...ideaProps} /></div>
            {chats}
          </div>
          {pop}
        </div>
      );
    }
  }

  return (
    <div className={s.root}>
      <div className={s.div7}>
        <div className={s.div8}>
          <div className={s.div9}>
            <h1 className={s.overview}>Dashboard</h1>
          </div>
          <div className={s.div10}>
            {menu && <div className={s.closeMenu} onClick={() => setMenu(null)} aria-hidden="true" />}
            <div className={s.div11}>
              <button type="button" className={s.toggleFilter} onClick={() => setMenu(menu === "filter" ? null : "filter")} aria-expanded={menu === "filter"} aria-haspopup="menu">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                {filter === "all" ? "Filter" : FILTER_LABEL[filter]}
              </button>
              {menu === "filter" && (
                <div className={s.div12} role="menu">
                  {filters.map((k) => (
                    <button key={k} type="button" role="menuitemradio" aria-checked={filter === k} className={s.pick} data-on={filter === k ? "true" : undefined} onClick={() => { setFilter(k); setMenu(null); }}>
                      <span className={s.label}>{FILTER_LABEL[k]}</span>
                      <span className={s.count}>{rows.filter(test[k]).length}</span>
                      <span className={s.check}>{filter === k ? "✓" : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className={s.div11}>
              <button type="button" className={s.toggleSort} onClick={() => setMenu(menu === "sort" ? null : "sort")} aria-expanded={menu === "sort"} aria-haspopup="menu">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" /></svg>
                {sort === "move" ? "Sort" : SORT_LABEL[sort]}
              </button>
              {menu === "sort" && (
                <div className={s.div12} role="menu">
                  {(["move", "wait"] as const).map((k) => (
                    <button key={k} type="button" role="menuitemradio" aria-checked={sort === k} className={s.pick} data-on={sort === k ? "true" : undefined} onClick={() => { setSort(k); setMenu(null); }}>
                      <span className={s.label}>{SORT_LABEL[k]}</span>
                      <span className={s.check}>{sort === k ? "✓" : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className={s.div13} role="table" aria-label="Problems and ideas">
          <div className={s.div14} role="row">
            <span role="columnheader">What</span><span role="columnheader">Open since</span><span role="columnheader">Stage</span><span role="columnheader">On whose desk</span>
            <span role="columnheader" className={s.status}>Status</span>
          </div>
          {shown.map((r, i) => {
            const desk = r.chain[r.chain.length - 1];
            const late = r.open && r.overdue;
            const st = shownStatus(r);
            const open = profileOf(desk);
            const badgeTone = st === "move" ? "move" : st === "replied" ? "replied" : undefined;
            // A phone gets the inbox's list row: whose desk as the avatar, the title and two quiet lines,
            // days open and the status on the right. The steps and roles live in the opened case.
            if (phone) return (
              <div key={r.id} className={s.mRow} role="row" tabIndex={0} onClick={() => pick(r.id)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) pick(r.id); }}>
                <span className={s.mAvatar} data-tone={toneOf(desk)} aria-hidden="true">{initialsOf(desk)}</span>
                <span className={s.mBody}>
                  <span className={s.mMain} role="cell">
                    <span className={s.mTitle}>{r.title}</span>
                    <span className={s.mWho}>{desk}<span className={s.mMute}> · {stepLabel(r.step)}</span></span>
                    <span className={s.mSub}>{r.mine ? r.fromDept : r.from + " · " + r.fromDept}</span>
                  </span>
                  <span className={s.mRight} role="cell">
                    <span className={s.mWhen} data-tone={late ? "late" : undefined}>{!r.open ? "answered" : late ? "past promise" : r.openDays + " d open"}</span>
                    <span className={s.badge} data-tone={badgeTone}>{STATUS_LABEL[st]}</span>
                  </span>
                </span>
              </div>
            );
            return (
              <div key={r.id} className={s.pick2} role="row" tabIndex={0} onClick={() => pick(r.id)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) pick(r.id); }} style={{ animationDelay: i * 55 + "ms" }}>
                <div className={s.div15} role="cell">
                  <span className={s.title}>{r.title}</span>
                  <div className={s.div16}><span className={s.dept}>{r.mine ? r.fromDept : r.from + " · " + r.fromDept}</span></div>
                </div>
                <div className={s.div17} role="cell" data-tone={late ? "late" : !r.open ? "done" : undefined}>
                  <span className={s.wait}>{(r.open ? r.openDays : r.clock) + " d"}</span>
                  <span className={s.waitSub}>{!r.open ? "answered" : late ? "past promise" : r.paused ? "clock paused" : P - r.clock + " d left"}</span>
                </div>
                <div className={s.div18} role="cell">
                  <span className={s.stage}>{stepLabel(r.step)}</span>
                  <div className={s.div19}>{OVERVIEW_STEPS.map((x, k) => <span key={x} className={s.span} data-tone={k < r.step ? "done" : k === r.step ? "now" : undefined} />)}</div>
                </div>
                {open ? (
                  <button type="button" className={s.onProfile} role="cell" onClick={open} title={"View " + desk}>
                    <span className={s.initials}>{initialsOf(desk)}</span>
                    <span className={s.span2}><span className={s.desk}>{desk}</span><span className={s.role}>{roleOf(desk)}</span></span>
                  </button>
                ) : (
                  <div className={s.onProfile} role="cell">
                    <span className={s.initials}>{initialsOf(desk)}</span>
                    <span className={s.span2}><span className={s.desk}>{desk}</span><span className={s.role}>{roleOf(desk)}</span></span>
                  </div>
                )}
                <div className={s.div5} role="cell"><span className={s.badge} data-tone={badgeTone}>{STATUS_LABEL[st]}</span></div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className={s.nothingHere}>{role === "member" ? "You have not raised anything yet." : "Nothing here yet."} <Link href={href("/raise")}>Raise the first one →</Link></div>
          )}
          {rows.length > 0 && shown.length === 0 && <div className={s.nothingHere}>Nothing here.</div>}
        </div>
      </div>
      <div className={s.layer} data-open={phoneCase ? "true" : undefined} data-layer={phoneCase ? "true" : undefined} aria-hidden={!phoneCase || undefined}>{phoneCase}</div>
      {pop}
    </div>
  );
}
