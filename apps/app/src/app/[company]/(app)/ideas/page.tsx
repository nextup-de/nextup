// Shared view. Ideas: ?id= selects a row (search results and cross-links land here).
import { IdeasView } from "@/components/dashboard/shared/IdeasView";
import { getT } from "@/i18n/server";
export async function generateMetadata() {
  return { title: (await getT())("shell.navIdeas") };
}
export default async function IdeasPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <IdeasView key={id ?? ""} initialId={id} />;
}
