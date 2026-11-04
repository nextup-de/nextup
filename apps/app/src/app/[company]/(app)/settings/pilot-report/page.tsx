// Settings -> Pilot report: one week of the pilot's numbers, company admins only (PIL D11).
import { notFound } from "next/navigation";
import { PilotReport } from "@/components/settings/PilotReport";
import { getT } from "@/i18n/server";
import { hasDatabase } from "@/lib/db/client";
import { companyAdminOf } from "@/server/actions/settings/guard";
import { loadPilotReport } from "./load";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: (await getT())("settingsPilotReport.navLabel") };
}

export default async function PilotReportPage({ params, searchParams }: {
  params: Promise<{ company: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { company } = await params;
  const t = await getT();
  if (!hasDatabase() || !process.env.AUTH_SECRET) return <><h1>{t("settingsPilotReport.title")}</h1><p>{t("settingsPilotReport.noDatabase")}</p></>;
  const viewer = await companyAdminOf(company);
  if (!viewer) notFound();
  const week = (await searchParams).week;
  const { view } = await loadPilotReport(company, viewer.companyId, typeof week === "string" ? week : undefined);
  return <PilotReport view={view} />;
}
