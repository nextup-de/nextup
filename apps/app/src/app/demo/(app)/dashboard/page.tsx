// The manager's Dashboard, on the static demo's data (dev panel -> Viewing as).
import { getT } from "@/i18n/server";
import DashboardPage from "@/app/[company]/(app)/dashboard/page";
export async function generateMetadata() {
  return { title: (await getT())("demo.titleDashboard") };
}
export default DashboardPage;
