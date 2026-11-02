// Linked from the overview and the inbox, on the static demo's data.
import { getT } from "@/i18n/server";
import ProblemsPage from "@/app/[company]/(app)/problems/page";
export async function generateMetadata() {
  return { title: (await getT())("demo.titleProblems") };
}
export default ProblemsPage;
