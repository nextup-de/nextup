"use client";
// Every raise and whether its owner was emailed, with the one repair this page can offer: send it again.
//
// Client, unlike the summary next door, only because the retry button needs useActionState. The
// list itself is still props in, JSX out - the states were decided in features/integrations/tasks.
import { useActionState } from "react";
import { countByState, describeTasks, type AutomationTask, type AutomationTaskView } from "@/features/integrations/tasks";
import { retryNoticeAction, type RetryState } from "@/server/actions/admin";
import styles from "@/app/admin/admin.module.css";

const LABEL: Record<AutomationTask["state"], string> = {
  done: "notified",
  skipped: "no owner",
  pending: "sending",
  failed: "not sent",
};

export function AutomationTasks({ tasks }: { tasks: AutomationTaskView[] }) {
  const [retry, resend, sending] = useActionState<RetryState, FormData>(retryNoticeAction, {});
  const counts = countByState(tasks);

  return (
    <div className={styles.grid}>
      <p className="nh-hint">{describeTasks(counts)}</p>

      {retry.error ? (
        <p className={styles.error} role="alert">
          Could not re-send: {retry.error}
        </p>
      ) : null}
      {retry.ok ? (
        <p className={styles.sent} role="status">
          Sent. The owner has the email and the case says so.
        </p>
      ) : null}

      {tasks.length === 0 ? null : (
        <div className={styles.rows}>
          {tasks.map((t) => (
            <div key={t.eventId} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowName}>{t.title}</span>
                <span className={styles.rowMeta}>
                  {t.companyName} · raised {t.raisedLabel}
                  {t.ownerName ? ` · ${t.ownerName}` : null}
                  {/* The address the problem was actually mailed to - the one fact that says
                      whether "notified" reached a person or a typo in the seed. */}
                  {t.ownerEmail ? (
                    <>
                      {" · "}
                      <a href={`mailto:${t.ownerEmail}`}>{t.ownerEmail}</a>
                    </>
                  ) : null}
                </span>
                <span className={styles.rowMeta}>{t.explain}</span>
              </div>
              <div className={styles.rowActions}>
                <span className={styles.pill} data-state={t.state}>
                  {LABEL[t.state]}
                </span>
                {t.retryable ? (
                  <form action={resend}>
                    <input type="hidden" name="eventId" value={t.eventId} />
                    <input type="hidden" name="slug" value={t.slug} />
                    <button className="nh-btn nh-btn-ghost nh-btn-sm" type="submit" disabled={sending}>
                      {sending ? "Sending…" : "Send again"}
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
