// The one inbox on the static demo's data (dev panel -> Viewing as). The demo has no notices.
import { InboxPage } from "@/components/inbox/InboxPage";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("inbox.title") };
}

export default async function DemoInboxPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <InboxPage key={id ?? ""} initialId={id} notices={[]} />;
}
