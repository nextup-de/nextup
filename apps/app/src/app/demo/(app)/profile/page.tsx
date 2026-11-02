// The profile menu's "My profile", on the static demo's data.
import { getT } from "@/i18n/server";
import MyProfilePage from "@/app/[company]/(app)/profile/page";
export async function generateMetadata() {
  return { title: (await getT())("demo.titleProfile") };
}
export default MyProfilePage;
