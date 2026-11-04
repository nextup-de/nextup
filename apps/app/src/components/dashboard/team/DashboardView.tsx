"use client";
// The dashboard: the Claude Design handoff "Overview", its markup and classes 1:1 (dc-convert ->
// Overview.module.css). Closed, one table of problems and ideas - how long open, which of the five
// steps, whose desk, whose move it is. A row opens the case in place: the idea (OverviewIdea) and
// its chats (OverviewChats); ✕ or Escape puts the table back. A person's name opens their card.
// Rows are facts from dashboardRow() and features/overview/rows; an opened case shows its real
// comments and the raiser's versions, and a raiser with a question answers it through case.answered.
// The table pages 50 rows at a time.
// Who sees what (derive.visibleTo): an employee only what they raised; a team leader their own
// and their people's; a manager everything.
// `linkCases` (the static demo): every case has its own address, /cases/<id> - a row goes there, ✕ comes
// back - and that page is this view with `caseId` open. Otherwise the open case is ?id= on this page.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { useT } from "@/i18n/client";
import type { MessageKey, T } from "@/i18n";
import { visibleTo } from "@/components/dashboard/derive";
import { ArchiveTabs } from "@/components/dashboard/shared/ArchiveTabs";
import { inView, type ArchiveFilter, type ListView } from "@/features/cases/discussion";
import { initialsOf } from "@/components/dashboard/leader/IdeaParts";
import type { ReducedCase } from "@/features/cases/reducer";
import { dashboardRow, OVERVIEW_STEPS, overviewSteps, raisedWith, type DashRow, type OverviewStatus } from "@/features/cases/rows";
import { commentsOn, onDeskOf, rescoresOn } from "@/features/cases/selectors";
import { deskThread } from "@/features/cases/thread";
import { briefForCase, extOf } from "@/features/ideas/brief";
import { deskLabel, openSince, pageOf, type DeskLabel } from "@/features/overview/rows";
import { personHref } from "@/features/people/links";
import { formatDate } from "@/i18n/format";
import { loadRaised } from "@/lib/raised";
import { loadShots } from "@/lib/shots";
import s from "./Overview.module.css";
import { OverviewChats } from "./OverviewChats";
import { OverviewIdea, type IdeaMode, type OverviewIdeaProps } from "./OverviewIdea";
import { OverviewPhone } from "./OverviewPhone";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { avatarTone } from "@/lib/avatar";
import { DeptChip, PersonFace } from "@/components/ui/elements";
import { useIdInUrl, useUrlId } from "@/lib/use-url-id";

const EASE = "cubic-bezier(.2,.8,.2,1)";
// A phone gets its own case layout (OverviewPhone), like the inbox's IdeaDetailPhone.
const PHONE = "(max-width: 760px)";
const onPhoneChange = (fn: () => void) => { const m = window.matchMedia(PHONE); m.addEventListener("change", fn); return () => m.removeEventListener("change", fn); };
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

type Filter = "all" | "move" | "problem" | "idea" | "mine";
type Sort = "move" | "wait";
const FILTER_LABEL: Record<Filter, MessageKey> = { all: "team.dashFilterAll", move: "team.dashFilterMove", problem: "team.dashFilterProblem", idea: "team.dashFilterIdea", mine: "team.dashFilterMine" };
const SORT_LABEL: Record<Sort, MessageKey> = { move: "team.dashSortMove", wait: "team.dashSortWait" };
const STATUS_LABEL: Record<OverviewStatus, MessageKey> = {
  move: "team.dashStatusMove", asked: "team.dashStatusAsked", replied: "team.dashStatusReplied", waiting: "team.dashStatusWaiting", approved: "team.dashStatusApproved", declined: "team.dashStatusDeclined", building: "team.dashStatusBuilding", shipped: "team.dashStatusShipped",
};
const stepLabel = (t: T, step: number) => (step >= OVERVIEW_STEPS.length ? t("team.dashStatusShipped") : OVERVIEW_STEPS[step]);
// A case in a discussion is still waiting on its desk; the status says it is being talked over.
const statusLabel = (t: T, r: DashRow, st: OverviewStatus) => (r.talk && (st === "waiting" || st === "replied") ? t("team.dashInDiscussion") : t(STATUS_LABEL[st]));
// Still running: open, or waiting on an answer to a question (the clock is paused, nothing is answered yet).
const running = (r: DashRow) => r.open || r.paused;
const PAGE_SIZE = 50;

// A person's card, pinned under whatever was pressed and kept inside the window: their name and the
// seats they hold, and a link to their page when the viewer may open it (D15: no counts, no contact
// data; a handle has no page, so no link).
type Profile = { userId: string; name: string; x: number; y: number };
// On a phone it rises from the bottom as a sheet instead, like the inbox's person cards.
function ProfilePop({ profile, onClose, sheet }: { profile: Profile; onClose: () => void; sheet: boolean }) {
  const { href, tenant, seed } = useDemo();
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onClose, true);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("scroll", onClose, true); };
  }, [onClose]);
  const { name, userId } = profile;
  const seats = seed.seats.filter((x) => x.userId === userId).map((x) => seed.roles?.find((r) => r.id === x.roleId)?.title ?? "").filter(Boolean);
  const link = personHref(tenant, userId);
  return (
    <>
      <div className={s.closeProfile} data-sheet={sheet ? "true" : undefined} onClick={onClose} aria-hidden="true" />
      <div className={s.div113} data-sheet={sheet ? "true" : undefined} style={sheet ? undefined : { left: profile.x, top: profile.y }} role="dialog" aria-label={name}>
        <div className={s.div114}>
          <div className={s.div77}>
            <span className={s.initials5} data-avatar={avatarTone(name)}>{initialsOf(name)}</span>
            <span className={s.span2}><span className={s.desk}>{name}</span></span>
          </div>
          <div className={s.div115}>
            <span className={s.department}>{t("overview.personSeats")}</span>
            <span className={s.dept2}>{seats.length ? seats.join(", ") : t("overview.personNoSeat")}</span>
          </div>
          {link && <Link className={s.viewProfile} href={href(link)} onClick={onClose}>
            {t("team.dashViewProfile")}<svg width="8" height="12" viewBox="0 0 8 12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 1l5 5-5 5" /></svg>
          </Link>}
        </div>
      </div>
    </>
  );
}

export function DashboardView({ caseId, linkCases = false, embedded = false, title }: { caseId?: string; linkCases?: boolean; embedded?: boolean; title?: React.ReactNode } = {}) {
  const t = useT();
  const ctx = useDemo();
  const { seed, D, log, persona, role, ready, href, tenant, act, me, f, motion, flag } = ctx;
  const isMe = (userId: string | null | undefined) => me.userId !== null && userId === me.userId;
  const router = useRouter();
  const [view, setView] = useState<ListView>("open");
  const [archived, setArchived] = useState<ArchiveFilter>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("move");
  const [menu, setMenu] = useState<"filter" | "sort" | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // The open case: from /cases/<id> (linkCases) or from ?id=, which keeps it in the address after that.
  const urlId = useUrlId();
  const [sel, setSel] = useState<string | null>(caseId ?? urlId);
  useIdInUrl(linkCases ? null : sel, setSel);
  const [mode, setMode] = useState<IdeaMode>("idea");
  const [pg, setPg] = useState({ key: "", n: 1 }); // the page the table is on, forgotten when the list changes
  const paneRef = useRef<HTMLDivElement>(null);
  const prevSel = useRef<string | null>(null);
  const phone = useSyncExternalStore(onPhoneChange, () => window.matchMedia(PHONE).matches, () => false);
  const openCase = useCallback((id: string) => (linkCases ? router.push(href("/cases/" + id)) : setSel(id)), [linkCases, router, href]);
  const closeCase = useCallback(() => (linkCases ? router.push(href("/overview")) : setSel(null)), [linkCases, router, href]);

  // Escape closes the open menu, else the open case (popovers and inputs handle their own first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menu) setMenu(null);
      else if (sel && !isTyping(e.target)) closeCase();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, sel, closeCase]);

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
  // With projects on, the table shows what is still moving; what was decided sits in the Archive.
  const split = flag("projects");
  const everyRow = D.cases.filter((c) => visibleTo(ctx, c)).map((c) => dashboardRow(c, P, me, log));
  const rows = split ? everyRow.filter((r) => inView(r.archive, view, archived) || r.id === sel) : everyRow;
  const filters: Filter[] = role === "member" ? ["all", "move", "problem", "idea"] : ["all", "move", "problem", "idea", "mine"]; // every row is the employee's own
  // Your move: a question for you, or someone's case on your desk, waiting for your answer.
  const onMyDesk = (r: DashRow) => { const x = D.cases.find((k) => k.id === r.id); return !!x && onDeskOf(x, me); };
  const yourMove = (r: DashRow) => r.status === "move"
    || (!r.mine && r.open && (r.status === "waiting" || r.status === "replied") && onMyDesk(r));
  const shownStatus = (r: DashRow): OverviewStatus => (yourMove(r) ? "move" : r.status);
  const test: Record<Filter, (r: DashRow) => boolean> = {
    all: () => true, move: yourMove, problem: (r) => r.kind === "problem", idea: (r) => r.kind === "idea", mine: (r) => r.mine,
  };
  const shown = rows.filter(test[filter]).sort((a, b) => {
    if (running(a) !== running(b)) return running(a) ? -1 : 1;
    if (sort === "move" && yourMove(a) !== yourMove(b)) return yourMove(a) ? -1 : 1;
    return b.openDays - a.openDays;
  });
  const pageKey = [filter, sort, view, archived].join("|");
  const lastPage = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const page = Math.min(pg.key === pageKey ? pg.n : 1, lastPage);
  const pageRows = pageOf(shown, page, PAGE_SIZE);
  const from = shown.length ? (page - 1) * PAGE_SIZE + 1 : 0, to = from + pageRows.length - (shown.length ? 1 : 0);
  const goPage = (n: number) => setPg({ key: pageKey, n });
  const roleTitles = seed.roles ?? [];
  const deskOf = (cs: ReducedCase): DeskLabel => deskLabel(cs, seed.seats, roleTitles);
  const deskNameOf = (d: DeskLabel) => d.role ?? t("overview.deskNone");
  const deskSubOf = (d: DeskLabel) => d.names.join(", ") + (d.more > 0 ? " " + t("overview.deskMore", { count: d.more }) : "") + (d.role !== null && d.names.length === 0 ? t("overview.deskVacant") : "");
  const caseOf = (id: string) => D.cases.find((k) => k.id === id) ?? null;

  // A card for someone with a user id (never looked up by name); a case without one has no card.
  const profileOf = (userId: string | null, name: string) => (userId === null ? null : (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault(); e.stopPropagation();
    const u = window.innerWidth > 760 && window.innerWidth < 1600 ? 0.75 : 1, w = 280 * u;
    const b = e.currentTarget.getBoundingClientRect();
    setProfile({ userId, name, x: Math.max(8, Math.min(b.left, window.innerWidth - w - 8)), y: Math.max(8, Math.min(b.bottom + 8, window.innerHeight - 200 * u)) });
  });
  const pick = (id: string) => { openCase(id); setMode("idea"); setMenu(null); };
  const pop = profile && <ProfilePop profile={profile} sheet={phone} onClose={() => setProfile(null)} />;
  let phoneCase: React.ReactNode = null; // on a phone the open case is a layer over the table

  // The open case - only one this viewer may see - with everything its two halves show, as props.
  const row = sel ? rows.find((r) => r.id === sel) ?? null : null;
  const c = row ? D.cases.find((x) => x.id === row.id) ?? null : null;
  if (row && c) {
    const desk = deskOf(c);
    const raised = raisedWith(c);
    const added = rescoresOn(log, c.id);
    // The written brief when there is one: the static demo's, or what the raise page saved when it was published here.
    const brief = briefForCase(c, { ...briefCtx, briefs: { ...seed.briefs, ...loadRaised(tenant.slug) } }, {
      promiseDays: P, me: row.mine ? c.from : persona.who.name, affected: row.affected, attachments: raised.attachments, updates: added.length,
      passTo: "", history: "", side: onDeskOf(c, me) && !row.mine ? "desk" : "raiser",
    });
    const late = row.open && row.overdue;
    // The first chat is with whoever holds it (the role, then its holders) - or, for the holder, with whoever raised it.
    const talk = onDeskOf(c, me) && !row.mine ? { name: c.from, sub: c.fromDept } : { name: deskNameOf(desk), sub: deskSubOf(desk) };
    const roleTitleOf = (userId: string | null) => {
      const seat = userId === null ? undefined : seed.seats.find((x) => x.userId === userId);
      return (seat && roleTitles.find((r) => r.id === seat.roleId)?.title) || "";
    };
    const canAnswer = row.mine && c.status === "asked";
    const ideaProps: OverviewIdeaProps = {
      id: c.id, title: c.title, raised: f(c.raisedDay), dept: (row.mine ? "" : c.from + " · ") + c.fromDept,
      steps: overviewSteps(c, f, row.mine, ctx.locale), desk,
      wait: {
        text: !running(row) ? t("team.dashWaitAnswered", { n: row.clock }) : late ? t("team.dashWaitLate", { n: row.clock, days: P }) : t(row.paused ? "team.dashWaitOpenPaused" : "team.dashWaitOpen", { n: row.clock, days: P }),
        pct: Math.min(100, (row.clock / P) * 100), tone: !running(row) ? "done" : late ? "late" : "open",
      },
      brief,
      // What the raise page attached (the idea document, PDFs, sheets), then the screenshots kept in this browser.
      files: [...brief.files.map((x) => ({ name: x.name, ext: x.ext || "FILE", meta: x.size || t("team.dashFile") })), ...loadShots(tenant.slug, c.id).map((x) => ({ name: x.name, ext: extOf(x.name) || "IMG", meta: t("team.dashScreenshot") }))],
      added: added.map((m) => ({ text: m.text, when: f(m.day) + (isMe(m.byUserId) ? "" : " · " + m.by) })),
      versions: c.versions.length > 1 ? c.versions.map((v) => ({ n: v.version, when: f(v.day), title: v.title })) : [],
      mode, onMode: setMode, onClose: closeCase,
    };
    const chats = (
          <OverviewChats key={c.id} me={me} talk={talk} status={row.status} yourMove={yourMove(row)} entries={deskThread(c, log, seed.seats)} f={f}
            canAnswer={canAnswer} onSend={(text) => (canAnswer ? act.answer(c.id, text) : act.comment(c.id, text))}
            supporters={brief.feed.supporters} sentiment={brief.feed.sentiment}
            feed={commentsOn(log, c.id).filter((m) => !m.rescore).map((m) => ({ name: isMe(m.byUserId) ? t("team.dashYou") : m.by, userId: m.byUserId ?? null, role: isMe(m.byUserId) ? t("team.dashYou") : roleTitleOf(m.byUserId ?? null) || t("team.dashComment"), text: m.text, when: f(m.day), mine: isMe(m.byUserId) }))}
            onComment={(text) => act.comment(c.id, text)}
            profileOf={profileOf} />
    );
    if (phone) {
      const ids = shown.map((r) => r.id), at = ids.indexOf(c.id);
      phoneCase = (
        <OverviewPhone key={c.id} idea={ideaProps} chats={chats} yourMove={yourMove(row)}
          nav={{ index: at, count: ids.length, onPrev: () => at > 0 && openCase(ids[at - 1]), onNext: () => at < ids.length - 1 && openCase(ids[at + 1]) }} />
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
    <div className={s.root} data-embedded={embedded ? "true" : undefined}>
      <div className={s.div7}>
        <div className={s.div8}>
          <div className={s.div9}>
            {/* On the Projects page the column brings its own heading, with Open | Archive beside it. */}
            {embedded ? title : <h1 className={s.overview}>{t("team.dashOverview")}</h1>}
            {embedded && split && <ArchiveTabs quiet view={view} filter={archived} outcomes={everyRow.map((r) => r.archive)} onView={setView} onFilter={setArchived} />}
          </div>
          <div className={s.div10}>
            {menu && <div className={s.closeMenu} onClick={() => setMenu(null)} aria-hidden="true" />}
            <div className={s.div11}>
              <button type="button" className={s.toggleFilter} onClick={() => setMenu(menu === "filter" ? null : "filter")} aria-expanded={menu === "filter"} aria-haspopup="menu">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                {filter === "all" ? t("team.dashFilter") : t(FILTER_LABEL[filter])}
              </button>
              {menu === "filter" && (
                <div className={s.div12} role="menu">
                  {filters.map((k) => (
                    <button key={k} type="button" role="menuitemradio" aria-checked={filter === k} className={s.pick} data-on={filter === k ? "true" : undefined} onClick={() => { setFilter(k); setMenu(null); }}>
                      <span className={s.label}>{t(FILTER_LABEL[k])}</span>
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
                {sort === "move" ? t("team.dashSort") : t(SORT_LABEL[sort])}
              </button>
              {menu === "sort" && (
                <div className={s.div12} role="menu">
                  {(["move", "wait"] as const).map((k) => (
                    <button key={k} type="button" role="menuitemradio" aria-checked={sort === k} className={s.pick} data-on={sort === k ? "true" : undefined} onClick={() => { setSort(k); setMenu(null); }}>
                      <span className={s.label}>{t(SORT_LABEL[k])}</span>
                      <span className={s.check}>{sort === k ? "✓" : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        {split && !embedded && <div className={s.archiveBar}><ArchiveTabs view={view} filter={archived} outcomes={everyRow.map((r) => r.archive)} onView={setView} onFilter={setArchived} /></div>}
        <div className={s.div13} role="table" aria-label={t("team.dashTable")}>
          <div className={s.div14} role="row">
            <span role="columnheader">{t("team.dashColWhat")}</span><span role="columnheader">{t("team.dashColOpenSince")}</span><span role="columnheader">{t("team.dashColStage")}</span><span role="columnheader">{t("team.dashColDesk")}</span>
            <span role="columnheader" className={s.status}>{t("team.dashColStatus")}</span>
          </div>
          {pageRows.map((r, i) => {
            const cs = caseOf(r.id);
            const desk = cs ? deskOf(cs) : { role: null, names: [], more: 0, escalation: null };
            const deskName = deskNameOf(desk), deskSub = deskSubOf(desk);
            const os = cs ? openSince(cs, log.day, seed.clock) : { date: null, days: r.openDays, pastPromise: 0 };
            const late = r.open && r.overdue;
            const st = shownStatus(r);
            const badgeTone = st === "move" ? "move" : st === "replied" ? "replied" : undefined;
            const days = running(r) ? r.openDays : r.clock;
            const whenSub = !running(r) ? t("team.dashAnswered")
              : late ? (os.date ? t("overview.pastPromise", { count: os.pastPromise }) : t("team.dashPastPromise"))
              : r.paused ? t("team.dashClockPaused")
              : os.date ? t("overview.sinceDate", { date: formatDate(ctx.locale, new Date(os.date + "T12:00:00Z"), "dayMonth") })
              : t("team.dashDaysLeft", { n: P - r.clock });
            // A phone gets the inbox's list row: the desk's role as the avatar, the title and two quiet lines,
            // days open and the status on the right. The steps and roles live in the opened case.
            if (phone) return (
              <div key={r.id} className={s.mRow} role="row" tabIndex={0} onClick={() => pick(r.id)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) pick(r.id); }}>
                <span className={s.mAvatar} data-avatar={avatarTone(deskName)} aria-hidden="true">{initialsOf(deskName)}</span>
                <span className={s.mBody}>
                  <span className={s.mMain} role="cell">
                    <span className={s.mTitle}>{r.title}</span>
                    <span className={s.mWho}>{deskName}<span className={s.mMute}> · {stepLabel(t, r.step)}</span></span>
                    <span className={s.mSub}>{r.mine ? null : r.from + " · "}{r.fromDept ? <DeptChip name={r.fromDept} /> : null}</span>
                  </span>
                  <span className={s.mRight} role="cell">
                    <span className={s.mWhen} data-tone={late ? "late" : undefined}>{!running(r) ? t("team.dashAnswered") : late ? t("team.dashPastPromise") : t("team.dashDaysOpen", { n: r.openDays })}</span>
                    <span className={s.badge} data-tone={badgeTone}>{statusLabel(t, r, st)}</span>
                  </span>
                </span>
              </div>
            );
            return (
              <div key={r.id} className={s.pick2} role="row" tabIndex={0} onClick={() => pick(r.id)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) pick(r.id); }} style={{ animationDelay: Math.min(i, 12) * 55 + "ms" }}>
                <div className={s.div15} role="cell">
                  <span className={s.title}>{r.title}</span>
                  <div className={s.div16}><span className={s.dept}>{r.mine ? null : r.from + " · "}{r.fromDept ? <DeptChip name={r.fromDept} /> : null}</span></div>
                </div>
                <div className={s.div17} role="cell" data-tone={late ? "late" : !running(r) ? "done" : undefined}>
                  <span className={s.wait}>{os.date ? t("overview.workdays", { count: days }) : t("team.dashDaysShort", { n: days })}</span>
                  <span className={s.waitSub}>{whenSub}</span>
                </div>
                <div className={s.div18} role="cell">
                  <span className={s.stage}>{stepLabel(t, r.step)}</span>
                  <div className={s.div19}>{OVERVIEW_STEPS.map((x, k) => <span key={x} className={s.span} data-tone={k < r.step ? "done" : k === r.step ? "now" : undefined} />)}</div>
                </div>
                <div className={s.onProfile} role="cell">
                  <PersonFace name={deskName} size="sm" />
                  <span className={s.span2}>
                    <span className={s.desk}>{deskName}</span>
                    {deskSub && <span className={s.role}>{deskSub}</span>}
                    {desk.escalation && <span className={s.deskEsc}>{t("overview.deskMoved", { role: desk.escalation })}</span>}
                  </span>
                </div>
                <div className={s.div5} role="cell"><span className={s.badge} data-tone={badgeTone}>{statusLabel(t, r, st)}</span></div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className={s.nothingHere}>{role === "member" ? t("team.dashEmptyMember") : t("team.dashEmptyOther")} <Link href={href("/raise")}>{t("team.dashRaiseFirst")}</Link></div>
          )}
          {rows.length > 0 && shown.length === 0 && <div className={s.nothingHere}>{t("team.dashNothingHere")}</div>}
        </div>
        {shown.length > PAGE_SIZE && (
          <div className={s.pager} role="navigation">
            <span className={s.pagerInfo}>{t("overview.pageRange", { from, to, n: shown.length })}</span>
            <button type="button" className={s.pagerBtn} disabled={page <= 1} onClick={() => goPage(page - 1)} aria-label={t("overview.pagePrev")}>‹</button>
            <button type="button" className={s.pagerBtn} disabled={page >= lastPage} onClick={() => goPage(page + 1)} aria-label={t("overview.pageNext")}>›</button>
          </div>
        )}
      </div>
      <div className={s.layer} data-open={phoneCase ? "true" : undefined} data-layer={phoneCase ? "true" : undefined} aria-hidden={!phoneCase || undefined}>{phoneCase}</div>
      {pop}
    </div>
  );
}
