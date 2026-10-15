"use client";
// The Projects tab: every project this person may see, grouped by where it stands - Planning, Running,
// Measuring, Measured and recognised, Stopped (docs/plans/2026-10-15_idea-to-project.md §3).
// Members see the projects of their own ideas and the ones they are on; leaders and managers all.
// The page around it (title, tabs) is ProjectsHub.
import { groupProjects } from "@/features/projects/views";
import type { ReducedProject } from "@/features/projects/types";
import { ProjectCard } from "./parts";
import styles from "./Projects.module.css";

export function ProjectsList({ list }: { list: ReducedProject[] }) {
  const groups = groupProjects(list).filter((g) => g.projects.length > 0);
  return (
    <>
      {groups.map((g) => (
        <section key={g.key} className={styles.group} aria-label={g.label}>
          <h2 className={styles.groupHead}>{g.label}<span className={styles.count}>{g.projects.length}</span></h2>
          <div className={styles.cards}>
            {g.projects.map((p) => <ProjectCard key={p.id} p={p} />)}
          </div>
        </section>
      ))}
    </>
  );
}
