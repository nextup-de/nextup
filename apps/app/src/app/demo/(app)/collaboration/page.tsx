// The old address: Collaboration is a tab of Projects now.
import { redirect } from "next/navigation";
import { staticDemoPrefix } from "@/features/tenant/urls";
export default async function DemoOldCollaborationPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  redirect(staticDemoPrefix() + "/projects/collaboration" + (id ? "?id=" + encodeURIComponent(id) : ""));
}
