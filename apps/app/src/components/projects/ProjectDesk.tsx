"use client";
// The projects waiting on the person looking: their next move as a lead, a late start or measure that
// moved to them as the deputy, and - for a manager - a reward that is due (features/projects/views
// projectDesk). Self-contained: it reads everything from useDemo(), so the inbox only mounts it.
// Renders nothing while projects are off for the company or nothing waits.
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { projectLabel } from "@/features/projects/selectors";
import { moveLabel, projectDesk, visibleProjects } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { DueBadge, viewerOf } from "./parts";
import styles from "./Projects.module.css";

export function ProjectDesk() {
  const ctx = useDemo();
  const t = useT();
  const locale = useLocale();
  const { S, ready, demo, flag, href } = ctx;
  if (!ready || !flag("projects")) return null;
  const v = viewerOf(ctx);
  const items = projectDesk(visibleProjects(S, v, demo), S.day, v);
  if (!items.length) return null;

  return (
    <section className={styles.desk} aria-labelledby="project-desk">
      <div className={styles.panelHead}>
        <h2 id="project-desk" className={styles.h2}>{t("projects.deskTitle")}</h2>
        <Link href={href("/projects")} className={styles.link}>{t("projects.allProjects")}</Link>
      </div>
      <ul className={styles.deskList}>
        {items.map(({ project: p, move, why }) => (
          <li key={p.id}>
            <Link href={href("/projects/" + p.id)} className={styles.deskRow}>
              <span className={styles.label}>{projectLabel(p)}</span>
              <span className={styles.deskText}>
                <span className={styles.strong}>{p.title}</span>
                <span className={styles.muted}>
                  {moveLabel(move, locale)}
                  {why === "escalated" ? " · " + t("projects.deskMovedToYou", { name: p.lead }) : why === "reward" ? " · " + t("projects.deskByRule") : ""}
                </span>
              </span>
              <DueBadge p={p} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
