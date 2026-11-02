// What I sent, on the static demo's data.
import { getT } from "@/i18n/server";
import TeamSentPage from "@/app/[company]/(app)/team/page";
export async function generateMetadata() {
  return { title: (await getT())("demo.titleSent") };
}
export default TeamSentPage;
