// A person's notices in the app (plan INB, decision D5): the `inapp` rows of the outbox. They are written as sent by
// the planner and never delivered; readAt says the person read one. Scoped by company and by the viewer.
import { getDb } from "@/lib/db/client";

export type NoticeRow = { id: string; template: string; subject: string; text: string; link: string | null; createdAt: Date; readAt: Date | null };

/** The viewer's own notices in this company, newest first. */
export async function listNotices(companyId: string, userId: string, { limit = 50 }: { limit?: number } = {}): Promise<NoticeRow[]> {
  return getDb().outboxMessage.findMany({
    where: { companyId, recipientUserId: userId, channel: "inapp" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: { id: true, template: true, subject: true, text: true, link: true, createdAt: true, readAt: true },
  });
}

/** Mark the viewer's unread notices read: the given ones, or all of them. Never another person's. Returns how many changed. */
export async function markNoticesRead(companyId: string, userId: string, ids?: string[], now: Date = new Date()): Promise<number> {
  if (ids && ids.length === 0) return 0;
  const r = await getDb().outboxMessage.updateMany({
    where: { companyId, recipientUserId: userId, channel: "inapp", readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: now },
  });
  return r.count;
}
