"use client";
// The Overview tab of Projects (/projects): every project this person may see, grouped by where it stands. Projects only:
// ideas are raised and followed in the Ideas tab and decided in the Inbox (Kevin and Sam, 16 Nov 2026). A project draft
// that an approved idea became is a project and shows here.
// The old addresses of the ideas table, /overview and /idea?id=, still open the table and the idea in it (notices and
// search link there): tab "ideas" draws the table alone. An idea once opened on /projects?id= moves on to /idea?id=.
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PageSkeleton } from "@/components/dashboard/shared/PageSkeleton";
import { DashboardView } from "@/components/dashboard/team/DashboardView";
import { visibleProjectsFor } from "@/features/projects/views";
import { visibleTo } from "@/components/dashboard/derive";
import type { ReducedCase } from "@/features/cases/reducer";
import { onDeskOf } from "@/features/cases/selectors";
import { ideaItem, listedIdea, listedProject, projectItem } from "@/features/overview/items";
import { deskLabel } from "@/features/overview/rows";
import { OverviewList } from "./overview/OverviewList";
import { useT } from "@/i18n/client";
import { ProjectsList } from "./ProjectsView";
import { idViewerOf } from "./parts";
import styles from "./Projects.module.css";

export type HubTab = "projects" | "ideas";

export function ProjectsHub({ tab, linkCases = false }: { tab: HubTab; linkCases?: boolean }) {
  const ctx = useDemo();
  const t = useT();
  const { S, ready, demo, flag, href } = ctx;
  const router = useRouter();
  const oldIdea = useSearchParams().get("id");
  const movesOn = tab === "projects" && oldIdea !== null && flag("projects");
  useEffect(() => { if (movesOn && oldIdea) router.replace(href("/idea?id=" + encodeURIComponent(oldIdea))); }, [movesOn, oldIdea, router, href]);
  if (!ready || movesOn) return <PageSkeleton kind={tab === "ideas" || movesOn ? "dashboard" : "list"} />;
  if (!flag("projects")) return <DashboardView linkCases={linkCases} />;

  if (tab === "ideas") {
    return (
      <div className={styles.hub} data-wide="true">
        <h1 className="nh-sr">{t("projects.hubIdeas")}</h1>
        <section aria-label={t("projects.hubIdeas")}>
          <DashboardView linkCases={linkCases} embedded title={<h2 className={styles.hubTitle}>{t("projects.hubIdeas")}</h2>} />
        </section>
      </div>
    );
  }

  const projects = visibleProjectsFor(S, idViewerOf(ctx), demo);
  if (tab === "projects" && flag("overviewList")) {
    // The Overview list (Paper "Overview · final + interactions"): the ideas still moving and the projects, as one list.
    const { me, seed } = ctx;
    const roles = seed.roles ?? [];
    const ideaMove = (c: ReducedCase) => {
      const mine = me.userId !== null && c.fromUserId === me.userId;
      return (mine && c.status === "asked") || (!mine && c.open && c.status !== "asked" && onDeskOf(c, me));
    };
    const items = [
      ...ctx.D.cases.filter((c) => visibleTo(ctx, c) && listedIdea(c)).map((c) => ideaItem(c, S.day, deskLabel(c, seed.seats, roles), ideaMove(c))),
      ...projects.filter(listedProject).map((p) => projectItem(p, S.day, ctx.actorUserId)),
    ];
    return (
      <div className={styles.hub} data-wide="true">
        <h1 className="nh-sr">{t("projects.pageTitle")}</h1>
        <section className={styles.hubProjects} aria-label={t("projects.ovTitle")}><OverviewList items={items} /></section>
      </div>
    );
  }
  return (
    <div className={styles.hub} data-wide="true">
      <h1 className="nh-sr">{t("projects.pageTitle")}</h1>
      <section className={styles.hubProjects} aria-label={t("projects.pageTitle")}>
        <div className={styles.hubHead}>
          <h2 className={styles.hubTitle}>{t("projects.pageTitle")}{projects.length > 0 && <span className={styles.count}>{projects.length}</span>}</h2>
        </div>
        {projects.length > 0 ? (
          <ProjectsList list={projects} userId={ctx.actorUserId} />
        ) : (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>{t("projects.hubEmptyTitle")}</div>
            <div className={styles.emptySub}>{t("projects.hubEmptySub")}</div>
          </div>
        )}
      </section>
    </div>
  );
}
