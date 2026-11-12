// The one inbox: what is asked of the signed-in person, and their notices. The items are derived in the browser from
// the same state the leader inbox reads (components/inbox/InboxPage); only the notices come from the database.
import { InboxPage, type NoticeView } from "@/components/inbox/InboxPage";
import { getViewerFor } from "@/features/auth/session";
import { getT } from "@/i18n/server";
import { hasDatabase } from "@/lib/db/client";
import { listNotices } from "@/lib/db/notices";

export async function generateMetadata() {
  return { title: (await getT())("inbox.title") };
}

type Props = { params: Promise<{ company: string }>; searchParams: Promise<{ id?: string }> };

export default async function InboxRoute({ params, searchParams }: Props) {
  const [{ company }, { id }] = await Promise.all([params, searchParams]);
  const viewer = hasDatabase() ? await getViewerFor(company) : null;
  const rows = viewer ? await listNotices(viewer.companyId, viewer.userId) : [];
  const notices: NoticeView[] = rows.map((n) => ({ id: n.id, subject: n.subject, text: n.text, link: n.link, createdAt: n.createdAt.toISOString(), read: n.readAt !== null }));
  return <InboxPage key={id ?? ""} initialId={id} notices={notices} />;
}
