"use client";
// Does the system move after a yes: project movement since baseline and the wait ledger after the
// yes. Counts and medians only; no funnel, no ranking, nothing per person (MET/D2, D18).
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { PageHeader, SectionCard } from "@/components/ui/elements";
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
      {!on && <PageHeader title={t("progress.title")} lede={t("progress.lead")} />}
      <div className={styles.stack} data-tab={on ? "true" : undefined}>
        {!on ? (
          <SectionCard><div className={styles.empty}>{t("progress.emptyOff")}</div></SectionCard>
        ) : (
          <>
            <ProjectMovement />
            <SectionCard title={t("progress.ledgerHead")} hint={t("progress.ledgerSub")}>
              {list.length === 0 ? (
                <div className={styles.empty}>{t("progress.emptyLedger")}</div>
              ) : (
                <div className={ui.grid2}>
                  {L.startMedian !== null && <div className={ui.tile}>
                    <div className={styles.bigV}>{days(L.startMedian)}</div>
                    <div className={ui.tileL}>{t("progress.startWait")}</div>
                    <div className={ui.rowMeta}>{t("progress.startWaitSub", { count: L.notStarted })}</div>
                  </div>}
                  {L.measureMedian !== null && <div className={ui.tile}><div className={styles.bigV}>{days(L.measureMedian)}</div><div className={ui.tileL}>{t("progress.measureWait")}</div></div>}
                  {/* The counts show only above 0 (lib/utils/quiet.ts). */}
                  {L.moved > 0 && <div className={ui.tile}><div className={styles.bigV}>{L.moved}</div><div className={ui.tileL}>{t("progress.moved")}</div></div>}
                  {L.measuresOwed > 0 && <div className={ui.tile}><div className={styles.bigV} data-hot="true">{L.measuresOwed}</div><div className={ui.tileL}>{t("progress.owed")}</div></div>}
                  {L.withoutNumber > 0 && <div className={ui.tile}><div className={styles.bigV}>{L.withoutNumber}</div><div className={ui.tileL}>{t("progress.withoutNumber")}</div></div>}
                </div>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </>
  );
}
