// Nobody logs in to the static demo: "Log out" in the profile menu (and /login on a stack that is the
// demo) lands on its raise page.
import { redirect } from "next/navigation";
import { staticDemoPrefix } from "@/features/tenant/urls";
export default function DemoLogin() {
  redirect(staticDemoPrefix() + "/raise");
}
