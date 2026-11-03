"use client";
// The Routing panel of a case page: what was proposed, where it was sent, where it was moved (LOOP/D15).
import { useT } from "@/i18n/client";
import { routingTrail } from "@/features/cases/routing-trail";
import { routingText } from "@/features/cases/promise-text";
import type { ReducedCase } from "@/features/cases/reducer";
import { useCaseNames } from "./useCaseNames";
import styles from "./Panel.module.css";

export function CaseRouting({ c }: { c: ReducedCase }) {
  const t = useT();
  const n = useCaseNames();
  const lines = routingText(routingTrail(c), { roleOfRoute: n.roleOfRoute, date: n.date }, t);
  return (
    <section className={`${styles.panel}`} data-testid="case-routing" aria-label={t("loopCase.routingTitle")}>
      <div className={styles.title}>{t("loopCase.routingTitle")}</div>
      <ul className={styles.list}>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </section>
  );
}
