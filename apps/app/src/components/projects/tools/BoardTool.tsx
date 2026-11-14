"use client";
import { ProjectBoard } from "../ProjectBoard";
import type { ToolProps } from "./types";
import styles from "../Projects.module.css";

export function BoardTool({ p, hints, jira }: ToolProps) {
  return <div className={styles.tabCards}><ProjectBoard p={p} hints={hints} jira={jira} /></div>;
}
