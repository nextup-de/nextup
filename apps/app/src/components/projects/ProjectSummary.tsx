"use client";
// Where a project stands, in one band under its title: the life it goes through (opened, baseline,
// started, done, measured, recognised - each with its day) and the numbers a lead checks every morning:
// how far the board is, what is blocked or late, how long a step takes, how long it has run, and the
// baseline against the latest measure. Read from the reduced project; nothing here is stored.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { ProgressBar } from "@/components/ui/elements";
import type { ReducedProject } from "@/features/projects/types";
import { betterText, boardStats, changeText, columnLabel, fmtNumber, lifecycle, verdictWord } from "@/features/projects/views";
import { useFormat, useLocale, useT } from "@/i18n/client";
import styles from "./Projects.module.css";

export function ProjectSummary({ p }: { p: ReducedProject }) {
  const { S, f } = useDemo();
  const t = useT();
  const locale = useLocale();
  const fmt = useFormat();
  const st = boardStats(p, S.day);
  const nextCheck = p.checks.find((c) => !c.measured);
  const stages = lifecycle(p, locale);
  const b = p.baseline;
  const last = p.measures[p.measures.length - 1];
  const running = p.startedDay !== null ? (p.doneDay ?? S.day) - p.startedDay : null;
  const segs = (["done", "doing", "blocked", "todo"] as const).filter((c) => st.by[c] > 0);

  return (
    <section className={styles.summary} aria-label={t("projects.summaryLabel")}>
      <ol className={styles.stepper} aria-label={t("projects.lifeLabel")}>
        {stages.map((s) => (
          <li key={s.key} className={styles.stage} data-state={s.state}>
            <span className={styles.stageDot} aria-hidden="true" />
            <span className={styles.stageLabel}>{s.label}</span>
            <span className={styles.stageDay}>
              {s.day !== null ? f(s.day)
                : s.key === "measured" && nextCheck ? t("projects.stageOpens", { day: f(nextCheck.opensDay) })
                : s.state === "now" ? t("projects.stageNext") : ""}
            </span>
          </li>
        ))}
      </ol>

      <dl className={styles.kpis}>
        <div className={styles.kpi}>
          <dt>{t("projects.kpiStepsDone")}</dt>
          <dd><span className={styles.kpiNum}>{st.by.done}</span><span className={styles.kpiOf}> / {st.total}</span></dd>
          <ProgressBar done={st.by.done} doing={st.by.doing} blocked={st.by.blocked} open={st.by.todo} label={segs.map((c) => st.by[c] + " " + columnLabel(c, locale)).join(", ") || t("projects.noSteps")} />
          <span className={styles.kpiNote}>{!st.total ? t("projects.kpiAddSteps") : st.by.doing ? t("projects.kpiProgress", { pct: st.pct, count: st.by.doing }) : t("projects.kpiProgressPct", { pct: st.pct })}</span>
        </div>
        {/* Blocked and Late show only when there is something to say (lib/utils/quiet.ts). */}
        {st.by.blocked > 0 && <div className={styles.kpi} data-hot="true">
          <dt>{t("projects.col_blocked")}</dt>
          <dd><span className={styles.kpiNum}>{st.by.blocked}</span></dd>
          <span className={styles.kpiNote}>{st.stalest ? t("projects.kpiLongest", { days: fmt.days(st.stalest.days), column: columnLabel(st.stalest.step.column, locale) }) : t("projects.kpiNothingStuck")}</span>
        </div>}
        {(st.late > 0 || st.unowned > 0) && <div className={styles.kpi} data-hot={st.late > 0 ? "true" : undefined}>
          <dt>{t("projects.kpiLate")}</dt>
          <dd><span className={styles.kpiNum}>{st.late}</span></dd>
          <span className={styles.kpiNote}>{st.unowned ? t("projects.kpiUnowned", { count: st.unowned }) : t("projects.kpiAllOwned")}</span>
        </div>}
        {st.cycleDays !== null && <div className={styles.kpi}>
          <dt>{t("projects.cycleTime")}</dt>
          <dd><span className={styles.kpiNum}>{fmtNumber(st.cycleDays, locale)}</span><span className={styles.kpiOf}> {t("projects.unitDays")}</span></dd>
          <span className={styles.kpiNote}>{st.doneWeek ? t("projects.kpiCycleNote", { count: st.doneWeek }) : t("projects.kpiCycleNoteMedian")}</span>
        </div>}
        <div className={styles.kpi}>
          <dt>{running !== null ? (p.doneDay !== null ? t("projects.kpiTook") : t("projects.status_running")) : t("projects.kpiOpenFor")}</dt>
          <dd><span className={styles.kpiNum}>{running ?? S.day - p.openedDay}</span><span className={styles.kpiOf}> {t("projects.unitDays")}</span></dd>
          <span className={styles.kpiNote}>{p.startedDay !== null ? t("projects.kpiSinceStart", { day: f(p.startedDay) }) : t("projects.kpiSinceYes", { day: f(p.openedDay) })}</span>
        </div>
        <div className={styles.kpi}>
          <dt>{t("projects.kpiBaselineNow")}</dt>
          <dd>
            {!b ? <span className={styles.kpiNone}>{t("projects.kpiNotTaken")}</span>
              : b.none ? <span className={styles.kpiNone}>{t("projects.kpiNoNumber")}</span>
              : <><span className={styles.kpiNum}>{fmtNumber(b.value, locale)}</span>{last && <span className={styles.kpiNum} data-verdict={last.verdict}> → {fmtNumber(last.value, locale)}</span>}<span className={styles.kpiOf}> {b.unit}</span></>}
          </dd>
          <span className={styles.kpiNote}>
            {b && !b.none ? (last ? t("projects.kpiCheckNote", { change: changeText(last.changePct, locale) || verdictWord(last.verdict, locale), check: last.check }) : b.metric + " · " + betterText(b.better, locale)) : b?.none ? b.why : t("projects.kpiTakenBefore")}
          </span>
        </div>
      </dl>
    </section>
  );
}
