// The manager's old address: the Dashboard lives at /dashboard now.
import { redirect } from "next/navigation";
import { companyPrefix } from "@/features/tenant/urls";
export default async function ManagerPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  redirect(companyPrefix(company) + "/dashboard");
}
