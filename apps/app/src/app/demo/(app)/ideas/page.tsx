// The Ideas tab's Mine in the static demo: the ideas I raised and where each stands. An old link with ?id= still goes to the Feed.
import { redirect } from "next/navigation";
import { MineView } from "@/components/ideas/MineView";
import { staticDemoPrefix } from "@/features/tenant/urls";
import { getT } from "@/i18n/server";
export async function generateMetadata() {
  return { title: (await getT())("ideas.mineTitle") };
}
export default async function DemoIdeasPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  if (id) redirect(staticDemoPrefix() + "/feed?id=" + encodeURIComponent(id));
  return <MineView />;
}
