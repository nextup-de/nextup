// "My reports": what this person sent with the bug icon, and what the NextUp team answered.
// docs/PLATFORM_PLAN.md, "Tickets". Replies arrive through server/tickets-sync.ts.
import { redirect } from "next/navigation";
import { getViewerFor } from "@/features/auth/session";
import { companyPrefix } from "@/features/tenant/urls";
import { hasDatabase } from "@/lib/db/client";
import { ticketsOf } from "@/lib/db/tickets";
import { ReportsView } from "@/components/report/ReportsView";

export const metadata = { title: "My reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  if (!hasDatabase()) return <ReportsView tickets={[]} screenshotBase={null} offline />;
  const viewer = await getViewerFor(company);
  if (!viewer) redirect(companyPrefix(company) + "/login?next=/reports");
  const tickets = await ticketsOf(viewer.companyId, viewer.userId);
  return <ReportsView tickets={tickets} screenshotBase={`/api/${company}/tickets`} offline={false} />;
}
