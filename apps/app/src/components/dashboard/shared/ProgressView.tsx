"use client";
// Does the system move after a yes: how far each project's steps are, project movement since baseline and the wait
// ledger after the yes (drawn once, by ProjectMovement: DESIGN_RULES §9). Projects only - no idea rows (Kevin and Sam, 16 Nov 2026). Counts and medians only; no funnel,
// no ranking, nothing per person (MET/D2, D18).
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { PageHeader, SectionCard } from "@/components/ui/elements";
import { visibleProjectsFor } from "@/features/projects/views";
import { idViewerOf } from "@/components/projects/parts";
import { ProjectMovement } from "@/components/projects/ProjectMovement";
import { ProgressSteps } from "@/components/projects/area/ProgressSteps";
import { useT } from "@/i18n/client";
import styles from "./ProgressView.module.css";

export function ProgressView() {
  const ctx = useDemo();
  const { S, demo, ready, flag } = ctx;
  const t = useT();
  if (!ready) return <PageSkeleton kind="list" />;
  const on = flag("projects");
  const list = on ? visibleProjectsFor(S, idViewerOf(ctx), demo) : [];

  return (
    <>
      {!on && <PageHeader title={t("progress.title")} lede={t("progress.lead")} />}
      <div className={styles.stack} data-tab={on ? "true" : undefined}>
        {!on ? (
          <SectionCard><div className={styles.empty}>{t("progress.emptyOff")}</div></SectionCard>
        ) : (
          <>
            {list.length > 0 && <ProgressSteps list={list} />}
            <ProjectMovement />
          </>
        )}
      </div>
    </>
  );
}
