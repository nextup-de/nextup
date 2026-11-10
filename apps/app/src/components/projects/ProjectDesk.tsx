"use client";
// The projects waiting on the person looking: their next move as a lead, a late start or measure that
// moved to them as the deputy, a typed result they can confirm as the second person, and - for a manager -
// a reward that is due (features/projects/views projectDesk). Self-contained: it reads everything from useDemo(), so the inbox only mounts it.
// Renders nothing while projects are off for the company or nothing waits.
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { projectLabel } from "@/features/projects/selectors";
import { moveLabel, projectDeskFor, visibleProjectsFor } from "@/features/projects/views";
import { useLocale, useT } from "@/i18n/client";
import { DueBadge, idViewerOf } from "./parts";
import styles from "./Projects.module.css";

export function ProjectDesk() {
  const ctx = useDemo();
  const t = useT();
  const locale = useLocale();
  const { S, f, ready, demo, serverMode, flag, href } = ctx;
  if (!ready || !flag("projects")) return null;
  const v = idViewerOf(ctx);
  // A result is confirmed on the server only (ProjectMeasure), so the demo desk has no such row.
  const items = projectDeskFor(visibleProjectsFor(S, v, demo), S.day, v, serverMode ? S : undefined);
  if (!items.length) return null;

  return (
    <section className={styles.desk} aria-labelledby="project-desk">
      <div className={styles.panelHead}>
        <h2 id="project-desk" className={styles.h2}>{t("projects.deskTitle")}</h2>
        <Link href={href("/projects")} className={styles.link}>{t("projects.allProjects")}</Link>
      </div>
      <ul className={styles.deskList}>
        {items.map(({ project: p, move, why, dueDay }) => (
          <li key={p.id + ":" + move}>
            <Link href={href("/projects/" + p.id)} className={styles.deskRow}>
              <span className={styles.label}>{projectLabel(p)}</span>
              <span className={styles.deskText}>
                <span className={styles.strong}>{p.title}</span>
                <span className={styles.muted}>
                  {moveLabel(move, locale)}
                  {why === "escalated" ? " · " + t("projects.deskMovedToYou", { name: p.lead }) : why === "reward" ? " · " + t("projects.deskByRule")
                    : why === "confirm" ? " · " + t("projects.deskSecondPerson") : why === "confirmUp" ? " · " + t("projects.deskConfirmLate") : ""}
                </span>
              </span>
              {dueDay === undefined ? <DueBadge p={p} /> : (
                <span className={styles.due} data-late={S.day > dueDay ? "true" : undefined}>
                  {S.day > dueDay ? t("projects.dueLate", { count: S.day - dueDay }) : t("projects.dueOn", { day: f(dueDay) })}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
