"use client";
// MANAGER home: one screen a head of department can act from. What needs your decision, who holds
// the open cases and whether the promise holds, why cases wait (the routing map or the workload),
// which named problems nobody owns, and whether shipped work paid what it promised.
// Every number is counted from the rows (features/metrics/overview); each item appears once.
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { scopedProblems } from "@/components/dashboard/derive";
import { ViewHead } from "@/components/dashboard/shared/ViewHead";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { badgeTone } from "@/features/ideas/brief";
import { decisionsWaiting, overridesLabel } from "@/features/metrics";
import { decisionRows, deliveredCount, desks, euroK, stallSplit, unownedProblems, upsideTotal } from "@/features/metrics/overview";
import { avatarTone } from "@/lib/avatar";
import { ini } from "@/lib/utils/format";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./OverviewView.module.css";

const TREND_TONE: Record<string, string> = { Worsening: "warn", Flat: "grey", Improving: "ok" };
const VERDICT_TONE: Record<string, string> = { "Beat it": "ok", "As promised": "left", Short: "warn" };
const plural = (n: number, one: string, many = one + "s") => n + " " + (n === 1 ? one : many);

export function OverviewView() {
  const ctx = useDemo();
  const { seed, S, D, log, demo, href, dept, deptName, ready } = ctx;
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
  const inScope = dept === "All" ? "" : " touching " + deptName(dept);
  const live = (type: string) => log.events.filter((e) => e.type === type).length;

  const stats = [
    { v: String(openN), l: (openN === 1 ? "open case" : "open cases") + (pausedN ? " · " + pausedN + " paused on a question" : "") },
    { v: String(late), l: (late === 1 ? "case" : "cases") + " past the " + P + "-day promise", hot: late > 0 },
    { v: demo ? L.firstAnswer : "—", l: demo ? "median to a first answer · " + L.firstAnswerWas : "median to a first answer" },
    { v: demo ? L.withinPromise : "—", l: demo ? "answered within " + P + " days · " + L.withinPromiseWas : "answered within " + P + " days" },
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
              <h2 id="ov-decisions" className={styles.cardTitle}>Decisions waiting on you</h2>
              <Link href={href("/leader")} className={styles.more}>Inbox</Link>
            </header>
            {decisions.length === 0 && <p className={styles.empty}>Nothing is waiting on you. An idea that needs your decision lands here, oldest first.</p>}
            <ul className={styles.list}>
              {decisions.map(({ idea, team, due }) => (
                <li key={idea.id}>
                  <Link href={href("/leader?id=" + idea.id)} className={styles.row}>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{idea.title}</span>
                      <span className={styles.rowText}>{idea.blocker || idea.teamNote}</span>
                      <span className={styles.rowMeta}>
                        {[
                          idea.upside.startsWith("€") ? idea.upside + " upside" : null,
                          idea.expected,
                          team ? (team.people ? "team of " + team.people + " ready to start" : "no team yet") : null,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className={styles.rowSide}>
                      <span className={styles.since}>{plural(idea.wait, "day")}</span>
                      <span className={styles.badge} data-tone={badgeTone(due)}>{due < 0 ? -due + " d late" : due === 0 ? "due today" : due + " d left"}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {(waitingUpside > 0 || demo) && (
              <p className={`${styles.foot} ${styles.footSplit}`}>
                {waitingUpside > 0 && <span><strong>{euroK(waitingUpside)}</strong> of expected upside waits on {decisions.length === 1 ? "this decision" : "these " + decisions.length + " decisions"}.</span>}
                {demo && <span>Idea to decision: <strong>{M.ideaToDecision.now}</strong> median, {M.ideaToDecision.was}</span>}
              </p>
            )}
          </section>

          <section className={styles.card} aria-labelledby="ov-desks">
            <header className={styles.cardHead}>
              <h2 id="ov-desks" className={styles.cardTitle}>Who holds the open cases</h2>
              <Link href={href("/dashboard")} className={styles.more}>Dashboard</Link>
            </header>
            {held.length === 0 && <p className={styles.empty}>No open cases. A raised case shows up here on its owner&rsquo;s desk.</p>}
            <ul className={styles.list}>
              {held.map((d) => (
                <li key={d.name} className={styles.desk}>
                  <span className={styles.avatar} data-avatar={avatarTone(d.name)}>{ini(d.name)}</span>
                  <span className={styles.deskMain}>
                    <span className={styles.deskTop}>
                      <span className={styles.deskName}>{d.name}</span>
                      <span className={styles.deskCount}>{d.open} open{d.paused ? " · " + d.paused + " paused" : ""}</span>
                    </span>
                    <span className={styles.deskRole}>{d.role}{d.late ? <span className={styles.deskLate}> · {d.late} past the promise</span> : null}</span>
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
                  ? <><strong>{plural(moved, "case")}</strong> moved to a deputy after {P} days without an answer.</>
                  : <>Every open case is inside the {P}-day promise.</>}
              </p>
            )}
          </section>
        </div>

        <div className={styles.grid}>
          <section className={styles.card} aria-labelledby="ov-stall">
            <header className={styles.cardHead}>
              <h2 id="ov-stall" className={styles.cardTitle}>Why cases wait</h2>
            </header>
            {!split && (
              <p className={styles.empty}>Once cases move, each day of waiting gets a reason: wrong department, nobody responsible, no time, or could not rank it. The split shows whether the routing map or the workload is the problem.</p>
            )}
            {split && (
              <div className={styles.pad}>
                <p className={styles.verdict}>
                  <span className={styles.big}>{Math.round((split.routing / split.total) * 100)}%</span>
                  {split.routing * 2 >= split.total
                    ? <span>of the waiting is routing: <strong>{split.routing} of {split.total} days</strong> went to the wrong desk or to nobody. Fixing the routing table saves more than adding hours.</span>
                    : <span>of the waiting is routing. The other <strong>{split.total - split.routing} of {split.total} days</strong> are the receivers&rsquo; time and priorities: the workload is the bottleneck, not the map.</span>}
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
                <div><dt>proposed owner overruled</dt><dd>{overridesLabel(L.overrides, live("case.override"))}</dd></div>
                <div><dt>handed sideways</dt><dd>{L.handedOver + live("case.handed")}</dd></div>
                <div><dt>moved to a deputy this quarter</dt><dd>{L.escalated + S.ledger.escalated}</dd></div>
              </dl>
            )}
          </section>

          <section className={styles.card} aria-labelledby="ov-unowned">
            <header className={styles.cardHead}>
              <h2 id="ov-unowned" className={styles.cardTitle}>Problems nobody owns</h2>
              <Link href={href("/problems")} className={styles.more}>All problems</Link>
            </header>
            {scoped.length === 0 && <p className={styles.empty}>Nothing raised yet. The first forwarded thread or typed problem shows up on the problems page.</p>}
            {scoped.length > 0 && unowned.length === 0 && <p className={styles.empty}>Every named problem has an idea, a trial or an owner on it.</p>}
            {unowned.length > 0 && (
              <p className={styles.lead}><strong>{unownedPeople} people</strong> named {unowned.length === 1 ? "this problem" : "these " + unowned.length + " problems"}{inScope}. No idea, no trial and nobody assigned: yours to hand out.</p>
            )}
            <ul className={styles.list}>
              {unowned.map((p) => (
                <li key={p.id}>
                  <Link href={href("/problems?id=" + p.id)} className={styles.row}>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{p.title}</span>
                      <span className={styles.rowText}>{p.sub}</span>
                      <span className={styles.rowMeta}>
                        {p.people} people · {p.depts.length > 3 ? plural(p.depts.length, "department") : p.depts.map(deptName).join(", ")} · first named {p.age}
                      </span>
                    </span>
                    <span className={styles.rowSide}>
                      <span className={styles.badge} data-tone={TREND_TONE[p.trend] ?? "grey"}>{p.trend}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {unowned.length > 0 && scoped.length > unowned.length && (
              <p className={styles.foot}>{plural(scoped.length - unowned.length, "other problem")}{inScope} {scoped.length - unowned.length === 1 ? "has" : "have"} an idea or a trial on {scoped.length - unowned.length === 1 ? "it" : "them"}.</p>
            )}
          </section>
        </div>

        <section className={styles.card} aria-labelledby="ov-paid">
          <header className={styles.cardHead}>
            <h2 id="ov-paid" className={styles.cardTitle}>Did shipped work pay off</h2>
            <Link href={href("/progress")} className={styles.more}>Progress</Link>
          </header>
          {D.outcomes.length === 0 && <p className={styles.empty}>Nothing shipped yet. Each shipped idea is measured {seed.outcomeDays} days after launch against what it promised.</p>}
          {D.outcomes.length > 0 && (
            <>
              <p className={styles.verdict}>
                <span className={styles.big}>{M.valueBooked.now}</span>
                <span>booked so far: <strong>{M.valueBooked.delta}</strong> since the baseline, {M.valueBooked.sub}. {deliveredCount(D.outcomes)} of {D.outcomes.length} shipped ideas met or beat their promise.</span>
              </p>
              <div className={styles.table} role="table" aria-label="Shipped ideas, promised against delivered">
                <div className={styles.tr} role="row" data-head="true">
                  <span role="columnheader">Shipped</span><span role="columnheader">Promised</span><span role="columnheader">Delivered</span><span role="columnheader" className={styles.tdEnd}>Result</span>
                </div>
                {D.outcomes.map((o) => (
                  <div key={o.title} className={styles.tr} role="row">
                    <span role="cell" className={styles.tdTitle}>{o.title}</span>
                    <span role="cell" className={styles.tdNum}><span className={styles.tdLabel}>Promised </span>{o.promised}</span>
                    <span role="cell" className={styles.tdNum}><span className={styles.tdLabel}>Delivered </span>{o.actual}</span>
                    <span role="cell" className={styles.tdEnd}><span className={styles.badge} data-tone={VERDICT_TONE[o.verdict] ?? "grey"}>{o.verdict}</span></span>
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
