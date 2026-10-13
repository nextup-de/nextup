// The Overview (route /dashboard). Every problem and idea in the company: open since, on whose desk (and every desk before), stage, score.
import { DashboardView } from "@/components/dashboard/team/DashboardView";
export const metadata = { title: "Overview" };
export default function DashboardPage() {
  return <DashboardView />;
}
