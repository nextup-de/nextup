// TEAM LEADER home. Open items addressed to me sorted by age; one action each: yes / no+why / hand over / ask one question.
import { InboxView } from "@/components/dashboard/leader/InboxView";
import { getT } from "@/i18n/server";
export async function generateMetadata() {
  return { title: (await getT())("shell.navInbox") };
}
export default async function LeaderInboxPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <InboxView key={id ?? ""} initialId={id} />;
}
