// Settings -> Audit log: every change made to the company's setup, newest first, company admins only (GDP D13).
import { notFound } from "next/navigation";
import { AuditLog } from "@/components/settings/AuditLog";
import { parseAuditFilter } from "@/features/audit/view";
import { loadAuditPage } from "@/server/actions/settings/audit";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("settingsAudit.navLabel") };
}

export default async function AuditSettingsPage({
  params, searchParams,
}: { params: Promise<{ company: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { company } = await params;
  const filter = parseAuditFilter(await searchParams);
  const data = await loadAuditPage(company, filter);
  if (!data) notFound();
  return <AuditLog slug={company} filter={filter} data={data} />;
}
