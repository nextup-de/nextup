// The decision log (LOOP/D21): a read-only table of every yes and no the viewer may open. Plain props
// in, JSX out; the page fetches and the filters are a GET form, so nothing here edits anything.
import Link from "next/link";
import { PageHeader, PersonFace, SectionCard } from "@/components/ui/elements";
import type { T } from "@/i18n";
import styles from "./DecisionLog.module.css";

export type DecisionLine = {
  caseId: string; title: string; kind: string; dateLabel: string; answer: "yes" | "no"; reason: string; note: string;
  /** The deciding role's title; null when the desk is unknown ("Manager"). */
  roleTitle: string | null; roleFormer: boolean; personName: string | null;
  project: { id: string; label: string } | null;
};

export type DecisionFilters = { period: "30" | "90" | "year" | "all"; answer: "" | "yes" | "no"; project: "" | "with" | "without"; q: string };

type Props = {
  /** The company's paths as links see them (companyPrefix): "/acme" in path mode, "" on a one-company stack. */
  t: T; base: string; lines: DecisionLine[]; total: number; page: number; pageSize: number;
  filters: DecisionFilters; projectsOn: boolean; filtered: boolean;
};

function href(base: string, f: DecisionFilters, page: number): string {
  const p = new URLSearchParams();
  if (f.period !== "90") p.set("period", f.period);
  if (f.answer) p.set("answer", f.answer);
  if (f.project) p.set("project", f.project);
  if (f.q) p.set("q", f.q);
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  return `${base}/decisions${qs ? `?${qs}` : ""}`;
}

export function DecisionLog({ t, base, lines, total, page, pageSize, filters, projectsOn, filtered }: Props) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const role = (l: DecisionLine) => (l.roleFormer ? t("decisions.formerRole") : l.roleTitle ?? t("decisions.roleManager"));
  const kind = (k: string) => (k === "idea" ? t("decisions.kindIdea") : t("decisions.kindProblem"));
  const quote = (l: DecisionLine) => l.reason || l.note;

  return (
    <div className={styles.page}>
      {/* With projects on this is a tab of Projects: the tab names the page. */}
      {projectsOn
        ? <h2 className={styles.sectionHead}>{t("decisions.sectionTitle")}{total > 0 && <span className={styles.sectionCount}>{total}</span>}</h2>
        : <PageHeader title={t("decisions.title")} lede={t("decisions.lead")} />}
      <SectionCard name="decisions">

      <form method="get" className={styles.filters} role="search">
        <input type="search" name="q" defaultValue={filters.q} placeholder={t("decisions.search")} aria-label={t("decisions.search")} className={styles.search} data-testid="decisions-filter-q" />
        <select name="period" defaultValue={filters.period} aria-label={t("decisions.period")} data-testid="decisions-filter-period">
          <option value="30">{t("decisions.period30")}</option>
          <option value="90">{t("decisions.period90")}</option>
          <option value="year">{t("decisions.periodYear")}</option>
          <option value="all">{t("decisions.periodAll")}</option>
        </select>
        <select name="answer" defaultValue={filters.answer} aria-label={t("decisions.answer")} data-testid="decisions-filter-answer">
          <option value="">{t("decisions.answerAll")}</option>
          <option value="yes">{t("decisions.answerYes")}</option>
          <option value="no">{t("decisions.answerNo")}</option>
        </select>
        {projectsOn && (
          <select name="project" defaultValue={filters.project} aria-label={t("decisions.project")} data-testid="decisions-filter-project">
            <option value="">{t("decisions.projectAll")}</option>
            <option value="with">{t("decisions.projectWith")}</option>
            <option value="without">{t("decisions.projectWithout")}</option>
          </select>
        )}
        <button type="submit" className={styles.apply}>{t("decisions.apply")}</button>
      </form>

      {lines.length === 0 ? (
        <p className={styles.empty} data-testid="decisions-empty">{filtered ? t("decisions.noMatch") : t("decisions.empty")}</p>
      ) : (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("decisions.colDate")}</th>
                <th>{t("decisions.colCase")}</th>
                <th>{t("decisions.colDecision")}</th>
                <th>{t("decisions.colDecidedBy")}</th>
                {projectsOn && <th>{t("decisions.colProject")}</th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={`${l.caseId}-${i}`} data-testid="decisions-row">
                  <td data-label={t("decisions.colDate")} className={styles.date}>{l.dateLabel}</td>
                  <td data-label={t("decisions.colCase")}>
                    <Link href={`${base}/cases/${l.caseId}`} className={styles.caseLink}>{l.title}</Link>
                    <span className={styles.meta}>{l.caseId} · {kind(l.kind)}</span>
                  </td>
                  <td data-label={t("decisions.colDecision")}>
                    <span className={l.answer === "yes" ? styles.pillYes : styles.pillNo}>{l.answer === "yes" ? t("decisions.answerYes") : t("decisions.answerNo")}</span>
                    {quote(l) && <span className={styles.quote} title={quote(l)}>“{quote(l)}”</span>}
                  </td>
                  <td data-label={t("decisions.colDecidedBy")}>
                    {role(l)}
                    {l.personName && <span className={styles.person}><PersonFace name={l.personName} size="sm" /><span className={styles.meta}>{l.personName}</span></span>}
                  </td>
                  {projectsOn && (
                    <td data-label={t("decisions.colProject")}>
                      {l.project ? <Link href={`${base}/projects/${l.project.id}`} className={styles.caseLink}>{l.project.label}</Link> : t("decisions.noProject")}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <nav className={styles.paging} aria-label={t("decisions.title")}>
            <span>{t("decisions.pageRange", { from, to, n: total })}</span>
            {page > 1 ? <Link href={href(base, filters, page - 1)} aria-label={t("decisions.prev")} rel="prev">‹</Link> : <span aria-hidden="true">‹</span>}
            {to < total ? <Link href={href(base, filters, page + 1)} aria-label={t("decisions.next")} rel="next">›</Link> : <span aria-hidden="true">›</span>}
          </nav>
        </>
      )}
      </SectionCard>
    </div>
  );
}
