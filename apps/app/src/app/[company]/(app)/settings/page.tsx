import { redirect } from "next/navigation";
import { companyPrefix } from "@/features/tenant/urls";

// Settings holds the results; setup has its own pages. The layout checks who is asking.
export default async function SettingsIndexPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  redirect(`${companyPrefix(company)}/settings/company`);
}
