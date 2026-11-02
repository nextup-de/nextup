// Shared view. Problems: ?id= selects a row (search results and cross-links land here).
import { ProblemsView } from "@/components/dashboard/shared/ProblemsView";
import { getT } from "@/i18n/server";
export async function generateMetadata() {
  return { title: (await getT())("shell.navProblems") };
}
export default async function ProblemsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <ProblemsView key={id ?? ""} initialId={id} />;
}
