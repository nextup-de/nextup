// The old address of the setup wizard. Setup has its own pages now; this keeps old links working.
import { redirect } from "next/navigation";
import { companyPrefix } from "@/features/tenant/urls";

export default async function OldSetupPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  redirect(`${companyPrefix(company)}/setup`);
}
