// Pilot requests as a list of links. Each row opens the request's panel (?id=), keeping the
// filter and search it was picked from. No state and no hooks - the selection lives in the URL.
import type { PilotRequestRow } from "@/features/admin/rows";
import { isOverdue, type RequestView } from "@/features/admin/requests";
import styles from "@/app/admin/admin.module.css";

export function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Zurich",
  });
}

export function requestHref(base: string, id: string | null, view: RequestView, q = ""): string {
  const params = new URLSearchParams();
  if (view !== "open") params.set("view", view);
  if (q) params.set("q", q);
  if (id) params.set("id", id);
  const qs = params.toString();
  return `${base}/requests${qs ? `?${qs}` : ""}`;
}

export function RequestStatus({ r }: { r: PilotRequestRow }) {
  if (r.handledAt) return <span className={styles.pill} data-state="done">Replied</span>;
  if (isOverdue(r)) return <span className={styles.pill} data-state="failed">Overdue</span>;
  return <span className={styles.pill} data-state="pending">Open</span>;
}

export function RequestList({
  requests,
  base,
  view,
  q = "",
  selectedId = null,
}: {
  requests: PilotRequestRow[];
  base: string;
  view: RequestView;
  q?: string;
  selectedId?: string | null;
}) {
  if (requests.length === 0) return null;

  return (
    <ul className={styles.reqList}>
      {requests.map((r) => (
        <li key={r.id}>
          <a
            href={requestHref(base, r.id, view, q)}
            className={styles.reqRow}
            aria-current={r.id === selectedId ? "true" : undefined}
            data-handled={r.handledAt ? "" : undefined}
          >
            <span className={styles.reqTop}>
              <span className={styles.rowName}>{r.company}</span>
              <RequestStatus r={r} />
            </span>
            <span className={styles.reqDecision}>{r.decision}</span>
            <span className={styles.rowMeta}>
              {r.name} · {when(r.createdAt)}
              {r.replies.length ? ` · ${r.replies.length} ${r.replies.length === 1 ? "reply" : "replies"}` : ""}
              {r.notes ? " · notes" : ""}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
