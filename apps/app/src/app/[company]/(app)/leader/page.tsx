// TEAM LEADER home. Open items addressed to me sorted by age; one action each: yes / no+why / hand over / ask one question.
import { InboxView } from "@/components/dashboard/leader/InboxView";
export const metadata = { title: "Inbox" };
export default async function LeaderInboxPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <InboxView key={id ?? ""} initialId={id} />;
}
