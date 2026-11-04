"use client";
// The tabs of the Projects area: the projects themselves, the map across departments, and what moved.
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { useT } from "@/i18n/client";
import styles from "./Projects.module.css";

export type ProjectsTab = "projects" | "collaboration" | "progress";

export function ProjectsTabs({ active }: { active: ProjectsTab }) {
  const { href } = useDemo();
  const t = useT();
  const tabs = [
    { key: "projects", to: "/projects", label: t("projects.pageTitle") },
    { key: "collaboration", to: "/projects/collaboration", label: t("shell.navCollaboration") },
    { key: "progress", to: "/projects/progress", label: t("shell.navProgress") },
  ] as const;
  return (
    <nav className={styles.tabs} aria-label={t("projects.pageTitle")} data-testid="projects-tabs">
      {tabs.map((tab) => (
        <Link key={tab.key} href={href(tab.to)} className={styles.tab} aria-current={tab.key === active ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
