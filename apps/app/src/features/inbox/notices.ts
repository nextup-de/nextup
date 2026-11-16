// The notices under the inbox list (plan INB, D5), as the page shows them (Kevin, 16 Nov 2026: a notice you can only mark
// as read is a dead end, and one that repeats a row of the list above makes you wonder which to act on).
import type { InboxItem } from "./types";

/** A notice as the page shows it: plain values, so it crosses from the server page. `subjectId` is the case or project it is about. */
export type NoticeView = { id: string; subject: string; text: string; link: string | null; subjectId: string | null; createdAt: string; read: boolean };

type Row = { id: string; template: string; subject: string; text: string; link: string | null; data?: unknown; createdAt: Date; readAt: Date | null };

const subjectOf = (data: unknown): string | null => {
  const v = data && typeof data === "object" ? (data as { subjectId?: unknown; caseId?: unknown }) : {};
  return typeof v.subjectId === "string" ? v.subjectId : typeof v.caseId === "string" ? v.caseId : null;
};

/**
 * A stored notice for the page. A notice written before it carried its link (every loop notice until 16 Nov 2026) opens
 * the case or project it is about, so none is left with only "Mark as read".
 */
export function noticeView(n: Row): NoticeView {
  const subjectId = subjectOf(n.data);
  const area = n.template.startsWith("loop.case.") ? "cases" : n.template.startsWith("loop.project.") ? "projects" : null;
  const link = n.link ?? (subjectId && area ? `/${area}/${encodeURIComponent(subjectId)}` : null);
  return { id: n.id, subject: n.subject, text: n.text, link, subjectId, createdAt: n.createdAt.toISOString(), read: n.readAt !== null };
}

/** The notices to list: not those about a case or project that is a row of the list above, so each ask is shown once. */
export function noticesBesideItems(notices: readonly NoticeView[], items: readonly InboxItem[]): NoticeView[] {
  const open = new Set(items.flatMap((i) => [i.caseId, i.projectId].filter((x): x is string => typeof x === "string")));
  return notices.filter((n) => n.subjectId === null || !open.has(n.subjectId));
}
