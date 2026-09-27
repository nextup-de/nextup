// Whether route owners are actually being told about new cases. Read-only: the relay is configured
// in the environment and a missed notice is re-sent from the task list below, so this renders and
// nothing more - no "use client", no form.
import { describeCompany, type AutomationReport } from "@/features/integrations/automation";
import styles from "@/app/admin/admin.module.css";

// Server-rendered, so this formats in the container's zone unless told otherwise - which would
// print 09:39 here next to the task list's 11:33 for the same moment. One zone for the page.
function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: process.env.TZ || "Europe/Zurich",
  });
}

export function Automation({ report }: { report: AutomationReport }) {
  const { facts, companies, summary } = report;

  return (
    <div className={styles.grid}>
      <p className={styles.verdict} data-state={summary.state}>
        <span className={styles.dot} aria-hidden="true" />
        {summary.headline}
      </p>
      {summary.next ? <p className="nh-hint">{summary.next}</p> : null}

      <dl className={styles.facts}>
        <dt>Sent through</dt>
        <dd>
          {facts.configured ? (
            <>
              <code>{facts.target ?? "?"}</code>
              {facts.reachable ? "" : " (not answering)"}
            </>
          ) : (
            "nothing - SMTP_URL is not set"
          )}
        </dd>
      </dl>

      {companies.length === 0 ? null : (
        <div className={styles.rows}>
          {companies.map((c) => (
            <div key={c.slug} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowName}>{c.name}</span>
                <span className={styles.rowMeta}>
                  {describeCompany(c)}
                  {c.lastNoticeAt ? ` · last ${when(c.lastNoticeAt)}` : null}
                </span>
              </div>
              <span className={styles.stage}>{c.notices > 0 ? "working" : "waiting"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
