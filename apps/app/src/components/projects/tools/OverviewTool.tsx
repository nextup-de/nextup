"use client";
import { TeamPanel } from "../ProjectTeam";
import { Overview } from "../hub/overview/Overview";
import type { ToolProps } from "./types";
import styles from "../Projects.module.css";

/** The Overview: the viewer's one move as a card, then one line per section (result, steps, team, activity, weekly update, how we work) that opens on demand (DESIGN_RULES §9). */
export function OverviewTool({ p, page, tool, jira }: ToolProps) {
  return <div className={styles.tabCards}>
    <Overview p={p} page={page} tool={tool} jiraSynced={jira.state === "synced"} team={<TeamPanel p={p} bare />} />
  </div>;
}
