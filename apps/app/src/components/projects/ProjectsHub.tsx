"use client";
// Projects and the Overview on one page: two tabs, "Projects" (what ideas became, grouped by where
// they stand) and "Ideas & problems" (every problem and idea, the old Overview table). The tabs are
// links, so /projects and /overview both stay valid addresses. Before any idea got a yes there are no
// projects, so the page opens on the table instead of an empty list.
import Link from "next/link";
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
  const { S, ready, demo, flag, href, role } = ctx;
  if (!ready) return <PageSkeleton kind={tab === "ideas" ? "dashboard" : "list"} delay />;
  const on = flag("projects");
  const projects = on ? visibleProjects(S, viewerOf(ctx), demo) : [];
  const active: HubTab = tab === "projects" && projects.length > 0 ? "projects" : "ideas"; // no projects yet: the table

  return (
    <>
      {on && (
        <header className={styles.head} data-wide="true">
          <h1 className={styles.title}>Projects</h1>
          <p className={styles.sub}>
            {role === "member"
              ? "What your ideas became, and every idea and problem on its way there."
              : "Every idea from the first word to the measured result, and the projects it became."}
          </p>
          <nav className={styles.tabs} aria-label="Projects and ideas">
            <Link href={href("/projects")} className={styles.tab} data-active={active === "projects" ? "true" : undefined} aria-current={active === "projects" ? "page" : undefined}>
              Projects<span className={styles.count}>{projects.length}</span>
            </Link>
            <Link href={href("/overview")} className={styles.tab} data-active={active === "ideas" ? "true" : undefined} aria-current={active === "ideas" ? "page" : undefined}>
              Ideas &amp; problems
            </Link>
          </nav>
        </header>
      )}
      {active === "projects" ? <ProjectsList list={projects} /> : <DashboardView linkCases={linkCases} embedded={on} />}
    </>
  );
}
