// The print view of one report week, styled for A4 (PIL D11). The browser saves it as PDF.
import { notFound } from "next/navigation";
import { PilotReport } from "@/components/settings/PilotReport";
import { hasDatabase } from "@/lib/db/client";
import { companyAdminOf } from "@/server/actions/settings/guard";
import { loadPilotReport } from "../load";

export const dynamic = "force-dynamic";

export default async function PilotReportPrintPage({ params, searchParams }: {
  params: Promise<{ company: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { company } = await params;
  if (!hasDatabase() || !process.env.AUTH_SECRET) notFound();
  const viewer = await companyAdminOf(company);
  if (!viewer) notFound();
  const week = (await searchParams).week;
  const { view } = await loadPilotReport(company, viewer.companyId, typeof week === "string" ? week : undefined);
  return <PilotReport view={{ ...view, csvHref: null, printHref: null }} print />;
}
