import { notFound, redirect } from "next/navigation";
import { setupStep } from "@/features/settings/sections";
import { companyPrefix } from "@/features/tenant/urls";
import { hasDatabase } from "@/lib/db/client";
import { loadSetupCounts } from "@/lib/db/setup-counts";
import { companyAdminOf } from "@/server/actions/settings/guard";

export default async function SettingsIndexPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  let target = "company";
  if (hasDatabase() && process.env.AUTH_SECRET) {
    const admin = await companyAdminOf(company);
    if (!admin) notFound();
    if (setupStep(await loadSetupCounts(admin.companyId)) !== "done") target = "setup";
  }
  redirect(`${companyPrefix(company)}/settings/${target}`);
}
