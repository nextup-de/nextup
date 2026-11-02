"use client";
// Top bar: burger (mobile), search (⌘K) with grouped results, the "decisions waiting" dropdown
// and the user menu. Port of nh-topbar in legacy/demo/index.html.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { inboxSorted, mineRows, openCases } from "@/components/dashboard/derive";
import { decisionsWaiting } from "@/features/metrics";
import { buildIndex, highlight, runSearch, tokens, type SearchItem } from "@/features/search";
import { Pill, type Tone } from "@/components/dashboard/shared/primitives";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import styles from "./TopBar.module.css";

const GROUP_KEYS: MessageKey[] = ["shell.groupProblems", "shell.groupIdeas", "shell.groupTeams", "shell.groupInbox", "shell.groupPeople"];
const KIND_KEYS: Record<SearchItem["kind"], MessageKey> = { Problem: "shell.kindProblem", Idea: "shell.kindIdea", Team: "shell.kindTeam", Case: "shell.kindCase", Person: "shell.kindPerson" };
const KIND_TONE: Record<SearchItem["kind"], Tone> = { Problem: "soft", Idea: "accent", Team: "ok", Case: "purple", Person: "ink" };

export function TopBar() {
  const ctx = useDemo();
  const t = useT();
  const { seed, S, D, role, persona, actor, email, demo, q, setQ, pop, setPop, togglePop, setMenu, href, logout } = ctx;
  const router = useRouter();
  const [cursor, setCursor] = useState(0);
  const P = seed.promiseDays;
  const isManager = role === "manager", isLead = role === "leader";

  // ── search ──
  const trimmed = q.trim();
  const searchOpen = pop === "search" && trimmed.length >= 2;
  const index = useMemo(() => buildIndex(D, isLead ? openCases(ctx) : [], seed.depts, S.problems), [D, isLead, ctx, seed.depts, S.problems]);
  const results = searchOpen ? runSearch(index, trimmed) : [];
  const cur = Math.min(cursor, Math.max(results.length - 1, 0));
  const toks = tokens(q);
  const groups: { label: string; items: { r: SearchItem; idx: number }[] }[] = [];
  results.forEach((r, idx) => {
    const label = t(GROUP_KEYS[r.group]);
    let g = groups.find((x) => x.label === label);
    if (!g) { g = { label, items: [] }; groups.push(g); }
    g.items.push({ r, idx });
  });
  const pick = (r: SearchItem) => {
    document.getElementById("nh-search")?.blur();
    setPop(null); setQ(""); setCursor(0); setMenu(false);
    if (r.go) router.push(href("/" + r.go.view + "?id=" + r.go.id));
  };
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setPop("search"); setCursor(results.length ? (cur + 1) % results.length : 0); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setPop("search"); setCursor(results.length ? (cur - 1 + results.length) % results.length : 0); }
    else if (e.key === "Enter") { if (results[cur]) pick(results[cur]); }
    else if (e.key === "Escape") {
      e.preventDefault();
      if (q) { setQ(""); setCursor(0); } else { e.currentTarget.blur(); setPop(null); setMenu(false); }
    }
  };
  const focusSearch = () => {
    const el = document.getElementById("nh-search") as HTMLInputElement | null;
    if (el) { el.focus(); el.select(); }
    setPop("search"); setMenu(false);
  };

  // ── decisions dropdown: what needs this person's attention ──
  const drop = isManager
    ? decisionsWaiting(D).map((i) => ({ key: i.id, title: i.title, meta: t("shell.decisionMeta", { days: i.wait, upside: i.upside || "" }), hot: i.wait > P, to: "/ideas?id=" + i.id }))
    : isLead
      ? inboxSorted(ctx).filter((c) => c.clock >= P - 2).map((c) => ({ key: c.id, title: c.title, meta: t("shell.inboxMeta", { days: c.clock, from: c.from }), hot: c.clock > P, to: "/leader?id=" + c.id }))
      : mineRows(ctx).filter((m) => m.overdue).map((m) => ({ key: m.id, title: m.title, meta: m.clock, hot: true, to: "/team" }));
  const n = drop.length;
  const decisionLabel = !demo && !n ? t("shell.nothingWaiting")
    : isManager ? t("shell.decisionsWaiting", { count: n })
      : isLead ? t("shell.needAnswer", { count: n })
        : t("shell.answersOverdue", { count: n });
  const dropdownTitle = isManager ? t("shell.dropWaitingDecision") : isLead ? t("shell.dropAnswerOwed") : t("shell.dropAnswersOwed");
  const dropdownEmpty = isManager ? t("shell.dropEmptyManager") : isLead ? t("shell.dropEmptyLead") : t("shell.dropEmptyMember");
  const waiting = decisionsWaiting(D);
  const goDecisions = () => { setPop(null); router.push(href(isManager ? "/ideas?id=" + (waiting[0]?.id ?? "i1") : isLead ? "/leader" : "/team")); };
  const go = (to: string) => { setPop(null); router.push(href(to)); };
  const anon = actor !== persona.who.name; // the employee posts under a handle

  return (
    <header className={styles.topbar}>
      <button type="button" className={styles.burger} onClick={() => { setMenu(!ctx.menu); setPop(null); }} aria-label={t("shell.menu")}>
        <span /><span /><span />
      </button>
      <span className={styles.period}>{t("shell.period")}</span>

      <div className={styles.search} data-focus={pop === "search" ? "true" : undefined}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8c8c88" strokeWidth="2.4" strokeLinecap="round" className={styles.searchIcon}>
          <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" />
        </svg>
        <input id="nh-search" className={styles.searchInput} type="text" placeholder={t("shell.searchPlaceholder")} value={q}
          onChange={(e) => { setQ(e.target.value); setPop("search"); setCursor(0); }} onFocus={() => { setPop("search"); setMenu(false); }}
          onKeyDown={onSearchKey} autoComplete="off" spellCheck={false} aria-label={t("shell.search")} />
        {toks.length > 0 && <button type="button" className={styles.searchClear} onClick={() => { setQ(""); setCursor(0); focusSearch(); }} title={t("shell.clearEsc")}>×</button>}
        <span className={styles.kbd}>{searchOpen ? "esc" : "⌘K"}</span>

        {searchOpen && (
          <div className={`${styles.pop} ${styles.searchPop}`}>
            {results.length === 0 && (
              <div className={styles.noResults}>
                <div className={styles.noResultsTitle}>{t("shell.searchNothing", { query: q })}</div>
                <div className={styles.noResultsSub}>{t("shell.topSearchTry")}</div>
              </div>
            )}
            {groups.map((g) => (
              <div key={g.label}>
                <div className={styles.resultGroup}>{g.label}</div>
                {g.items.map(({ r, idx }) => (
                  <div key={r.kind + r.title} className={styles.result} data-active={idx === cur ? "true" : undefined} onClick={() => pick(r)} onMouseEnter={() => { if (cursor !== idx) setCursor(idx); }}>
                    <Pill tone={KIND_TONE[r.kind]} className={styles.kind}>{t(KIND_KEYS[r.kind])}</Pill>
                    <div className={styles.resultBody}>
                      <div className={styles.resultTitle}>{highlight(r.title, toks).map((x, k) => <span key={k} className={x.hit ? styles.hit : undefined}>{x.t}</span>)}</div>
                      <div className={styles.resultMeta}>{r.sub}</div>
                    </div>
                    <span className={styles.resultRight}>{r.right}</span>
                  </div>
                ))}
              </div>
            ))}
            <div className={styles.searchFoot}>
              <span>{t("shell.resultCount", { count: results.length })}</span>
              <span className={styles.searchKeys}><kbd>↑</kbd><kbd>↓</kbd> {t("shell.keyMove")} <kbd>↵</kbd> {t("shell.keyOpen")} <kbd>{"esc"}</kbd> {t("shell.keyClear")}</span>
            </div>
          </div>
        )}
      </div>

      <div className={styles.right}>
        <button type="button" className={styles.decisionBtn} data-open={pop === "decisions" ? "true" : undefined} onClick={() => togglePop("decisions")}>
          <span className={styles.dot} data-hot={n ? "true" : undefined} />
          <span className={styles.dLong}>{decisionLabel}</span>
          <span className={styles.dShort}>{!demo && !n ? "0" : n}</span>
        </button>
        <button type="button" className={styles.avatar} data-open={pop === "me" ? "true" : undefined} onClick={() => togglePop("me")} aria-label={t("shell.you")} title={persona.who.name + " · " + persona.who.line}>{persona.who.ini}</button>

        {pop === "decisions" && (
          <div className={`${styles.pop} ${styles.decisions}`}>
            <div className={styles.decisionsHead}>
              <span className={styles.decisionsTitle}>{dropdownTitle}</span>
              <button type="button" className={styles.openLink} onClick={goDecisions}>{t("shell.openArrow")}</button>
            </div>
            {n === 0 && <div className={styles.decisionsEmpty}>{dropdownEmpty}</div>}
            <div className={styles.decisionsList}>
              {drop.map((d) => (
                <div key={d.key} className={styles.decision} onClick={() => go(d.to)}>
                  <span className={styles.decisionDot} data-hot={d.hot ? "true" : undefined} />
                  <span className={styles.decisionText}>
                    <span className={styles.decisionTitle}>{d.title}</span>
                    <span className={styles.decisionMeta}>{d.meta}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {pop === "me" && (
          <div className={`${styles.pop} ${styles.me}`}>
            <div className={styles.meHead}>
              <span className={styles.meAvatar}>{persona.who.ini}</span>
              <span className={styles.meText}>
                <span className={styles.meName}>{persona.who.name}</span>
                <span className={styles.meLine}>{persona.who.line}</span>
                {email && <span className={styles.meEmail}>{email}</span>}
              </span>
            </div>
            <div className={styles.meRows}>
              <div className={styles.meRow}><span>{t("shell.role")}</span><strong>{persona.role.label}</strong></div>
              <div className={styles.meRow}><span>{t("shell.scope")}</span><strong>{persona.role.dept === "All" ? t("shell.allDepartments") : ctx.deptName(persona.role.dept)}</strong></div>
              <div className={styles.meRow}><span>{t("shell.company")}</span><strong>{ctx.tenant.name}</strong></div>
            </div>
            {/* Profile preview: the card others see next to what you post - the handle for an anonymous employee, the name otherwise. */}
            <div className={styles.mePreview}>
              <span className={styles.mePreviewLabel}>{t("shell.othersSeeYou")}</span>
              <div className={styles.mePreviewCard}>
                <span className={styles.mePreviewAvatar} data-anon={anon ? "true" : undefined}>{anon ? "#" : persona.who.ini}</span>
                <span className={styles.meText}>
                  <span className={styles.mePreviewName}>{actor}</span>
                  <span className={styles.meLine}>{anon ? t("shell.anonymousHidden") : persona.who.line}</span>
                </span>
              </div>
            </div>
            <div className={styles.meFoot}>
              <Link href={href("/profile")} className={styles.profileLink} onClick={() => setPop(null)}>{t("shell.viewMyProfile")}</Link>
              <button type="button" className={styles.logout} onClick={logout}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
                {t("shell.logOut")}
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
