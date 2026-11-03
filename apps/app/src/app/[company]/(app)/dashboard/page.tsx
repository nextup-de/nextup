// MANAGER home, the Dashboard: the wait ledger per unit and role against a baseline (MET D19, D21).
// The query names only `unit` and one of the fixed periods. With a database and a signed-in manager the numbers
// come from the log (companyAdminOf first); without either, the board counts the browser's own log.
import { DashboardBoard } from "@/components/dashboard/shared/DashboardBoard";
import { hasDatabase } from "@/lib/db/mode";
import { dashboardData } from "@/lib/db/metrics";
import { companyAdminOf } from "@/server/actions/settings/guard";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT())("shell.navDashboard") };
}

const KINDS = ["30d", "quarter", "golive"] as const;
type Kind = (typeof KINDS)[number];

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ company?: string }>;
  searchParams: Promise<{ unit?: string; period?: string }>;
}) {
  const [{ company }, sp] = await Promise.all([params, searchParams]);
  const kind: Kind = (KINDS as readonly string[]).includes(sp.period ?? "") ? (sp.period as Kind) : "30d";
  const unitId = typeof sp.unit === "string" && sp.unit !== "" ? sp.unit : null;
  const viewer = hasDatabase() && company ? await companyAdminOf(company) : null;
  const data = viewer ? await dashboardData(viewer.companyId, { kind, unitId }) : null;
  return <DashboardBoard data={data} slug={viewer ? company ?? null : null} kind={kind} unitId={unitId} />;
}
