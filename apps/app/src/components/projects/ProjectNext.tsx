"use client";
// The Overview's "What happens next": the few open steps that matter now (nextSteps: blocked first),
// each with its column, what holds it or how long it has waited, its owner and its due day. The board
// itself is one tab away.
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { PersonFace } from "@/components/ui/elements";
import { nextSteps, tabQuery } from "@/features/projects/tabs";
import type { ReducedProject } from "@/features/projects/types";
import { columnLabel } from "@/features/projects/views";
import { useFormat, useLocale, useT } from "@/i18n/client";
import styles from "./Projects.module.css";

export function NextPanel({ p }: { p: ReducedProject }) {
  const { S, href, f } = useDemo();
  const t = useT();
  const locale = useLocale();
  const fmt = useFormat();
  const rows = nextSteps(p.steps);

  return (
    <section className={styles.panel} aria-label={t("projects.nextTitle")}>
      <div className={styles.panelHead}>
        <h2 className={styles.h2}>{t("projects.nextTitle")}</h2>
        <Link href={href("/projects/" + p.id) + tabQuery("board")} className={styles.link} scroll={false}>{t("projects.nextOpenBoard")}</Link>
      </div>
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
                  <span className={styles.nextMeta}>
                    {s.column === "blocked" && s.why ? s.why : t("projects.nextWaiting", { days: fmt.days(S.day - s.movedDay), column: columnLabel(s.column, locale) })}
                  </span>
                </span>
                <span className={styles.nextOwner}>
                  {s.owner ? <><PersonFace name={s.owner} size="sm" /><span>{s.owner}</span></> : <span className={styles.muted}>{t("projects.noOwnerYet")}</span>}
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
