// One idea or problem, open, on the static demo's data.
import { getT } from "@/i18n/server";
import IdeaPage from "@/app/[company]/(app)/idea/page";
export async function generateMetadata() {
  return { title: (await getT())("projects.hubIdeas") };
}
export default IdeaPage;
