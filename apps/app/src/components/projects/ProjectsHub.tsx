"use client";
// Projects and the Overview on one page, side by side: "Projects" (what ideas became, grouped by where
// they stand) on the left and "Ideas" (every problem and idea, the old Overview table) on the right.
// /projects and /overview both stay valid addresses and show the same page; ProjectsTabs leads to the other tabs. The page is a wide one
// (about 80% of the screen) so both columns get room; below 1100px they stack, projects first.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { DashboardView } from "@/components/dashboard/team/DashboardView";
import { visibleProjectsFor } from "@/features/projects/views";
import { useT } from "@/i18n/client";
import { ProjectsList } from "./ProjectsView";
import { ProjectsTabs } from "./ProjectsTabs";
import { idViewerOf } from "./parts";
import styles from "./Projects.module.css";

export type HubTab = "projects" | "ideas";

export function ProjectsHub({ tab, linkCases = false }: { tab: HubTab; linkCases?: boolean }) {
  const ctx = useDemo();
  const t = useT();
  const { S, ready, demo, flag, role } = ctx;
  if (!ready) return <PageSkeleton kind={tab === "ideas" ? "dashboard" : "list"} delay />;
  if (!flag("projects")) return <DashboardView linkCases={linkCases} />;
  const projects = visibleProjectsFor(S, idViewerOf(ctx), demo);

  return (
    <div className={styles.hub} data-wide="true">
      <header className={styles.head}>
        <ProjectsTabs active="projects" />
        <h1 className={styles.title}>{t("projects.pageTitle")}</h1>
        <p className={styles.sub}>
          {role === "member"
            ? t("projects.hubSubMember")
            : t("projects.hubSubLead")}
        </p>
      </header>
      <div className={styles.hubCols}>
        <section className={styles.hubProjects} aria-label={t("projects.pageTitle")}>
          <div className={styles.hubHead}>
            <h2 className={styles.hubTitle}>{t("projects.pageTitle")}<span className={styles.count}>{projects.length}</span></h2>
          </div>
          {projects.length > 0 ? (
            <ProjectsList list={projects} />
          ) : (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>{t("projects.hubEmptyTitle")}</div>
              <div className={styles.emptySub}>{t("projects.hubEmptySub")}</div>
            </div>
          )}
        </section>
        <section className={styles.hubIdeas} aria-label={t("projects.hubIdeas")}>
          <DashboardView linkCases={linkCases} embedded title={<h2 className={styles.hubTitle}>{t("projects.hubIdeas")}</h2>} />
        </section>
      </div>
    </div>
  );
}
