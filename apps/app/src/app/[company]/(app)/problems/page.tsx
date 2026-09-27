// Shared view. Problems: ?id= selects a row (search results and cross-links land here).
import { ProblemsView } from "@/components/dashboard/shared/ProblemsView";
export const metadata = { title: "Problems" };
export default async function ProblemsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <ProblemsView key={id ?? ""} initialId={id} />;
}
