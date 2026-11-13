"use client";
// The Projects tab: every project this person may see, grouped by where it stands - Planning, Running,
// Measuring, Measured and recognised, Stopped (docs/plans/2026-10-15_idea-to-project.md §3).
// Members see the projects of their own ideas and the ones they are on; leaders and managers all.
// The page around it (title, tabs) is ProjectsHub.
// Inside a group the reader's own come first, then late ones (groupProjects); a long group shows its top few.
import { ShowAll, useCapped } from "@/components/ui/elements";
import { groupProjects, type ProjectGroup } from "@/features/projects/views";
import type { ReducedProject } from "@/features/projects/types";
import { useLocale, useT } from "@/i18n/client";
import { ProjectCard } from "./parts";
import styles from "./Projects.module.css";

export function ProjectsList({ list, userId = null }: { list: ReducedProject[]; userId?: string | null }) {
  const locale = useLocale();
  const groups = groupProjects(list, locale, userId).filter((g) => g.projects.length > 0);
  return <>{groups.map((g) => <Group key={g.key} g={g} />)}</>;
}

function Group({ g }: { g: ProjectGroup }) {
  const t = useT();
  const cards = useCapped(g.projects);
  return (
    <section className={styles.group} aria-label={g.label}>
      <h2 className={styles.groupHead}>{g.label}<span className={styles.count}>{g.projects.length}</span></h2>
      <div className={styles.cards}>
        {cards.shown.map((p) => <ProjectCard key={p.id} p={p} />)}
      </div>
      <ShowAll list={cards} showAll={(count) => t("common.showAll", { count })} showLess={t("common.showLess")} />
    </section>
  );
}
