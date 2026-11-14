"use client";
import { BaselinePanel, MeasurePanel, RewardPanel } from "../ProjectMeasure";
import { useProjectHints } from "../draft/useProjectHints";
import type { ToolProps } from "./types";
import styles from "../Projects.module.css";

export function ResultsTool({ p }: ToolProps) {
  const { baseHint } = useProjectHints(p);
  return <div className={styles.tabCards}><BaselinePanel p={p} hint={p.status === "planning" ? baseHint : null} />{(p.doneDay !== null || p.measures.length > 0) && <MeasurePanel p={p} />}<RewardPanel p={p} /></div>;
}
