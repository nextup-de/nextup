"use client";
// The tabs of the Projects area: the projects themselves, the map across departments, and what moved.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { Tabs } from "@/components/ui/elements";
import { useT } from "@/i18n/client";
import styles from "./Projects.module.css";

export type ProjectsTab = "projects" | "collaboration" | "progress";

export function ProjectsTabs({ active }: { active: ProjectsTab }) {
  const { href } = useDemo();
  const t = useT();
  const items = [
    { key: "projects", href: href("/projects"), label: t("projects.pageTitle") },
    { key: "collaboration", href: href("/projects/collaboration"), label: t("shell.navCollaboration") },
    { key: "progress", href: href("/projects/progress"), label: t("shell.navProgress") },
  ];
  return (
    <div className={styles.areaTabs} data-testid="projects-tabs">
      <Tabs items={items} current={active} label={t("projects.pageTitle")} />
    </div>
  );
}
