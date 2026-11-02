"use client";
// MANAGER home: one screen a head of department can act from. What needs your decision, who holds
// the open cases and whether the promise holds, why cases wait (the routing map or the workload),
// which named problems nobody owns, and whether shipped work paid what it promised.
// Every number is counted from the rows (features/metrics/overview); each item appears once.
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { scopedProblems } from "@/components/dashboard/derive";
import { wordText } from "@/components/dashboard/shared/primitives";
import { ViewHead } from "@/components/dashboard/shared/ViewHead";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { badgeTone } from "@/features/ideas/brief";
import { decisionsWaiting, overridesLabel } from "@/features/metrics";
import { decisionRows, deliveredCount, desks, euroK, stallSplit, unownedProblems, upsideTotal } from "@/features/metrics/overview";
import { useT } from "@/i18n/client";
import { avatarTone } from "@/lib/avatar";
import { ini } from "@/lib/utils/format";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./OverviewView.module.css";

const TREND_TONE: Record<string, string> = { Worsening: "warn", Flat: "grey", Improving: "ok" };
const VERDICT_TONE: Record<string, string> = { "Beat it": "ok", "As promised": "left", Short: "warn" };

export function OverviewView() {
  const ctx = useDemo();
  const { seed, S, D, log, demo, href, dept, deptName, ready } = ctx;
  const t = useT();
  if (!ready) return <PageSkeleton kind="overview" delay />;
  const P = seed.promiseDays, L = seed.ledger, M = seed.metrics;

  const decisions = decisionRows(decisionsWaiting(D), D.initiatives, P);
  const waitingUpside = upsideTotal(decisions.map((d) => d.idea));
  const held = desks(D.cases, seed.people);
  const heldMax = Math.max(1, ...held.map((d) => d.open + d.paused));
  const openN = held.reduce((a, d) => a + d.open, 0), pausedN = held.reduce((a, d) => a + d.paused, 0);
  const late = held.reduce((a, d) => a + d.late, 0);
  const moved = held.reduce((a, d) => a + d.movedIn, 0);
  const split = stallSplit(D.stall);
  const scoped = scopedProblems(ctx);
  const unowned = unownedProblems(scoped);
  const unownedPeople = unowned.reduce((a, p) => a + p.people, 0);
  const inScope = dept === "All" ? "" : " " + t("dashboard.ovTouching", { dept: deptName(dept) });
  const live = (type: string) => log.events.filter((e) => e.type === type).length;

  const stats = [
    { v: String(openN), l: t("dashboard.ovOpenCases", { count: openN }) + (pausedN ? " · " + t("dashboard.ovPausedOnQuestion", { n: pausedN }) : "") },
    { v: String(late), l: t("dashboard.ovLatePromise", { count: late, n: P }), hot: late > 0 },
    { v: demo ? L.firstAnswer : "—", l: demo ? t("dashboard.ovMedianFirstWas", { was: L.firstAnswerWas }) : t("dashboard.ovMedianFirst") },
    { v: demo ? L.withinPromise : "—", l: demo ? t("dashboard.ovAnsweredWithinWas", { n: P, was: L.withinPromiseWas }) : t("dashboard.ovAnsweredWithin", { n: P }) },
  ];

  return (
    <>
      <ViewHead view="overview" />
      <div className={styles.page}>
        <div className={`${ui.stats} ${styles.stats}`}>
          {stats.map((s) => (
            <div key={s.l} className={ui.stat}>
              <div className={ui.statV} data-hot={s.hot ? "true" : undefined}>{s.v}</div>
              <div className={ui.statL}>{s.l}</div>
            </div>
          ))}
        </div>

        <div className={styles.grid}>
          <section className={styles.card} aria-labelledby="ov-decisions">
            <header className={styles.cardHead}>
              <h2 id="ov-decisions" className={styles.cardTitle}>{t("dashboard.ovDecisionsTitle")}</h2>
              <Link href={href("/leader")} className={styles.more}>{t("dashboard.ovInbox")}</Link>
            </header>
            {decisions.length === 0 && <p className={styles.empty}>{t("dashboard.ovDecisionsEmpty")}</p>}
            <ul className={styles.list}>
              {decisions.map(({ idea, team, due }) => (
                <li key={idea.id}>
                  <Link href={href("/leader?id=" + idea.id)} className={styles.row}>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{idea.title}</span>
                      <span className={styles.rowText}>{idea.blocker || idea.teamNote}</span>
                      <span className={styles.rowMeta}>
                        {[
                          idea.upside.startsWith("€") ? t("dashboard.ovUpside", { upside: idea.upside }) : null,
                          idea.expected,
                          team ? (team.people ? t("dashboard.ovTeamReady", { n: team.people }) : t("dashboard.ovNoTeam")) : null,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className={styles.rowSide}>
                      <span className={styles.since}>{t("common.days", { count: idea.wait })}</span>
                      <span className={styles.badge} data-tone={badgeTone(due)}>{due < 0 ? t("dashboard.ovDLate", { n: -due }) : due === 0 ? t("dashboard.ovDueToday") : t("dashboard.ovDLeft", { n: due })}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {(waitingUpside > 0 || demo) && (
              <p className={`${styles.foot} ${styles.footSplit}`}>
                {waitingUpside > 0 && <span><strong>{euroK(waitingUpside)}</strong> {t("dashboard.ovUpsideWaits", { count: decisions.length })}</span>}
                {demo && <span>{t("dashboard.ovIdeaToDecision")} <strong>{M.ideaToDecision.now}</strong> {t("dashboard.ovMedianWas", { was: M.ideaToDecision.was })}</span>}
              </p>
            )}
          </section>

          <section className={styles.card} aria-labelledby="ov-desks">
            <header className={styles.cardHead}>
              <h2 id="ov-desks" className={styles.cardTitle}>{t("dashboard.ovDesksTitle")}</h2>
              <Link href={href("/overview")} className={styles.more}>{t("dashboard.ovOverview")}</Link>
            </header>
            {held.length === 0 && <p className={styles.empty}>{t("dashboard.ovDesksEmpty")}</p>}
            <ul className={styles.list}>
              {held.map((d) => (
                <li key={d.name} className={styles.desk}>
                  <span className={styles.avatar} data-avatar={avatarTone(d.name)}>{ini(d.name)}</span>
                  <span className={styles.deskMain}>
                    <span className={styles.deskTop}>
                      <span className={styles.deskName}>{d.name}</span>
                      <span className={styles.deskCount}>{t("dashboard.ovOpenN", { n: d.open })}{d.paused ? " · " + t("dashboard.ovPausedN", { n: d.paused }) : ""}</span>
                    </span>
                    <span className={styles.deskRole}>{d.role}{d.late ? <span className={styles.deskLate}> · {t("dashboard.ovPastPromise", { n: d.late })}</span> : null}</span>
                    <span className={styles.load} style={{ width: Math.round(((d.open + d.paused) / heldMax) * 100) + "%" }} aria-hidden>
                      {d.late > 0 && <span data-tone="late" style={{ flexGrow: d.late }} />}
                      {d.open - d.late > 0 && <span data-tone="open" style={{ flexGrow: d.open - d.late }} />}
                      {d.paused > 0 && <span data-tone="paused" style={{ flexGrow: d.paused }} />}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {held.length > 0 && (
              <p className={styles.foot}>
                {moved > 0
                  ? <><strong>{t("dashboard.ovCases", { count: moved })}</strong> {t("dashboard.ovMovedDeputy", { n: P })}</>
                  : <>{t("dashboard.ovInsidePromise", { n: P })}</>}
              </p>
            )}
          </section>
        </div>

        <div className={styles.grid}>
          <section className={styles.card} aria-labelledby="ov-stall">
            <header className={styles.cardHead}>
              <h2 id="ov-stall" className={styles.cardTitle}>{t("dashboard.ovStallTitle")}</h2>
            </header>
            {!split && (
              <p className={styles.empty}>{t("dashboard.ovStallEmpty")}</p>
            )}
            {split && (
              <div className={styles.pad}>
                <p className={styles.verdict}>
                  <span className={styles.big}>{Math.round((split.routing / split.total) * 100)}%</span>
                  {split.routing * 2 >= split.total
                    ? <span>{t("dashboard.ovRoutingLead")} <strong>{t("dashboard.ovDaysOf", { a: split.routing, b: split.total })}</strong> {t("dashboard.ovRoutingTail")}</span>
                    : <span>{t("dashboard.ovRoutingLead2")} <strong>{t("dashboard.ovDaysOf", { a: split.total - split.routing, b: split.total })}</strong> {t("dashboard.ovWorkloadTail")}</span>}
                </p>
                <div className={styles.stack} aria-hidden>
                  {split.parts.map((p, i) => <span key={p.reason} data-tone={(p.routing ? "route" : "load") + (i % 2)} style={{ flexGrow: p.days }} />)}
                </div>
                <ul className={styles.reasons}>
                  {split.parts.map((p, i) => (
                    <li key={p.reason} className={styles.reason}>
                      <span className={styles.dot} data-tone={(p.routing ? "route" : "load") + (i % 2)} />
                      <span className={styles.reasonMain}>
                        <span className={styles.reasonName}>{p.reason}</span>
                        <span className={styles.reasonNote}>{p.note}</span>
                      </span>
                      <span className={styles.reasonDays}>{p.days} d</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {demo && (
              <dl className={styles.minis}>
                <div><dt>{t("dashboard.ovMiniOverruled")}</dt><dd>{overridesLabel(L.overrides, live("case.override"))}</dd></div>
                <div><dt>{t("dashboard.ovMiniSideways")}</dt><dd>{L.handedOver + live("case.handed")}</dd></div>
                <div><dt>{t("dashboard.ovMiniDeputy")}</dt><dd>{L.escalated + S.ledger.escalated}</dd></div>
              </dl>
            )}
          </section>

          <section className={styles.card} aria-labelledby="ov-unowned">
            <header className={styles.cardHead}>
              <h2 id="ov-unowned" className={styles.cardTitle}>{t("dashboard.ovUnownedTitle")}</h2>
              <Link href={href("/problems")} className={styles.more}>{t("dashboard.ovAllProblems")}</Link>
            </header>
            {scoped.length === 0 && <p className={styles.empty}>{t("dashboard.ovUnownedNone")}</p>}
            {scoped.length > 0 && unowned.length === 0 && <p className={styles.empty}>{t("dashboard.ovUnownedAllHave")}</p>}
            {unowned.length > 0 && (
              <p className={styles.lead}><strong>{t("dashboard.ovPeopleN", { n: unownedPeople })}</strong> {t("dashboard.ovNamed", { count: unowned.length })}{inScope}. {t("dashboard.ovLeadTail")}</p>
            )}
            <ul className={styles.list}>
              {unowned.map((p) => (
                <li key={p.id}>
                  <Link href={href("/problems?id=" + p.id)} className={styles.row}>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{p.title}</span>
                      <span className={styles.rowText}>{p.sub}</span>
                      <span className={styles.rowMeta}>
                        {t("dashboard.ovPeopleN", { n: p.people })} · {p.depts.length > 3 ? t("dashboard.ovDepartments", { count: p.depts.length }) : p.depts.map(deptName).join(", ")} · {t("dashboard.ovFirstNamed", { age: p.age })}
                      </span>
                    </span>
                    <span className={styles.rowSide}>
                      <span className={styles.badge} data-tone={TREND_TONE[p.trend] ?? "grey"}>{wordText(t, p.trend)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {unowned.length > 0 && scoped.length > unowned.length && (
              <p className={styles.foot}>{t("dashboard.ovOtherHave", { count: scoped.length - unowned.length, scope: inScope })}</p>
            )}
          </section>
        </div>

        <section className={styles.card} aria-labelledby="ov-paid">
          <header className={styles.cardHead}>
            <h2 id="ov-paid" className={styles.cardTitle}>{t("dashboard.ovPaidTitle")}</h2>
            <Link href={href("/progress")} className={styles.more}>{t("dashboard.ovProgress")}</Link>
          </header>
          {D.outcomes.length === 0 && <p className={styles.empty}>{t("dashboard.ovPaidEmpty", { n: seed.outcomeDays })}</p>}
          {D.outcomes.length > 0 && (
            <>
              <p className={styles.verdict}>
                <span className={styles.big}>{M.valueBooked.now}</span>
                <span>{t("dashboard.ovBookedSoFar")} <strong>{M.valueBooked.delta}</strong> {t("dashboard.ovSinceBaseline", { sub: M.valueBooked.sub, a: deliveredCount(D.outcomes), b: D.outcomes.length })}</span>
              </p>
              <div className={styles.table} role="table" aria-label={t("dashboard.ovTableLabel")}>
                <div className={styles.tr} role="row" data-head="true">
                  <span role="columnheader">{t("dashboard.ovShipped")}</span><span role="columnheader">{t("dashboard.ovPromised")}</span><span role="columnheader">{t("dashboard.ovDelivered")}</span><span role="columnheader" className={styles.tdEnd}>{t("dashboard.ovResult")}</span>
                </div>
                {D.outcomes.map((o) => (
                  <div key={o.title} className={styles.tr} role="row">
                    <span role="cell" className={styles.tdTitle}>{o.title}</span>
                    <span role="cell" className={styles.tdNum}><span className={styles.tdLabel}>{t("dashboard.ovPromised")} </span>{o.promised}</span>
                    <span role="cell" className={styles.tdNum}><span className={styles.tdLabel}>{t("dashboard.ovDelivered")} </span>{o.actual}</span>
                    <span role="cell" className={styles.tdEnd}><span className={styles.badge} data-tone={VERDICT_TONE[o.verdict] ?? "grey"}>{wordText(t, o.verdict)}</span></span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
