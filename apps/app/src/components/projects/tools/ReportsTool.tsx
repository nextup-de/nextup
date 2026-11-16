"use client";
// Reports (Paper "Jira pages · new header", frame "NextUp · Work · Reports (Jira Reports)"): "Where the time goes" - steps
// done per week, how long a step sits in each column, and where the waiting goes. The other report tabs need data NextUp does
// not keep yet (sprints, deployments), so they show but stay off.
import { useState } from "react";
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { overviewFacts, type OverviewRange, type WaitingKey } from "@/features/projects/overview-view";
import { timePerColumn } from "@/features/projects/flow-view";
import { fmtNumber } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { RangeMenu } from "../hub/overview/RangeMenu";
import type { ToolProps } from "./types";
import styles from "./Reports.module.css";

const TABS = ["reportsTabTime", "reportsTabFlow", "reportsTabCycle", "reportsTabDeploy", "reportsTabBurnup"] as const;

export function ReportsTool({ p }: ToolProps) {
  const { S, f, actorUserId, href } = useDemo();
  const t = useT();
  const locale = useLocale();
  // Paper shows six weeks; 30 days is the nearest range the Overview offers.
  const [range, setRange] = useState<OverviewRange>("30d");
  const viewerOnTeam = actorUserId !== null && (p.leadUserId === actorUserId || p.memberUserIds.includes(actorUserId));
  const facts = overviewFacts(p, { range, day: S.day, viewerOnTeam });
  const weeks = facts.perWeek;
  const maxWeek = Math.max(1, ...weeks.map((w) => w.done));
  const weekTotal = weeks.reduce((n, w) => n + w.done, 0);
  const times = timePerColumn(p).filter((row) => row.medianDays !== null && row.medianDays > 0);
  const maxDays = Math.max(1, ...times.map((row) => row.medianDays ?? 0));
  const columnLabels = { todo: t("projectHub.overviewToDo"), doing: t("projectHub.overviewDoing"), blocked: t("projectHub.overviewBlocked") };
  const nameOf = (k: WaitingKey) => k.kind === "person" ? S.seats.find((s) => s.userId === k.userId)?.label ?? t("projectHub.overviewNoOwner") : k.name ?? t("projectHub.overviewNoOwner");
  const maxWait = Math.max(1, ...facts.waiting.map((w) => w.days));
  const waited = facts.waiting.reduce((n, w) => n + w.days, 0);

  return <div className={styles.reports}>
    <div className={styles.bar}>
      <div className={styles.tabs} role="tablist" aria-label={t("projectPages.toolReports")}>
        {TABS.map((tab, i) => <button key={tab} type="button" role="tab" className={styles.tab} aria-selected={i === 0} aria-disabled={i > 0 || undefined} disabled={i > 0} title={i > 0 ? t("projectPages.reportsSoon") : undefined}>{t(`projectPages.${tab}`)}</button>)}
      </div>
      <span className={styles.spacer} />
      <RangeMenu value={range} onChange={setRange} />
    </div>
    <div className={styles.grid}>
      <div className={styles.main}>
        <section className={styles.card} aria-label={t("projectHub.overviewStepsDonePerWeek")}>
          <div className={styles.cardHead}><h2>{t("projectHub.overviewStepsDonePerWeek")}</h2><span className={styles.meta}>{weekTotal > 0 ? t("projectHub.overviewWeeklyTotal", { count: weekTotal, weeks: weeks.length }) : t("projectHub.overviewWeeklyEmpty")}</span></div>
          <ol className={styles.weeks}>
            {weeks.map((w, i) => <li key={w.endDay} aria-label={`${t("projectHub.overviewWeekLabel")} ${f(w.endDay)}: ${w.done}`} data-now={i === weeks.length - 1 || undefined}>
              <span className={styles.weekTrack} aria-hidden="true"><span style={w.done > 0 ? { height: `${(w.done / maxWeek) * 100}%` } : undefined} data-empty={w.done === 0 || undefined} /></span>
              <span className={styles.weekLabel}>{i === weeks.length - 1 ? t("projectHub.overviewThisWeek") : f(w.endDay)}</span>
            </li>)}
          </ol>
        </section>
        <section className={styles.card} aria-label={t("projectHub.resultsColumnTime")}>
          <div className={styles.cardHead}><h2>{t("projectHub.resultsColumnTime")}</h2><span className={styles.meta}>{t("projectHub.resultsMedianDays")}</span></div>
          {times.length === 0 ? <p className={styles.meta}>{t("projectHub.overviewEmpty")}</p> : <div className={styles.rows}>
            {times.map((row) => <div key={row.column} className={styles.row} data-column={row.column}>
              <span>{columnLabels[row.column]}</span>
              <span className={styles.track} aria-hidden="true"><span style={{ width: `${((row.medianDays ?? 0) / maxDays) * 100}%` }} /></span>
              <strong>{fmtNumber(row.medianDays ?? 0, locale)}</strong>
            </div>)}
          </div>}
        </section>
      </div>
      <section className={`${styles.card} ${styles.side}`} aria-label={t("projectHub.overviewWhereWaitingGoes")}>
        <h2>{t("projectHub.overviewWhereWaitingGoes")}</h2>
        <p className={styles.meta}>{t("projectHub.overviewWaitingHint")}</p>
        {!viewerOnTeam ? <p className={styles.meta}>{t("projectHub.overviewWaitingTeamOnly")}</p>
          : facts.waiting.length === 0 ? <p className={styles.meta}>{t("projectHub.overviewWaitingEmpty")}</p> : <>
            <div className={styles.rows}>
              {facts.waiting.map((w, i) => <div key={`${w.key.kind}:${w.key.userId ?? w.key.name ?? ""}`} className={styles.waitRow} data-first={i === 0 || undefined}>
                <strong>{nameOf(w.key)}</strong>
                <span className={styles.track} aria-hidden="true"><span style={{ width: `${(w.days / maxWait) * 100}%` }} /></span>
                <span>{t("projectHub.overviewWaitingDays", { days: fmtNumber(w.days, locale) })}</span>
              </div>)}
            </div>
            <div className={styles.total}><strong>{t("projectHub.overviewWaitingDays", { days: fmtNumber(waited, locale) })}</strong><span>{t("projectPages.reportsWaitingMost", { name: nameOf(facts.waiting[0].key) })}</span></div>
          </>}
        <Link className={styles.link} href={href("/dashboard")}>{t("projectPages.reportsOpenDashboard")}</Link>
      </section>
    </div>
  </div>;
}
