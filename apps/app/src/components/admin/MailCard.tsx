// Whether the app can send mail itself - used by "Send reply" on a pilot request. Read-only.
import type { MailStatus } from "@/server/mail";
import styles from "@/app/admin/admin.module.css";

export function MailCard({ status }: { status: MailStatus }) {
  const state = !status.configured ? "off" : status.reachable ? "live" : "unreachable";
  const headline = !status.configured
    ? "Not configured - replies go through your own mail app"
    : status.reachable
      ? "The mail server answers"
      : "The mail server is not answering";

  return (
    <div className={styles.grid}>
      <p className={styles.verdict} data-state={state}>
        <span className={styles.dot} aria-hidden="true" />
        {headline}
      </p>
      {!status.configured ? (
        <p className="nh-hint">
          Set <code>SMTP_URL</code> to send replies from /admin. Locally that is mailpit, which catches
          everything: <code>smtp://127.0.0.1:1025</code> (the compose stack uses <code>smtp://mailpit:1025</code>).
        </p>
      ) : null}
      {status.error ? <p className={styles.warn}>{status.error}</p> : null}
      <dl className={styles.facts}>
        <dt>Relay</dt>
        <dd>{status.target ? <code>{status.target}</code> : "none"}</dd>
        <dt>Sends as</dt>
        <dd><code>{status.from}</code></dd>
      </dl>
    </div>
  );
}
