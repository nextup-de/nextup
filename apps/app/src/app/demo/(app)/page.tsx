// The demo opens on the raise page, where the demo script starts.
import { redirect } from "next/navigation";
import { staticDemoPrefix } from "@/features/tenant/urls";
export default function DemoIndex() {
  redirect(staticDemoPrefix() + "/raise");
}
