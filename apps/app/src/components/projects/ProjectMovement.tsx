"use client";
// /progress, "Movement since baseline" (docs/plans/2026-10-15_idea-to-project.md §4): the real number
// before and after for every measured project, with the computed verdict - worse ones too - and the
// Wait ledger past the decision: late starts, measures owed, projects without a number, and how long
// a yes waits for its start and a done project for its first measure. Counts and medians only.
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { projectLabel } from "@/features/projects/selectors";
import { betterText, changeText, fmtNumber, measuredProjects, movement, projectWaits, visibleProjects, type WaitStat } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import type { Locale, T } from "@/i18n";
import { VerdictChip, viewerOf } from "./parts";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./Projects.module.css";

const days = (n: number | null, t: T, locale: Locale) => (n === null ? "—" : t("projects.waitDays", { count: n, value: fmtNumber(n, locale) }));
const waitSub = (w: WaitStat, still: string, t: T) => (w.n ? t("projects.waitMedian", { count: w.n }) : t("projects.waitNothing")) + (w.waiting ? " · " + w.waiting + " " + still : "");

export function ProjectMovement() {
  const ctx = useDemo();
  const t = useT();
  const locale = useLocale();
  const { S, demo, href } = ctx;
  const list = visibleProjects(S, viewerOf(ctx), demo);
  const measured = measuredProjects(list);
  const waits = projectWaits(list);
  const L = S.ledger;

  return (
    <div className={styles.split}>
      <div className={ui.card}>
        <div className={ui.h}>{t("projects.movementTitle")}</div>
        <div className={ui.sub}>{t("projects.movementSub")}</div>
        {measured.length === 0 && <div className={ui.emptyLine}>{t("projects.movementEmpty", { count: S.rules.measureDays[0] })}</div>}
        <div className={`${ui.list} ${ui.mt}`}>
          {measured.map((p) => (
            <div key={p.id} className={ui.listRow}>
              <div className={ui.between}>
                <Link href={href("/projects/" + p.id)} className={styles.link}>{projectLabel(p)} · {p.title}</Link>
                <VerdictChip verdict={p.verdict} />
              </div>
              {p.baseline && !p.baseline.none && <div className={ui.rowMeta}>{p.baseline.metric}, {betterText(p.baseline.better, locale)}</div>}
              <div className={`${ui.chips} ${styles.moves}`}>
                {p.measures.map((m) => (
                  <span key={m.check} className={styles.move}>
                    <span className={styles.label}>{m.check} {t("projects.unitDays")}</span> {movement(p.baseline, m, locale)}
                    {m.changePct !== null && <span className={styles.change} data-verdict={m.verdict}>{changeText(m.changePct, locale)}</span>}
                    <VerdictChip verdict={m.verdict} />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={ui.card}>
        <div className={ui.h}>{t("projects.waitTitle")}</div>
        <div className={ui.sub}>{t("projects.waitSub")}</div>
        <div className={`${ui.grid2} ${ui.mt14}`}>
          <div className={ui.tile}><div className={ui.tileV}>{days(waits.started.medianDays, t, locale)}</div><div className={ui.tileL}>{t("projects.waitDecidedStarted")} · {waitSub(waits.started, t("projects.waitNotStarted"), t)}</div></div>
          <div className={ui.tile}><div className={ui.tileV}>{days(waits.measured.medianDays, t, locale)}</div><div className={ui.tileL}>{t("projects.waitDoneMeasured")} · {waitSub(waits.measured, t("projects.waitFirstCheck"), t)}</div></div>
          <div className={ui.tile}><div className={ui.tileV} data-hot={L.projectsEscalated ? "true" : undefined}>{L.projectsEscalated}</div><div className={ui.tileL}>{t("projects.waitEscalated")}</div></div>
          <div className={ui.tile}><div className={ui.tileV} data-hot={L.measuresOwed ? "true" : undefined}>{L.measuresOwed}</div><div className={ui.tileL}>{t("projects.waitOwed")}</div></div>
          <div className={ui.tile}><div className={ui.tileV}>{L.unmeasured}</div><div className={ui.tileL}>{t("projects.waitUnmeasured")}</div></div>
        </div>
      </div>
    </div>
  );
}
