import { redirect } from "next/navigation";
import { companyPrefix } from "@/features/tenant/urls";
export default async function SettingsIndexPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  redirect(`${companyPrefix(company)}/settings/company`);
}
