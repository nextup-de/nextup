// A list of bug reports with their replies - "My reports", and the same rows in /admin -> Tickets.
// Props in, JSX out.
"use client";

import { personLabel } from "@nextup/contracts";
import { PageHeader, SectionCard } from "@/components/ui/elements";
import { isTicketStatus, ticketLabel } from "@/features/tickets";
import { useFormat, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import type { TicketListRow } from "@/lib/db/tickets";
import styles from "./ReportsView.module.css";

const KIND: Record<string, MessageKey> = { bug: "report.kindBugShort", idea: "report.kindIdeaShort", question: "report.kindQuestionShort" };
const IMPACT: Record<string, MessageKey> = { blocks: "report.impactBlocksShort", annoying: "report.impactAnnoyingShort", cosmetic: "report.impactCosmeticShort" };
const STATUS: Record<"new" | "in_progress" | "fixed" | "closed", MessageKey> = {
  new: "report.statusNew",
  in_progress: "report.statusInProgress",
  fixed: "report.statusFixed",
  closed: "report.statusClosed",
};

type Props = {
  tickets: TicketListRow[];
  /** "/api/acme/tickets" - the screenshot is at `${base}/${id}/screenshot`. Null = don't show them. */
  screenshotBase: string | null;
  offline: boolean;
  /** /admin shows who filed it (name and role) and whether it reached admin.sellux.ch. */
  admin?: boolean;
};

export function ReportsView({ tickets, screenshotBase, offline, admin = false }: Props) {
  const t = useT();
  const format = useFormat();
  const when = (d: Date) => format.date(d, "dateTime");
  return (
    <section className={styles.wrap}>
      {!admin && <PageHeader title={t("report.listTitle")} lede={t("report.listSub")} />}

      <SectionCard>
      {offline ? (
        <p className={styles.empty}>{t("report.offline")}</p>
      ) : tickets.length === 0 ? (
        <p className={styles.empty}>
          {admin ? t("report.emptyAdmin") : t("report.empty")}
        </p>
      ) : (
        <ol className={styles.list}>
          {tickets.map((tk) => {
            const status = isTicketStatus(tk.status) ? tk.status : "new";
            return (
              <li key={tk.id} className={styles.item}>
                <div className={styles.row}>
                  <span className={styles.label}>{ticketLabel(tk.number)}</span>
                  <span className={styles.kind}>{KIND[tk.kind] ? t(KIND[tk.kind]) : tk.kind}{tk.kind === "bug" ? ` · ${IMPACT[tk.impact] ? t(IMPACT[tk.impact]) : tk.impact}` : ""}</span>
                  <span className={styles.status} data-status={status}>{t(STATUS[status])}</span>
                </div>
                <p className={styles.text}>{tk.description}</p>
                {tk.expected && <p className={styles.expected}><strong>{t("report.expected")}</strong> {tk.expected}</p>}
                <div className={styles.meta}>
                  {when(tk.createdAt)}
                  {" · "}
                  {t("report.createdBy", { who: tk.openedBy ? personLabel(tk.openedBy) : admin ? `${tk.reporterName ?? t("report.anAdmin")} (${tk.reporterRole})` : t("report.you") })}
                  {" · "}
                  <span className={styles.assignee} data-assigned={tk.assignee ? "yes" : "no"}>
                    {tk.assignee ? t("report.assignedTo", { who: personLabel(tk.assignee) }) : t("report.notAssigned")}
                  </span>
                  {admin ? ` · ${tk.forwarded ? t("report.atAdmin") : t("report.notForwarded")}` : ""}
                </div>
                {tk.hasScreenshot && screenshotBase ? (
                  <a href={`${screenshotBase}/${tk.id}/screenshot`} target="_blank" rel="noreferrer" className={styles.shotLink}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- served by our own route, behind the session */}
                    <img src={`${screenshotBase}/${tk.id}/screenshot`} alt={t("report.shotSentWith", { label: ticketLabel(tk.number) })} className={styles.shot} loading="lazy" />
                  </a>
                ) : null}
                {tk.replies.length > 0 && (
                  <ol className={styles.replies}>
                    {tk.replies.map((r) => (
                      <li key={r.id} className={styles.reply}>
                        <div className={styles.replyHead}>{t("report.replyFrom")} · {when(r.createdAt)}</div>
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
      </SectionCard>
    </section>
  );
}
