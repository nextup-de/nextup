"use client";
// The frame of a page in the Projects area: as wide as the strip of tabs (shell/SectionTabs), so the tabs line up
// with the page and stay put from tab to tab.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PROJECTS_TABS, type ProjectsTabKey } from "@/config/nav";
import { useT } from "@/i18n/client";
import styles from "./Projects.module.css";

/**
 * A page in the area. The tab is its title, so the heading is for screen readers only. Without projects there are no
 * tabs and the page keeps its own header; `off` is what it shows then, when that differs from the tab's content.
 */
export function ProjectsPage({ tab, off, children }: { tab: ProjectsTabKey; off?: React.ReactNode; children: React.ReactNode }) {
  const { flag } = useDemo();
  const t = useT();
  if (!flag("projects")) return <>{off ?? children}</>;
  const labelKey = PROJECTS_TABS.find((item) => item.key === tab)?.labelKey;
  return (
    <div className={styles.hub} data-wide="true">
      {labelKey && <h1 className="nh-sr">{t(labelKey)}</h1>}
      {children}
    </div>
  );
}
