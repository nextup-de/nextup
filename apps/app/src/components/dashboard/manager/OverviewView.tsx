"use client";
// MANAGER home: what is blocked on you, how the system is performing, where the waiting goes.
// Port of the OVERVIEW block in legacy/demo/index.html.
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { criteriaTags, scopedIdeas, scopedProblems, sortIdeas, sortProblems } from "@/components/dashboard/derive";
import { Bars, Pill, ownerTone, statusTone, trendTone } from "@/components/dashboard/shared/primitives";
import { ViewHead } from "@/components/dashboard/shared/ViewHead";
import { decisionsWaiting, overridesLabel } from "@/features/metrics";
import { ownerLabel } from "@/features/search";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./OverviewView.module.css";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";

export function OverviewView() {
  const ctx = useDemo();
  const { seed, S, D, N, log, demo, href, deptName, ready } = ctx;
  if (!ready) return <PageSkeleton kind="overview" delay />;
  const P = seed.promiseDays, M = seed.metrics, L = seed.ledger;
  const dash = (v: string) => (demo ? v : "—");
  const was = (str: string) => parseInt(String(str).replace(/[^\d]/g, ""), 10);

  const decisions = decisionsWaiting(D);
  const kpis = [
    { label: "Idea → decision", value: M.ideaToDecision.now, delta: M.ideaToDecision.was, up: true, sub: "median, last 30 days", spark: M.ideaToDecision.spark },
    { label: "Shipped this year", value: String(N.shippedTeams), delta: M.shippedWas, up: N.shippedTeams >= was(M.shippedWas), sub: M.stoppedEarly + " stopped early", spark: M.shippedSpark },
    { label: "Value booked", value: M.valueBooked.now, delta: M.valueBooked.delta, up: true, sub: M.valueBooked.sub, spark: M.valueBooked.spark },
    { label: "Waiting days saved", value: M.waitingDaysSaved.now, delta: "vs old route", up: true, sub: "across " + N.ideas + " ideas", spark: M.waitingDaysSaved.spark },
  ];
  const stallMax = Math.max(1, ...D.stall.map((x) => x.days));
  const live = (type: string) => log.events.filter((e) => e.type === type).length;
  const ledger = {
    firstAnswer: dash(L.firstAnswer), firstAnswerWas: demo ? L.firstAnswerWas : "measured in pilot",
    withinPromise: dash(L.withinPromise), withinPromiseWas: demo ? L.withinPromiseWas : "measured in pilot",
    overrides: dash(overridesLabel(L.overrides, live("case.override"))),
    escalated: dash(String(L.escalated + S.ledger.escalated)), handedOver: dash(String(L.handedOver + live("case.handed"))),
  };
  const topProblems = sortProblems(scopedProblems(ctx), "people").slice(0, 5);
  const topIdeas = sortIdeas(scopedIdeas(ctx), "score").slice(0, 5);
  const initiatives = D.initiatives.filter((t) => ctx.matches(t.depts));

  return (
    <>
      <ViewHead view="overview" />
      <div className={`${ui.stack14} ${styles.page}`}>
        <div className={`${ui.cardDark} ${styles.panel}`}>
          <div className={ui.head}>
            <span className={ui.h}>Waiting on you</span>
            <Link href={href("/ideas")} className={ui.textlink}>All ideas →</Link>
          </div>
          {decisions.length === 0 && (
            <div className={styles.decisionEmpty}>
              <div className={styles.decisionEmptyTitle}>Nothing is waiting on you</div>
            </div>
          )}
          <div className={styles.decisions}>
            {decisions.map((i) => (
              <Link key={i.id} href={href("/leader?id=" + i.id)} className={styles.decision}>
                <div className={ui.between}>
                  <span className={styles.decisionTitle}>{i.title}</span>
                  <span className={styles.days} data-hot={i.wait > 20 ? "true" : undefined}>{i.wait} days</span>
                </div>
                <span className={styles.due} data-hot={i.wait > 14 ? "true" : undefined}>
                  {i.wait > P ? i.wait - P + " d past the promise · escalated" : "answer owed in " + (P - i.wait) + " d"}
                </span>
                <span className={styles.blocker}>{i.blocker || i.teamNote}</span>
                <span className={styles.upside}>{i.upside} expected upside</span>
              </Link>
            ))}
          </div>
        </div>

        <div className={styles.kpis}>
          {kpis.map((k) => (
            <div key={k.label} className={styles.kpi}>
              <div className={ui.eyebrow}>{k.label}</div>
              <div className={styles.kpiRow}>
                <span className={styles.kpiV}>{dash(k.value)}</span>
                {demo && <span className={styles.delta} data-up={k.up ? "true" : undefined}>{k.delta}</span>}
              </div>
              <div className={styles.kpiSub}>{demo ? k.sub : "measured in pilot"}</div>
              <div className={ui.mt}><Bars spark={k.spark} flat={!demo} /></div>
            </div>
          ))}
        </div>

        <div className={ui.split}>
          <div className={ui.card}>
            <div className={ui.head}>
              <span className={ui.h}>Where the waiting goes</span>
            </div>
            {D.stall.length === 0 && (
              <div className={`${ui.body} ${ui.mt14}`} style={{ color: "var(--nh-mute)" }}>
                Once cases move, each day of waiting is labelled: wrong department, not responsible, no time, or could not rank it. The split tells you whether the map or the capacity is the problem.
              </div>
            )}
            <div className={styles.stall}>
              {D.stall.map((x, i) => (
                <div key={x.reason}>
                  <div className={ui.head}>
                    <span className={styles.stallReason}>{x.reason}</span>
                    <span className={styles.stallDays}>{x.days} d</span>
                  </div>
                  <div className={ui.progress}>
                    <div className={ui.progressFill} data-tone={i < 2 ? "accent" : undefined} style={{ width: Math.round((x.days / stallMax) * 100) + "%" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${ui.cardDark} ${styles.panel}`}>
            <div className={ui.h}>The wait ledger</div>
            <div className={`${ui.grid2} ${ui.mt14}`}>
              <div className={styles.ledgerTile}>
                <div className={styles.ledgerV}>{ledger.firstAnswer}</div>
                <div className={styles.ledgerL}>median to the first answer · <span className={styles.ledgerWas}>{ledger.firstAnswerWas}</span></div>
              </div>
              <div className={styles.ledgerTile}>
                <div className={styles.ledgerV}>{ledger.withinPromise}</div>
                <div className={styles.ledgerL}>answered within the {P}-day promise · <span className={styles.ledgerWas}>{ledger.withinPromiseWas}</span></div>
              </div>
            </div>
            <div className={styles.ledgerRows}>
              <div className={styles.ledgerRow}><span>Escalated this quarter</span><strong>{ledger.escalated}</strong></div>
              <div className={styles.ledgerRow}><span>Handed sideways</span><strong>{ledger.handedOver}</strong></div>
              <div className={styles.ledgerRow}><span>Proposed owner overruled</span><strong>{ledger.overrides}</strong></div>
            </div>
          </div>
        </div>

        <div className={ui.split}>
          <div className={ui.card}>
            <div className={ui.head}>
              <span className={ui.h}>What people say is broken</span>
              <Link href={href("/problems")} className={ui.textlink}>{N.problems ? "All " + N.problems + " →" : "All →"}</Link>
            </div>
            {topProblems.length === 0 && <div className={ui.emptyLine}>Nothing raised yet. The first forwarded thread or typed problem shows up here.</div>}
            <div className={`${ui.list} ${ui.mt}`}>
              {topProblems.map((p) => (
                <Link key={p.id} href={href("/problems?id=" + p.id)} className={ui.listRow} data-click="true">
                  <div className={ui.between}>
                    <span className={ui.listTitle}>{p.title}</span>
                    <span className={styles.peopleN}>{p.people} ppl</span>
                  </div>
                  <div className={`${ui.chips} ${ui.mt8}`}>
                    <Pill tone={trendTone(p.trend)}>{p.trend}</Pill>
                    <Pill tone={ownerTone(p.owner)}>{ownerLabel(p.owner)}</Pill>
                    <span className={ui.rowMeta}>{p.depts.length > 3 ? p.depts.slice(0, 3).map(deptName).join(" · ") + " +" + (p.depts.length - 3) : p.depts.map(deptName).join(" · ")}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className={ui.card}>
            <div className={ui.head}>
              <span className={ui.h}>Ideas people have</span>
              <Link href={href("/ideas")} className={ui.textlink}>{N.ideas ? "All " + N.ideas + " →" : "All →"}</Link>
            </div>
            {topIdeas.length === 0 && <div className={ui.emptyLine}>No ideas yet. They appear as step three of a case, tied to the problem they answer.</div>}
            <div className={`${ui.list} ${ui.mt}`}>
              {topIdeas.map((i) => (
                <Link key={i.id} href={href("/ideas?id=" + i.id)} className={ui.listRow} data-click="true">
                  <span className={ui.listTitle}>{i.title}</span>
                  <div className={`${ui.chips} ${styles.criteria}`}>
                    {criteriaTags(i.criteria).map((t) => <Pill key={t.label} tone={t.none ? "none" : t.strong ? "ink" : "soft"}>{t.label}</Pill>)}
                  </div>
                  <div className={`${ui.chips} ${ui.mt8}`}>
                    <Pill tone={statusTone(i.status)}>{i.status}</Pill>
                    <span className={ui.rowMeta}>{i.expected}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className={ui.card}>
            <div className={ui.head}>
              <span className={ui.h}>Who is working with who</span>
              <Link href={href("/collaboration")} className={ui.textlink}>Map →</Link>
            </div>
            {initiatives.length === 0 && <div className={ui.emptyLine}>No cross-team work in motion yet.</div>}
            <div className={`${ui.list} ${ui.mt}`}>
              {initiatives.map((t) => (
                <Link key={t.id} href={href("/collaboration?id=" + t.id)} className={ui.listRow} data-click="true">
                  <div className={ui.between}>
                    <span className={ui.listTitle}>{t.name}</span>
                    <Pill tone={statusTone(t.status)}>{t.status}</Pill>
                  </div>
                  <div className={`${ui.chips} ${ui.mt8}`}>
                    <span className={styles.deptsMono}>{t.depts.map(deptName).join(" × ")}</span>
                    <span className={ui.rowMeta}>{t.people ? t.people + " people" : "nobody assigned"}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
