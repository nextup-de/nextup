// The old address: Progress is a tab of Projects now.
import { redirect } from "next/navigation";
import { companyPrefix } from "@/features/tenant/urls";
export default async function OldProgressPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  redirect(companyPrefix(company) + "/projects/progress");
}
