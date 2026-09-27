// What Postgres is doing. Server-rendered and read-only: nothing here is a button, because every
// answer comes from the database itself.
import { countRows, type DatabaseReport } from "@/features/admin/health";
import { DatabaseRetry } from "./DatabaseRetry";
import styles from "@/app/admin/admin.module.css";

export function DatabaseCard({ report }: { report: DatabaseReport }) {
  const { facts } = report;

  return (
    <div className={styles.grid}>
      <p className={styles.verdict} data-state={report.state === "up" ? "live" : "off"}>
        <span className={styles.dot} aria-hidden="true" />
        {report.headline}
      </p>
      {report.next ? <p className="nh-hint">{report.next}</p> : null}
      {report.state === "down" ? <DatabaseRetry /> : null}

      {report.warnings.map((w) => (
        <p key={w} className={styles.warn}>
          {w}
        </p>
      ))}

      {facts ? (
        <>
          <div className={styles.counts}>
            {countRows(facts.counts).map((c) => (
              <div key={c.label} className={styles.count}>
                <span className={styles.countValue}>{c.value.toLocaleString("en-GB")}</span>
                <span className={styles.countLabel}>{c.label}</span>
              </div>
            ))}
          </div>

          <dl className={styles.facts}>
            <dt>Server</dt>
            <dd>
              <code>{facts.server}</code> · database <code>{facts.database}</code>
            </dd>
            <dt>Schema</dt>
            <dd>
              {facts.migrations === null
                ? "no migration history"
                : `${facts.migrations.applied} migration${facts.migrations.applied === 1 ? "" : "s"} applied` +
                  (facts.migrations.latest ? `, latest ${facts.migrations.latest}` : "")}
            </dd>
          </dl>
        </>
      ) : null}
    </div>
  );
}
