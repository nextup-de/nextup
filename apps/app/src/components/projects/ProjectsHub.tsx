"use client";
// Projects and the Overview on one page, side by side: "Projects" (what ideas became, grouped by where
// they stand) on the left and "Ideas" (every problem and idea, the old Overview table) on the right.
// /projects and /overview both stay valid addresses and show the same page. The page is a wide one
// (about 80% of the screen) so both columns get room; below 1100px they stack, projects first.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { DashboardView } from "@/components/dashboard/team/DashboardView";
import { visibleProjects } from "@/features/projects/views";
import { ProjectsList } from "./ProjectsView";
import { viewerOf } from "./parts";
import styles from "./Projects.module.css";

export type HubTab = "projects" | "ideas";

export function ProjectsHub({ tab, linkCases = false }: { tab: HubTab; linkCases?: boolean }) {
  const ctx = useDemo();
  const { S, ready, demo, flag, role } = ctx;
  if (!ready) return <PageSkeleton kind={tab === "ideas" ? "dashboard" : "list"} delay />;
  if (!flag("projects")) return <DashboardView linkCases={linkCases} />;
  const projects = visibleProjects(S, viewerOf(ctx), demo);

  return (
    <div className={styles.hub} data-wide="true">
      <header className={styles.head}>
        <h1 className={styles.title}>Projects</h1>
        <p className={styles.sub}>
          {role === "member"
            ? "What your ideas became, and every idea and problem on its way there."
            : "Every idea from the first word to the measured result, and the projects it became."}
        </p>
      </header>
      <div className={styles.hubCols}>
        <section className={styles.hubProjects} aria-label="Projects">
          <div className={styles.hubHead}>
            <h2 className={styles.hubTitle}>Projects<span className={styles.count}>{projects.length}</span></h2>
          </div>
          {projects.length > 0 ? (
            <ProjectsList list={projects} />
          ) : (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>No projects yet</div>
              <div className={styles.emptySub}>An idea becomes a project once it gets a yes.</div>
            </div>
          )}
        </section>
        <section className={styles.hubIdeas} aria-label="Ideas">
          <DashboardView linkCases={linkCases} embedded title={<h2 className={styles.hubTitle}>Ideas</h2>} />
        </section>
      </div>
    </div>
  );
}
