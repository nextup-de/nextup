"use client";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { useT } from "@/i18n/client";
import type { ReducedProject } from "@/features/projects/types";
import { BaselinePanel, MeasurePanel, RewardPanel } from "../../ProjectMeasure";
import { useProjectHints } from "../../draft/useProjectHints";
import { VerdictChip } from "../../parts";
import styles from "./Results.module.css";

/** RES remains in its existing panels, including permissions and revision-bound actions. */
export function ResultPanel({ p }: { p: ReducedProject }) {
  const { S, f } = useDemo();
  const t = useT();
  const { baseHint } = useProjectHints(p);
  const baseline = p.baseline && !p.baseline.none ? p.baseline : null;
  const latest = p.measures.filter((m) => !m.sentBack).reduce<typeof p.measures[number] | null>((last, m) => !last || m.day >= last.day ? m : last, null);
  const next = p.checks.filter((c) => !c.measured || p.measures.some((m) => m.check === c.check && m.sentBack)).sort((a, b) => a.dueDay - b.dueDay)[0];
  const owner = p.leadUserId ? S.seats.find((s) => s.userId === p.leadUserId)?.label ?? p.lead : p.lead;
  return <div className={styles.drawerBody}>
    <h3 className={styles.detailTitle}>{p.goal?.goal || baseline?.metric || p.title}</h3>
    <VerdictChip verdict={latest?.verdict ?? "not measured"} />
    {next && <div className={styles.detailMeta}><span>{t("projects.owner")}: {owner || t("projectHub.overviewNoOwner")}</span><span>{t("projectHub.resultsCheckAfterDays", { days: next.check })}</span><span>{t("projectHub.resultsCheckDue", { date: f(next.dueDay) })}</span></div>}
    <BaselinePanel p={p} hint={p.status === "planning" ? baseHint : null} />
    {(p.doneDay !== null || p.measures.length > 0) && <MeasurePanel p={p} />}
    <RewardPanel p={p} />
  </div>;
}
