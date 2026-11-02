// Linked from the overview, on the static demo's data.
import { getT } from "@/i18n/server";
import ProgressPage from "@/app/[company]/(app)/progress/page";
export async function generateMetadata() {
  return { title: (await getT())("demo.titleProgress") };
}
export default ProgressPage;
