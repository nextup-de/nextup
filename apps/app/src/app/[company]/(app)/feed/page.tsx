// Shared view. The Feed: every problem and idea this viewer may see, as cards to browse and back.
// ?id= opens one in place.
import { FeedView } from "@/components/dashboard/team/FeedView";
import { getT } from "@/i18n/server";
export async function generateMetadata() {
  return { title: (await getT())("shell.navFeed") };
}
export default async function FeedPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <FeedView key={id ?? ""} initialId={id} />;
}
