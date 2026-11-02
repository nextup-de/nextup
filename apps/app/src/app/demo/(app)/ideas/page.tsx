// Linked from the overview and the inbox, on the static demo's data.
import { getT } from "@/i18n/server";
import IdeasPage from "@/app/[company]/(app)/ideas/page";
export async function generateMetadata() {
  return { title: (await getT())("demo.titleIdeas") };
}
export default IdeasPage;
