// The old ideas list read only the seed. The Feed shows every idea and problem from the real cases.
import { redirect } from "next/navigation";
import { companyPrefix } from "@/features/tenant/urls";
export default async function IdeasPage({ params, searchParams }: { params: Promise<{ company: string }>; searchParams: Promise<{ id?: string }> }) {
  const [{ company }, { id }] = await Promise.all([params, searchParams]);
  redirect(companyPrefix(company) + "/feed" + (id ? "?id=" + encodeURIComponent(id) : ""));
}
