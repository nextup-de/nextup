"use client";
// Where a project stands, in one band under its title: the life it goes through (opened, baseline,
// started, done, measured, recognised - each with its day) and the numbers a lead checks every morning:
// how far the board is, what is blocked or late, how long a step takes, how long it has run, and the
// baseline against the latest measure. Read from the reduced project; nothing here is stored.
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { ReducedProject } from "@/features/projects/types";
import { boardStats, changeText, COLUMN_LABEL, fmtNumber, lifecycle } from "@/features/projects/views";
import styles from "./Projects.module.css";

const days = (n: number) => n + (n === 1 ? " day" : " days");

export function ProjectSummary({ p }: { p: ReducedProject }) {
  const { S, f } = useDemo();
  const st = boardStats(p, S.day);
  const nextCheck = p.checks.find((c) => !c.measured);
  const stages = lifecycle(p);
  const b = p.baseline;
  const last = p.measures[p.measures.length - 1];
  const running = p.startedDay !== null ? (p.doneDay ?? S.day) - p.startedDay : null;
  const segs = (["done", "doing", "blocked", "todo"] as const).filter((c) => st.by[c] > 0);

  return (
    <section className={styles.summary} aria-label="Where it stands">
      <ol className={styles.stepper} aria-label="The project's life">
        {stages.map((s) => (
          <li key={s.key} className={styles.stage} data-state={s.state}>
            <span className={styles.stageDot} aria-hidden="true" />
            <span className={styles.stageLabel}>{s.label}</span>
            <span className={styles.stageDay}>
              {s.day !== null ? f(s.day)
                : s.key === "measured" && nextCheck ? "opens " + f(nextCheck.opensDay)
                : s.state === "now" ? "next" : ""}
            </span>
          </li>
        ))}
      </ol>

      <dl className={styles.kpis}>
        <div className={styles.kpi}>
          <dt>Steps done</dt>
          <dd><span className={styles.kpiNum}>{st.by.done}</span><span className={styles.kpiOf}> / {st.total}</span></dd>
          <div className={styles.segbar} role="img" aria-label={segs.map((c) => st.by[c] + " " + COLUMN_LABEL[c]).join(", ") || "No steps"}>
            {segs.map((c) => <span key={c} data-col={c} style={{ flexGrow: st.by[c] }} />)}
          </div>
          <span className={styles.kpiNote}>{st.total ? st.pct + "% · " + st.by.doing + " in progress" : "Add the first steps"}</span>
        </div>
        <div className={styles.kpi} data-hot={st.by.blocked > 0 ? "true" : undefined}>
          <dt>Blocked</dt>
          <dd><span className={styles.kpiNum}>{st.by.blocked}</span></dd>
          <span className={styles.kpiNote}>{st.stalest ? "Longest: " + days(st.stalest.days) + " in " + COLUMN_LABEL[st.stalest.step.column] : "Nothing stuck"}</span>
        </div>
        <div className={styles.kpi} data-hot={st.late > 0 ? "true" : undefined}>
          <dt>Late</dt>
          <dd><span className={styles.kpiNum}>{st.late}</span></dd>
          <span className={styles.kpiNote}>{st.unowned ? st.unowned + " open without an owner" : "Every open step has an owner"}</span>
        </div>
        <div className={styles.kpi}>
          <dt>Cycle time</dt>
          <dd><span className={styles.kpiNum}>{st.cycleDays === null ? "-" : fmtNumber(st.cycleDays)}</span>{st.cycleDays !== null && <span className={styles.kpiOf}> d</span>}</dd>
          <span className={styles.kpiNote}>Doing → Done, median · {st.doneWeek} done this week</span>
        </div>
        <div className={styles.kpi}>
          <dt>{running !== null ? (p.doneDay !== null ? "Took" : "Running") : "Open for"}</dt>
          <dd><span className={styles.kpiNum}>{running ?? S.day - p.openedDay}</span><span className={styles.kpiOf}> d</span></dd>
          <span className={styles.kpiNote}>{p.startedDay !== null ? "since the start, " + f(p.startedDay) : "since the yes, " + f(p.openedDay)}</span>
        </div>
        <div className={styles.kpi}>
          <dt>Baseline → now</dt>
          <dd>
            {!b ? <span className={styles.kpiNone}>Not taken</span>
              : b.none ? <span className={styles.kpiNone}>No number</span>
              : <><span className={styles.kpiNum}>{fmtNumber(b.value)}</span>{last && <span className={styles.kpiNum} data-verdict={last.verdict}> → {fmtNumber(last.value)}</span>}<span className={styles.kpiOf}> {b.unit}</span></>}
          </dd>
          <span className={styles.kpiNote}>
            {b && !b.none ? (last ? (changeText(last.changePct) || last.verdict) + " · " + last.check + "-day check" : b.metric + " · " + (b.better === "up" ? "higher" : "lower") + " is better") : b?.none ? b.why : "Taken before the start"}
          </span>
        </div>
      </dl>
    </section>
  );
}
