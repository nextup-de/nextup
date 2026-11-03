// The idea-management KPI report (MET D20): managers only, fixed periods, small units hidden.
import { notFound } from "next/navigation";
import { KpisView } from "@/components/metrics/KpisView";
import { getT } from "@/i18n/server";
import { kpisData } from "@/lib/db/pilot-report";
import { companyAdminOf } from "@/server/actions/settings/guard";

export async function generateMetadata() {
  return { title: (await getT())("kpis.title") };
}

export default async function KpisPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const admin = await companyAdminOf(company);
  if (!admin) notFound();
  return <KpisView slug={company} initial={await kpisData(admin.companyId, "year")} />;
}
