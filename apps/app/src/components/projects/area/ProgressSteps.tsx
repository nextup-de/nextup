"use client";
// Projects › Progress, the Steps card: one row per project that is not stopped - how far its board has come, the stuck
// and late steps, and "all steps done" once it is. Projects only; the rows come from features/projects/progress-view.ts.
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { ProgressBar, SectionCard, ShowAll, useCapped } from "@/components/ui/elements";
import { stepProgress, type StepProgress } from "@/features/projects/progress-view";
import { projectLabel } from "@/features/projects/selectors";
import type { ReducedProject } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./Area.module.css";

export function ProgressSteps({ list }: { list: readonly ReducedProject[] }) {
  const { S } = useDemo();
  const t = useT();
  const rows = stepProgress(list, S.day);
  const capped = useCapped(rows);
  return (
    <SectionCard title={t("progress.stepsHead")} name="steps">
      {rows.every((r) => r.total === 0) ? (
        <div className={ui.emptyLine}>{t("progress.stepsEmpty")}</div>
      ) : (
        <>
          <ul className={styles.rows}>{capped.shown.map((r) => <Row key={r.id} r={r} />)}</ul>
          <ShowAll list={capped} showAll={(count) => t("common.showAll", { count })} showLess={t("common.showLess")} />
        </>
      )}
    </SectionCard>
  );
}

function Row({ r }: { r: StepProgress }) {
  const { href } = useDemo();
  const t = useT();
  const done = r.allDone
    ? t("progress.stepsAllDone", { count: r.total })
    : r.total === 0 ? t("progress.stepsNone") : t("progress.stepsFraction", { done: r.done, total: r.total });
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <Link href={href("/projects/" + r.id)} className={styles.link}>{projectLabel(r)} · {r.title}</Link>
        <span className={styles.status}>{t(("projects.status_" + r.status) as "projects.status_planning")}</span>
      </div>
      {r.total > 0 && (
        <div className={styles.bar}>
          <ProgressBar done={r.done} doing={r.doing} blocked={r.blocked} open={r.todo} label={done} />
        </div>
      )}
      <div className={styles.meta}>
        {/* The bar says how far it is (its label says it in words): no count beside it (DESIGN_RULES §9). */}
        {r.total === 0 && <span>{done}</span>}
        {r.stuck > 0 && <span data-hot="true">{t("progress.stepsStuck", { count: r.stuck, days: r.longestStuckDays ?? 0 })}</span>}
        {r.late > 0 && <span data-hot="true">{t("projects.countLate", { count: r.late })}</span>}
      </div>
    </li>
  );
}
