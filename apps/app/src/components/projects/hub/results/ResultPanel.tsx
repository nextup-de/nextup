"use client";
import type { ReducedProject } from "@/features/projects/types";
import { BaselinePanel, MeasurePanel, RewardPanel } from "../../ProjectMeasure";
import { useProjectHints } from "../../draft/useProjectHints";
import styles from "./Results.module.css";

/** RES remains in its existing panels, including permissions and revision-bound actions. The panels speak: no title, chip or dates above them. */
export function ResultPanel({ p }: { p: ReducedProject }) {
  const { baseHint } = useProjectHints(p);
  return <div className={styles.drawerBody}>
    <BaselinePanel p={p} hint={p.status === "planning" ? baseHint : null} />
    {(p.doneDay !== null || p.measures.length > 0) && <MeasurePanel p={p} />}
    <RewardPanel p={p} />
  </div>;
}
