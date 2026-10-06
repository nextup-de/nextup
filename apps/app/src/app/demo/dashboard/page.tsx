// The dashboard, where the idea just published shows up. A row opens the case at its own address.
import { DashboardView } from "@/components/dashboard/team/DashboardView";
export const metadata = { title: "Dashboard" };
export default function DemoDashboardPage() {
  return <DashboardView linkCases />;
}
