// One case, in the dashboard's case overview: "Open the case" after publishing, and every row of the
// dashboard, land here. An unknown id shows the dashboard.
import { getT } from "@/i18n/server";
import { DashboardView } from "@/components/dashboard/team/DashboardView";
export async function generateMetadata() {
  return { title: (await getT())("demo.titleCase") };
}
export default async function DemoCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <DashboardView key={caseId} caseId={caseId} linkCases />;
}
