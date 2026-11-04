// The old problems list: the Feed shows every idea and problem.
import { redirect } from "next/navigation";
import { staticDemoPrefix } from "@/features/tenant/urls";
export default async function DemoProblemsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  redirect(staticDemoPrefix() + "/feed" + (id ? "?id=" + encodeURIComponent(id) : ""));
}
