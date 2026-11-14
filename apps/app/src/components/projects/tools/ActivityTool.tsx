"use client";
import { ActivityPanel } from "../ProjectTeam";
import type { ToolProps } from "./types";
import styles from "../Projects.module.css";

export function ActivityTool({ p }: ToolProps) {
  return <div className={styles.tabCards}><ActivityPanel p={p} /></div>;
}
