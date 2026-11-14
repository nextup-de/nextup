"use client";
import { useT } from "@/i18n/client";
import { TeamPanel } from "../ProjectTeam";
import { ProjectSummary } from "../ProjectSummary";
import { NextPanel } from "../ProjectNext";
import { WeeklyUpdate } from "../move/WeeklyUpdate";
import { HowWeWork } from "../move/HowWeWork";
import { BaselinePanel } from "../ProjectMeasure";
import { useProjectHints } from "../draft/useProjectHints";
import type { ToolProps } from "./types";
import styles from "../Projects.module.css";

export function OverviewTool({ p }: ToolProps) {
  const t = useT();
  const { baseHint } = useProjectHints(p);
  return <div className={styles.tabLayout}><div className={styles.tabCards}><ProjectSummary p={p} />{p.status === "planning" && <BaselinePanel p={p} hint={baseHint} />}<NextPanel p={p} />{p.status === "running" && <WeeklyUpdate p={p} />}<HowWeWork p={p} /></div><aside className={styles.tabRail} aria-label={t("projects.railLabel")}><TeamPanel p={p} /></aside></div>;
}
