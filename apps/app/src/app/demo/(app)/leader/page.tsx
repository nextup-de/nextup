// The team leader's inbox, on the static demo's data (dev panel -> Viewing as).
import { getT } from "@/i18n/server";
import LeaderInboxPage from "@/app/[company]/(app)/leader/page";
export async function generateMetadata() {
  return { title: (await getT())("demo.titleInbox") };
}
export default LeaderInboxPage;
