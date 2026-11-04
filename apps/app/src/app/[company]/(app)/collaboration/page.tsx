// The old address: Collaboration is a tab of Projects now.
import { redirect } from "next/navigation";
import { companyPrefix } from "@/features/tenant/urls";
export default async function OldCollaborationPage({ params, searchParams }: { params: Promise<{ company: string }>; searchParams: Promise<{ id?: string }> }) {
  const [{ company }, { id }] = await Promise.all([params, searchParams]);
  redirect(companyPrefix(company) + "/projects/collaboration" + (id ? "?id=" + encodeURIComponent(id) : ""));
}
