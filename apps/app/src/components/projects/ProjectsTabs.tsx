"use client";
// The tabs of the Projects area, in a strip under the bar (SimpleShell renders it), and the frame of a page in
// the area: as wide as the strip, so the tabs line up with the page and stay put from tab to tab.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Tabs } from "@/components/ui/elements";
import { PROJECTS_TABS, projectsTabsFor, type ProjectsTabKey } from "@/config/nav";
import { useT } from "@/i18n/client";
import styles from "./Projects.module.css";

export function ProjectsTabs({ active }: { active: ProjectsTabKey }) {
  const { href, role } = useDemo();
  const t = useT();
  const items = projectsTabsFor(role).map((tab) => ({ key: tab.key, href: href(tab.href), label: t(tab.labelKey) }));
  return (
    <div className={styles.areaTabs} data-testid="projects-tabs">
      <Tabs items={items} current={active} label={t("projects.pageTitle")} />
    </div>
  );
}

/** A page in the area. The tab is its title, so the heading is for screen readers only. Without projects there are no tabs and the page keeps its own header. */
export function ProjectsPage({ tab, children }: { tab: ProjectsTabKey; children: React.ReactNode }) {
  const { flag } = useDemo();
  const t = useT();
  if (!flag("projects")) return <>{children}</>;
  const labelKey = PROJECTS_TABS.find((item) => item.key === tab)?.labelKey;
  return (
    <div className={styles.hub} data-wide="true">
      {labelKey && <h1 className="nh-sr">{t(labelKey)}</h1>}
      {children}
    </div>
  );
}
