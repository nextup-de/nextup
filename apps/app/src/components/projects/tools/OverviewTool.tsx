"use client";
import { TeamPanel } from "../ProjectTeam";
import { NextPanel } from "../ProjectNext";
import { WeeklyUpdate } from "../move/WeeklyUpdate";
import { HowWeWork } from "../move/HowWeWork";
import { Overview } from "../hub/overview/Overview";
import type { ToolProps } from "./types";
import styles from "../Projects.module.css";

/** The Overview as Paper "Jira pages · new header" draws it (tiles, where the steps are, who has what, latest); the team sits under the latest, and what happens next, the weekly update and how we work follow below. */
export function OverviewTool({ p, page, tool, jira }: ToolProps) {
  return <div className={styles.tabCards}>
    <Overview p={p} page={page} tool={tool} jiraSynced={jira.state === "synced"} aside={<TeamPanel p={p} />} />
    <NextPanel p={p} />
    {p.status === "running" && <WeeklyUpdate p={p} />}
    <HowWeWork p={p} />
  </div>;
}
