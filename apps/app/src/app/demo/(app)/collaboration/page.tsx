// Linked from the overview, on the static demo's data.
import { getT } from "@/i18n/server";
import CollaborationPage from "@/app/[company]/(app)/collaboration/page";
export async function generateMetadata() {
  return { title: (await getT())("demo.titleCollaboration") };
}
export default CollaborationPage;
