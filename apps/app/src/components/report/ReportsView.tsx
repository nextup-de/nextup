// A list of bug reports with their replies - "My reports", and the same rows in /admin -> Tickets.
// Props in, JSX out.
import { personLabel } from "@nextup/contracts";
import { STATUS_LABEL, isTicketStatus, ticketLabel } from "@/features/tickets";
import type { TicketListRow } from "@/lib/db/tickets";
import styles from "./ReportsView.module.css";

const KIND: Record<string, string> = { bug: "Bug", idea: "Idea", question: "Question" };
const IMPACT: Record<string, string> = { blocks: "blocks work", annoying: "annoying", cosmetic: "cosmetic" };

const when = (d: Date) =>
  d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

type Props = {
  tickets: TicketListRow[];
  /** "/api/acme/tickets" - the screenshot is at `${base}/${id}/screenshot`. Null = don't show them. */
  screenshotBase: string | null;
  offline: boolean;
  /** /admin shows who filed it (name and role) and whether it reached admin.sellux.ch. */
  admin?: boolean;
};

export function ReportsView({ tickets, screenshotBase, offline, admin = false }: Props) {
  return (
    <section className={styles.wrap}>
      {!admin && (
        <header className={styles.head}>
          <h1 className={styles.title}>My reports</h1>
          <p className={styles.sub}>
            What you sent with the bug icon, bottom left, and what the NextUp team answered. You also get a mail for every reply.
          </p>
        </header>
      )}

      {offline ? (
        <p className={styles.empty}>Reports need the database, and this is the offline demo.</p>
      ) : tickets.length === 0 ? (
        <p className={styles.empty}>
          {admin ? "No reports yet." : "Nothing yet. When something breaks or you have an idea, press the bug icon at the bottom left."}
        </p>
      ) : (
        <ol className={styles.list}>
          {tickets.map((t) => {
            const status = isTicketStatus(t.status) ? t.status : "new";
            return (
              <li key={t.id} className={styles.item}>
                <div className={styles.row}>
                  <span className={styles.label}>{ticketLabel(t.number)}</span>
                  <span className={styles.kind}>{KIND[t.kind] ?? t.kind}{t.kind === "bug" ? ` · ${IMPACT[t.impact] ?? t.impact}` : ""}</span>
                  <span className={styles.status} data-status={status}>{STATUS_LABEL[status]}</span>
                </div>
                <p className={styles.text}>{t.description}</p>
                {t.expected && <p className={styles.expected}><strong>Expected:</strong> {t.expected}</p>}
                <div className={styles.meta}>
                  {when(t.createdAt)}
                  {" · Created by "}
                  {t.openedBy ? personLabel(t.openedBy) : admin ? `${t.reporterName ?? "an admin"} (${t.reporterRole})` : "you"}
                  {" · "}
                  <span className={styles.assignee} data-assigned={t.assignee ? "yes" : "no"}>
                    {t.assignee ? `Assigned to ${personLabel(t.assignee)}` : "Not assigned yet"}
                  </span>
                  {admin ? (t.forwarded ? " · at admin.sellux.ch" : " · not forwarded yet") : ""}
                </div>
                {t.hasScreenshot && screenshotBase ? (
                  <a href={`${screenshotBase}/${t.id}/screenshot`} target="_blank" rel="noreferrer" className={styles.shotLink}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- served by our own route, behind the session */}
                    <img src={`${screenshotBase}/${t.id}/screenshot`} alt={`Screenshot sent with ${ticketLabel(t.number)}`} className={styles.shot} loading="lazy" />
                  </a>
                ) : null}
                {t.replies.length > 0 && (
                  <ol className={styles.replies}>
                    {t.replies.map((r) => (
                      <li key={r.id} className={styles.reply}>
                        <div className={styles.replyHead}>NextUp team · {when(r.createdAt)}</div>
                        <p className={styles.replyText}>{r.body}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
