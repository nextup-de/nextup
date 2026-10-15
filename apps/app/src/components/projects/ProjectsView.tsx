"use client";
// /projects: every project this person may see, grouped by where it stands - Planning, Running,
// Measuring, Measured and recognised, Stopped (docs/plans/2026-10-15_idea-to-project.md §3).
// Members see the projects of their own ideas and the ones they are on; leaders and managers all.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { groupProjects, visibleProjects } from "@/features/projects/views";
import { ProjectCard, ProjectsOff, viewerOf } from "./parts";
import styles from "./Projects.module.css";

export function ProjectsView() {
  const ctx = useDemo();
  const { S, ready, demo, flag, role } = ctx;
  if (!ready) return <PageSkeleton kind="list" delay />;
  if (!flag("projects")) return <ProjectsOff />;
  const list = visibleProjects(S, viewerOf(ctx), demo);
  const groups = groupProjects(list).filter((g) => g.projects.length > 0);

  return (
    <>
      <header className={styles.head}>
        <h1 className={styles.title}>Projects</h1>
        <p className={styles.sub}>
          {role === "member"
            ? "What your ideas became, and the projects you work on: the board, the number before, the number after."
            : "Every idea that got a yes, from the first step to the measured result."}
        </p>
      </header>
      {groups.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No projects yet</div>
          <div className={styles.emptySub}>{role === "member" ? "When one of your ideas gets a yes, its project shows here." : "When an idea gets a yes, its project opens here."}</div>
        </div>
      )}
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
