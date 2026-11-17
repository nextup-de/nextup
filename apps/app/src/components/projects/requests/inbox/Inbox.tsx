"use client";
// The Requests tool: what people answered on the project's forms, turned into steps or reasoned noes (plan REQ, D4, D6).
import { useEffect, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { formSummaries, REQUEST_FILTERS, requestCounts, requestList, undoOf, type RequestFilter } from "@/features/projects/requests-view";
import type { ProjectPage, ReducedProject, ToolInstance } from "@/features/projects/types";
import { HeadSlot } from "../../tools/HeadSlot";
import { useT } from "@/i18n/client";
import { useRights, useSend } from "../../parts";
import { FormsPanel } from "./FormsPanel";
import { RequestCard } from "./RequestCard";
import { useText } from "./useText";
import styles from "./Inbox.module.css";

const FILTER_LABEL: Record<RequestFilter, "projectRequests.requestStateNew" | "projectRequests.requestStateStepped" | "projectRequests.requestStateDeclined"> = {
  new: "projectRequests.requestStateNew", stepped: "projectRequests.requestStateStepped", declined: "projectRequests.requestStateDeclined",
};

export function Inbox({ p, page, tool }: { p: ReducedProject; page: ProjectPage; tool: ToolInstance }) {
  const { act } = useDemo();
  const t = useT();
  const { text, empty } = useText();
  const rights = useRights(p);
  const send = useSend(p);
  const [filter, setFilter] = useState<RequestFilter>("new");
  // The toast after an outcome: Undo shows only while a reopen would be accepted (D6).
  const [toast, setToast] = useState<{ message: string; requestId: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);
  const counts = requestCounts(p);
  const rows = requestList(p, filter);
  const asked = toast ? p.requests.find((r) => r.id === toast.requestId) : undefined;
  const canUndo = asked !== undefined && undoOf(p, asked) === "reopen";
  const reopen = (requestId: string) => {
    if (send("project.request.reopened", { requestId }, () => act.project.request.reopen(p.id, requestId))) setToast({ message: text("reopenedToast"), requestId });
  };

  return (
    <section className={styles.page} aria-labelledby={"requests-" + p.id}>
      <div className={styles.head}>
        <div>
          <h2 id={"requests-" + p.id} className="nh-sr">{t("projectRequests.requestsTitle")}</h2>
        </div>
      </div>
      <HeadSlot page={page} tool={tool}><div className={styles.chips} role="group" aria-label={text("filterLabel")}>
        {REQUEST_FILTERS.map((f) => (
          <button key={f} type="button" className={styles.chip} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(FILTER_LABEL[f])}{counts[f] > 0 ? <span className={styles.count}>{counts[f]}</span> : null}
          </button>
        ))}
      </div></HeadSlot>
      <div className={styles.body}>
        <ul className={styles.list}>
          {rows.length === 0 && <li><p className={styles.empty}>{empty(filter)}</p></li>}
          {rows.map((row) => (
            <RequestCard key={row.request.id} p={p} row={row} mayAct={rights.addStep}
              onOutcome={(message) => setToast({ message, requestId: row.request.id })} onReopen={() => reopen(row.request.id)} />
          ))}
        </ul>
        <FormsPanel p={p} forms={formSummaries(p)} />
      </div>
      {toast && (
        <div className={styles.toast} role="status">
          <span>{toast.message}</span>
          {canUndo && <button type="button" onClick={() => { setToast(null); reopen(toast.requestId); }}>{text("undo")}</button>}
        </div>
      )}
    </section>
  );
}
