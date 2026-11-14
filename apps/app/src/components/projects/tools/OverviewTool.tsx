"use client";
import { useT } from "@/i18n/client";
import { TeamPanel } from "../ProjectTeam";
import { NextPanel } from "../ProjectNext";
import { WeeklyUpdate } from "../move/WeeklyUpdate";
import { HowWeWork } from "../move/HowWeWork";
import { Overview } from "../hub/overview/Overview";
import type { ToolProps } from "./types";
import styles from "../Projects.module.css";

export function OverviewTool({ p, page, tool }: ToolProps) {
  const t = useT();
  return <div className={styles.tabLayout}><div className={styles.tabCards}><Overview p={p} page={page} tool={tool} /><NextPanel p={p} />{p.status === "running" && <WeeklyUpdate p={p} />}<HowWeWork p={p} /></div><aside className={styles.tabRail} aria-label={t("projects.railLabel")}><TeamPanel p={p} /></aside></div>;
}
