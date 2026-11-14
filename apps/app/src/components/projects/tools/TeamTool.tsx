"use client";
import { TeamPanel } from "../ProjectTeam";
import type { ToolProps } from "./types";
import styles from "../Projects.module.css";

export function TeamTool({ p }: ToolProps) {
  return <div className={styles.tabNarrow}><div className={styles.tabRail}><TeamPanel p={p} /></div></div>;
}
