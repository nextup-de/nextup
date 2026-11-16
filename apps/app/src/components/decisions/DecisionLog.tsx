// The decision log (LOOP/D21): a read-only table of every yes and no the viewer may open. Plain props
// in, JSX out; the page fetches and the filters are a GET form, so nothing here edits anything. Quiet (DESIGN_RULES §9):
// the tab names the page, so its heading is for screen readers; the search is in view, the other filters fold behind
// "Filter"; with nothing to filter there is no filter row, only one sentence.
import Link from "next/link";
import { PersonFace, SectionCard } from "@/components/ui/elements";
import { DecisionFilters as Filters } from "./DecisionFilters";
import type { T } from "@/i18n";
import styles from "./DecisionLog.module.css";
import { ideaPath } from "@/features/ideas/page-path";

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
  /** `filtered`: the page's own flag; the log tells an empty list from a filtered one by `filters` itself. */
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

export function DecisionLog({ t, base, lines, total, page, pageSize, filters, projectsOn }: Props) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const role = (l: DecisionLine) => (l.roleFormer ? t("decisions.formerRole") : l.roleTitle ?? t("decisions.roleManager"));
  const kind = (k: string) => (k === "idea" ? t("decisions.kindIdea") : t("decisions.kindProblem"));
  const quote = (l: DecisionLine) => l.reason || l.note;
  // With nothing to filter there is no filter row: no decision at all is one sentence; none in the usual 90 days is one
  // sentence and the way to everything. A list the viewer filtered down to nothing keeps its filters.
  const plain = !filters.answer && !filters.project && !filters.q;
  const none = lines.length === 0 && plain && filters.period === "all";
  const noneRecent = lines.length === 0 && plain && filters.period === "90";

  return (
    <div className={styles.page}>
      <h1 className="nh-sr">{t("decisions.title")}</h1>
      <SectionCard name="decisions">
      {!none && !noneRecent && <Filters filters={filters} projectsOn={projectsOn} />}

      {none ? (
        <p className={styles.empty} data-testid="decisions-empty">{t("decisions.empty")}</p>
      ) : noneRecent ? (
        <p className={styles.empty} data-testid="decisions-empty">{t("decisions.emptyRecent")} <Link href={href(base, { ...filters, period: "all" }, 1)} className={styles.allLink}>{t("decisions.showEverything")}</Link></p>
      ) : lines.length === 0 ? (
        <p className={styles.empty} data-testid="decisions-empty">{t("decisions.noMatch")}</p>
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
                    <Link href={base + ideaPath(l.caseId)} className={styles.caseLink}>{l.title}</Link>
                    {/* An idea and a problem are told apart by their label (DESIGN_RULES §2); an idea is the usual, so only a problem says so. */}
                    {l.kind !== "idea" && <span className={styles.meta}>{kind(l.kind)}</span>}
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
