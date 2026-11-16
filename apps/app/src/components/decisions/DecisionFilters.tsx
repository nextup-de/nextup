"use client";
// The decision log's filters (DESIGN_RULES §9, folded by default): the search field in view, period, answer and project behind
// "Filter". The form is still a GET form, so the address says what is filtered; a pick applies at once, the search on Enter.
import { Fold } from "@/components/ui/elements";
import { useT } from "@/i18n/client";
import type { DecisionFilters as Filters } from "./DecisionLog";
import styles from "./DecisionLog.module.css";

export function DecisionFilters({ filters, projectsOn }: { filters: Filters; projectsOn: boolean }) {
  const t = useT();
  const apply = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit();
  // How many filters beyond the usual 90 days are on: shown beside "Filter" so a narrowed list says so while folded.
  const on = (filters.period !== "90" ? 1 : 0) + (filters.answer ? 1 : 0) + (filters.project ? 1 : 0);
  return (
    <form method="get" className={styles.filters} role="search">
      <input type="search" name="q" defaultValue={filters.q} placeholder={t("decisions.search")} aria-label={t("decisions.search")} className={styles.search} data-testid="decisions-filter-q" />
      <Fold summary={t("decisions.filter")} meta={on > 0 ? on : undefined} name="decisions-filter">
        <div className={styles.selects}>
          <select name="period" defaultValue={filters.period} aria-label={t("decisions.period")} data-testid="decisions-filter-period" onChange={apply}>
            <option value="30">{t("decisions.period30")}</option>
            <option value="90">{t("decisions.period90")}</option>
            <option value="year">{t("decisions.periodYear")}</option>
            <option value="all">{t("decisions.periodAll")}</option>
          </select>
          <select name="answer" defaultValue={filters.answer} aria-label={t("decisions.answer")} data-testid="decisions-filter-answer" onChange={apply}>
            <option value="">{t("decisions.answerAll")}</option>
            <option value="yes">{t("decisions.answerYes")}</option>
            <option value="no">{t("decisions.answerNo")}</option>
          </select>
          {projectsOn && (
            <select name="project" defaultValue={filters.project} aria-label={t("decisions.project")} data-testid="decisions-filter-project" onChange={apply}>
              <option value="">{t("decisions.projectAll")}</option>
              <option value="with">{t("decisions.projectWith")}</option>
              <option value="without">{t("decisions.projectWithout")}</option>
            </select>
          )}
        </div>
      </Fold>
    </form>
  );
}
