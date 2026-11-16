"use client";
// The Overview's "What happens next": the few open steps that matter now (nextSteps: blocked first),
// each with its column, what holds it or how long it has waited, its owner and its due day. The board
// itself is one tab away. A step unmoved for two weeks or more (isStuck) shows its wait in the late colour.
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PersonFace } from "@/components/ui/elements";
import { isStuck } from "@/features/projects/overview-view";
import { nextSteps, tabQuery } from "@/features/projects/tabs";
import type { ReducedProject } from "@/features/projects/types";
import { columnLabel } from "@/features/projects/views";
import { useFormat, useLocale, useT } from "@/i18n/client";
import styles from "./Projects.module.css";

/** `bare`: inside the Overview's Steps line, which has its own title and its one "Open the board" link. */
export function NextPanel({ p, bare = false }: { p: ReducedProject; bare?: boolean }) {
  const { S, href, f } = useDemo();
  const t = useT();
  const locale = useLocale();
  const fmt = useFormat();
  const rows = nextSteps(p.steps);
  // With steps that are all done there is nothing next, and "add the first one" would be wrong: the panel stays away.
  if (!rows.length && p.steps.some((s) => !s.dropped)) return null;
  if (bare && !rows.length) return null;

  return (
    <section className={styles.panel} aria-label={t("projects.nextTitle")}>
      {bare ? <h3 className={styles.h3}>{t("projects.nextTitle")}</h3> : <div className={styles.panelHead}>
        <h2 className={styles.h2}>{t("projects.nextTitle")}</h2>
        <Link href={href("/projects/" + p.id) + tabQuery("board")} className={styles.link} scroll={false}>{t("projects.nextOpenBoard")}</Link>
      </div>}
      {!rows.length ? <p className={styles.hint}>{t("projects.nextEmpty")}</p> : (
        <ul className={styles.nextList}>
          {rows.map((s) => {
            const late = s.dueDay !== null && S.day > s.dueDay;
            return (
              <li key={s.id} className={styles.nextRow}>
                <span className={styles.nextState} data-col={s.column}>{columnLabel(s.column, locale)}</span>
                <span className={styles.nextText}>
                  <span className={styles.nextTitle}>
                    {s.external && <span className={styles.code}>{s.external.key}</span>}
                    {s.text}
                  </span>
                  <span className={styles.nextMeta} data-stuck={isStuck(s, S.day) ? "true" : undefined}>
                    {/* No "0 days in To do": a wait shows once it is a day (DESIGN_RULES §2). */}
                    {s.column === "blocked" && s.why ? s.why : S.day > s.movedDay ? t("projects.nextWaiting", { days: fmt.days(S.day - s.movedDay), column: columnLabel(s.column, locale) }) : ""}
                  </span>
                </span>
                <span className={styles.nextOwner}>
                  {s.owner ? <><PersonFace name={s.owner} size="sm" /><span>{s.owner}</span></> : <span className={styles.muted}>{t("projectMove.noOwner")}</span>}
                </span>
                <span className={styles.nextDue} data-late={late ? "true" : undefined}>
                  {s.dueDay === null ? "" : late ? t("projects.lateShort") + " · " + f(s.dueDay) : f(s.dueDay)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
