// MANAGER home, the Dashboard: how fast ideas are decided, where the waiting goes, and whether shipped work paid off.
import { DashboardBoard } from "@/components/dashboard/shared/DashboardBoard";
import { getT } from "@/i18n/server";
export async function generateMetadata() {
  return { title: (await getT())("shell.navDashboard") };
}
export default function DashboardPage() {
  return <DashboardBoard />;
}
