// The Feed in the static demo: every problem and idea on the made-up board, as cards. ?id= opens one in place.
import { getT } from "@/i18n/server";
import { FeedView } from "@/components/dashboard/team/FeedView";
export async function generateMetadata() {
  return { title: (await getT())("demo.titleFeed") };
}
export default async function DemoFeedPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <FeedView key={id ?? ""} initialId={id} />;
}
