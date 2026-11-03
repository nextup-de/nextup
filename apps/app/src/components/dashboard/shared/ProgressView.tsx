"use client";
// Does the system move after a yes: project movement since baseline and the wait ledger after the
// yes. Counts and medians only; no funnel, no ranking, nothing per person (MET/D2, D18).
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { projectLedger } from "@/features/metrics/progress";
import { visibleProjectsFor } from "@/features/projects/views";
import { idViewerOf } from "@/components/projects/parts";
import { ProjectMovement } from "@/components/projects/ProjectMovement";
import { useFormat, useT } from "@/i18n/client";
import ui from "@/components/dashboard/shared/ui.module.css";
import styles from "./ProgressView.module.css";

export function ProgressView() {
  const ctx = useDemo();
  const { S, demo, ready, flag } = ctx;
  const t = useT();
  const fmt = useFormat();
  if (!ready) return <PageSkeleton kind="list" delay />;
  const on = flag("projects");
  const list = on ? visibleProjectsFor(S, idViewerOf(ctx), demo) : [];
  const L = projectLedger(list, S.day);
  const days = (n: number | null) => (n === null ? "–" : fmt.number(Math.round(n * 10) / 10));

  return (
    <>
      <div className={styles.head}>
        <h1 className={styles.title}>{t("progress.title")}</h1>
        <div className={styles.lead}>{t("progress.lead")}</div>
      </div>
      <div className={ui.stack14}>
        {!on ? (
          <div className={ui.card}><div className={ui.emptyLine}>{t("progress.emptyOff")}</div></div>
        ) : (
          <>
            <ProjectMovement />
            <div className={ui.card}>
              <div className={ui.h}>{t("progress.ledgerHead")}</div>
              <div className={ui.sub}>{t("progress.ledgerSub")}</div>
              {list.length === 0 ? (
                <div className={ui.emptyLine}>{t("progress.emptyLedger")}</div>
              ) : (
                <div className={`${ui.grid2} ${ui.mt14}`}>
                  <div className={ui.tile}>
                    <div className={styles.bigV}>{days(L.startMedian)}</div>
                    <div className={ui.tileL}>{t("progress.startWait")}</div>
                    <div className={ui.rowMeta}>{t("progress.startWaitSub", { count: L.notStarted })}</div>
                  </div>
                  <div className={ui.tile}><div className={styles.bigV}>{days(L.measureMedian)}</div><div className={ui.tileL}>{t("progress.measureWait")}</div></div>
                  <div className={ui.tile}><div className={styles.bigV}>{L.moved}</div><div className={ui.tileL}>{t("progress.moved")}</div></div>
                  <div className={ui.tile}><div className={styles.bigV} data-hot={L.measuresOwed > 0 ? "true" : undefined}>{L.measuresOwed}</div><div className={ui.tileL}>{t("progress.owed")}</div></div>
                  <div className={ui.tile}><div className={styles.bigV}>{L.withoutNumber}</div><div className={ui.tileL}>{t("progress.withoutNumber")}</div></div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
