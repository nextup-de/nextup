"use client";
import { useT } from "@/i18n/client";
import { FilesPanel, OriginPanel } from "../ProjectOrigin";
import { ToolsPanel } from "../ProjectTeam";
import type { ToolProps } from "./types";
import styles from "../Projects.module.css";

export function FilesTool({ p, jira }: ToolProps) {
  const t = useT();
  return <div className={styles.tabLayout}>
    <div className={styles.tabCards}><OriginPanel p={p} /></div>
    <aside className={styles.tabRail} aria-label={t("projects.railLabel")}><ToolsPanel p={p} jira={jira} /><FilesPanel p={p} /></aside>
  </div>;
}
