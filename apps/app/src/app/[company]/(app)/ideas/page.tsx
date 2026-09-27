// Shared view. Ideas: ?id= selects a row (search results and cross-links land here).
import { IdeasView } from "@/components/dashboard/shared/IdeasView";
export const metadata = { title: "Ideas" };
export default async function IdeasPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <IdeasView key={id ?? ""} initialId={id} />;
}
