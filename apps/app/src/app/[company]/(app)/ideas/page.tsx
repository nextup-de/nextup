// The Ideas tab's Mine: the ideas I raised and where each stands (components/ideas/MineView). An old link with ?id=
// (a seed idea) still goes to the Feed.
import { redirect } from "next/navigation";
import { MineView } from "@/components/ideas/MineView";
import { companyPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";
export async function generateMetadata() {
  return { title: (await getT())("ideas.mineTitle") };
}
export default async function IdeasPage({ params, searchParams }: { params: Promise<{ company: string }>; searchParams: Promise<{ id?: string }> }) {
  const [{ company }, { id }] = await Promise.all([params, searchParams]);
  if (id) redirect(companyPrefix(company) + "/feed?id=" + encodeURIComponent(id));
  return <MineView />;
}
