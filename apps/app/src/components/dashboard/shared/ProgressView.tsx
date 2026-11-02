"use client";
// Does the system actually move: the funnel, whether shipped work delivered, what is stuck the
// longest, and whether people got an answer. Port of the PROGRESS block in legacy/demo/index.html.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Avatar, Pill, verdictTone, wordText } from "@/components/dashboard/shared/primitives";
import { ViewHead } from "@/components/dashboard/shared/ViewHead";
import { contributors, funnel, stalled } from "@/features/metrics";
import { useFormat, useT } from "@/i18n/client";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./ProgressView.module.css";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { ProjectMovement } from "@/components/projects/ProjectMovement";

export function ProgressView() {
  const ctx = useDemo();
  const { seed, D, N, demo, persona, ready, flag } = ctx;
  const t = useT();
  const fmt = useFormat();
  if (!ready) return <PageSkeleton kind="list" delay />;
  const M = seed.metrics, P = seed.promiseDays, O = seed.outcomeDays;
  const steps = funnel(N);
  const stuck = stalled(D);
  const top = contributors(D, persona.who.handle);
  const unanswered = N.overdueIdeas + D.cases.filter((c) => c.overdue).length;

  return (
    <>
      <ViewHead view="progress" />
      <div className={ui.stack14}>
        {/* Real projects, before and after (docs/plans/2026-10-15_idea-to-project.md §4). */}
        {flag("projects") && <ProjectMovement />}
        <div className={ui.card}>
          <div className={ui.head}>
            <div>
              <div className={ui.h}>{t("dashboard.progHowMove")}</div>
              <div className={ui.sub}>{t("dashboard.progTwelveMonths")}</div>
            </div>
            <span className={ui.small}>{N.signals ? t("dashboard.progInOut", { in: N.signals, out: N.shippedIdeas }) : t("dashboard.progNothingIn")}</span>
          </div>
          <div className={styles.funnel}>
            {steps.map((f) => (
              <div key={f.label}>
                <div className={styles.funnelHead}>
                  <span className={styles.funnelN}>{demo ? f.n : "—"}</span>
                  <span className={styles.funnelLabel}>{f.label}</span>
                  <span className={ui.rowMeta}>{demo ? f.sub : ""}</span>
                </div>
                <div className={styles.funnelTrack}>
                  <div className={styles.funnelFill} data-gate={f.gate ? "true" : undefined} style={{ width: (demo ? f.pct : 0) + "%" }} />
                </div>
                {f.note && demo && <div className={styles.funnelNote}>{f.note}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.split}>
          <div className={ui.card}>
            <div className={ui.h}>{t("dashboard.progDeliver")}</div>
            <div className={ui.sub}>{t("dashboard.progDeliverSub", { n: O })}</div>
            {D.outcomes.length === 0 && <div className={ui.emptyLine}>{t("dashboard.progDeliverEmpty", { n: O })}</div>}
            <div className={`${ui.list} ${ui.mt}`}>
              {D.outcomes.map((o) => (
                <div key={o.title} className={ui.listRow}>
                  <div className={ui.between}>
                    <span className={ui.listTitle}>{o.title}</span>
                    <Pill tone={verdictTone(o.verdict)}>{wordText(t, o.verdict)}</Pill>
                  </div>
                  <div className={`${ui.chips} ${styles.outcomeMeta}`}>
                    <span className={ui.rowMeta}>{t("dashboard.progPromised")} <span className={styles.promised}>{o.promised}</span></span>
                    <span className={ui.rowMeta}>{t("dashboard.progMeasured")} <span className={styles.measured}>{o.actual}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={ui.card}>
            <div className={ui.h}>{t("dashboard.progStuck")}</div>
            <div className={ui.sub}>{t("dashboard.progStuckSub")}</div>
            {stuck.length === 0 && <div className={ui.emptyLine}>{t("dashboard.progStuckNone")}</div>}
            <div className={`${ui.list} ${ui.mt}`}>
              {stuck.map((i) => (
                <div key={i.id} className={ui.listRow}>
                  <div className={ui.between}>
                    <span className={ui.listTitle}>{i.title}</span>
                    <Pill tone={i.wait ? "accent" : "ink"}>{i.wait ? t("common.days", { count: i.wait }) : t("dashboard.progNoOwner")}</Pill>
                  </div>
                  <div className={`${ui.rowMeta} ${styles.stuckAt}`}>{i.wait ? i.blocker || i.teamNote : i.teamNote}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={ui.card}>
            <div className={ui.h}>{t("dashboard.progAnswered")}</div>
            <div className={ui.sub}>{t("dashboard.progAnsweredSub")}</div>
            <div className={`${ui.grid2} ${ui.mt14}`}>
              <div className={ui.tile}><div className={styles.bigV}>{demo ? M.answered.replied : "—"}</div><div className={ui.tileL}>{t("dashboard.progReplied")}</div></div>
              <div className={ui.tile}><div className={styles.bigV}>{demo ? M.answered.median : "—"}</div><div className={ui.tileL}>{t("dashboard.progMedianReply")}</div></div>
              <div className={ui.tile}><div className={styles.bigV}>{demo ? fmt.number(M.answered.credited) : "0"}</div><div className={ui.tileL}>{t("dashboard.progCredited")}</div></div>
              <div className={ui.tile}><div className={styles.bigV} data-hot={demo ? "true" : undefined}>{unanswered}</div><div className={ui.tileL}>{t("dashboard.progUnanswered", { n: P })}</div></div>
            </div>

            <div className={`${ui.eyebrow} ${ui.mt20}`}>{t("dashboard.progReliedOn")}</div>
            {top.length === 0 && <div className={ui.emptyLine}>{t("dashboard.progNobody")}</div>}
            <div className={`${ui.list} ${ui.mt8}`}>
              {top.map((r) => (
                <div key={r.name} className={`${ui.personRow} ${styles.contrib}`}>
                  <Avatar name={r.name} />
                  <div className={ui.rowBody}>
                    <div className={styles.contribName}>{r.name}</div>
                    <div className={styles.contribMeta}>{r.dept || "—"} · {t("dashboard.progSignals", { count: r.signals })} · {t("dashboard.progIdeas", { count: r.ideas })}</div>
                  </div>
                  <span className={styles.credit}>{r.shipped ? t("dashboard.progShipped", { n: r.shipped }) : r.building ? t("dashboard.progBuilding", { n: r.building }) : r.awaiting ? t("dashboard.progAwaiting") : t("dashboard.progNoTeam")}</span>
                </div>
              ))}
            </div>
            <div className={`${ui.note} ${styles.anonNote}`}>{t("dashboard.progAnonNote")}</div>
          </div>
        </div>
      </div>
    </>
  );
}
