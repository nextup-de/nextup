// The team leader's old address: every role reaches its inbox at /inbox now (plan INB, D3). ?id= stays.
import { redirect } from "next/navigation";
import { companyPrefix } from "@/features/tenant/urls";
export default async function LeaderInboxPage({ params, searchParams }: { params: Promise<{ company: string }>; searchParams: Promise<{ id?: string }> }) {
  const [{ company }, { id }] = await Promise.all([params, searchParams]);
  redirect(companyPrefix(company) + "/inbox" + (id ? "?id=" + encodeURIComponent(id) : ""));
}
