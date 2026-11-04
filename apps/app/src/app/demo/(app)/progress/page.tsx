// The old address: Progress is a tab of Projects now.
import { redirect } from "next/navigation";
import { staticDemoPrefix } from "@/features/tenant/urls";
export default function DemoOldProgressPage() {
  redirect(staticDemoPrefix() + "/projects/progress");
}
